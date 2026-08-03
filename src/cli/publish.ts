import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, extname, basename } from 'node:path';
import { Command } from 'commander';
import { globbySync } from 'globby';
import { getCredential, getServerConfig } from '../config/credential.js';
import { WechatClientError } from '../wechat/client.js';
import { renderArticle } from '../renderer/index.js';
import { extractImageSrcs, replaceImageSrcs, extractFirstImage } from '../renderer/images.js';
import { parseFrontmatter } from '../schema/frontmatter.js';
import { resolveLocalImagePath, normalizeForLog } from '../utils/image-path.js';

type Brand<T, B> = T & { __brand: B };
type CdnUrl = Brand<string, 'cdn-url'>;
type MediaId = Brand<string, 'media-id'>;

const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 20;
const MAX_TITLE_LENGTH = 32;

export interface PublishOptions {
  title: string;
  content: string;
  images: string[];
  author?: string;
  digest?: string;
  server?: string;
  appId?: string;
  appSecret?: string;
  apiKey?: string;
}

interface DraftResult {
  media_id: string;
  created_at: string;
  success: true;
  /** 路径解析失败或文件不存在的图片 src 列表（用于排查预览/发布时图片静默失效，见 #68） */
  failedImages?: string[];
}

export function registerPublishCommand(program: Command): void {
  const cmd = program
    .command('publish')
    .description('发布到公众号草稿箱（支持图片消息和图文消息）')
    .option('--type, -T <choice>', '文章类型: news（长文）| newspic（图片消息，默认）。传 --md 时自动从 frontmatter type 识别')
    .option('--title, -t <string>', '标题（必填，最长 32 字）')
    .option('--content, -c <string>', '正文内容（newspic 为纯文本，news 为 Markdown）')
    .option('--md, -m <path>', 'Markdown 文件路径（news 模式，与 --content 二选一）')
    .option('--images, -i <path...>', '图片路径列表（newspic 模式必填，支持 glob）')
    .option('--theme <string>', '排版主题（news 模式，默认 default）')
    .option('--hl-theme <string>', '代码高亮主题（news 模式）')
    .option('--theme-file <path>', '自定义主题 CSS 文件路径（news 模式，与 --theme 配合使用）')
    .option('--author, -a <string>', '作者')
    .option('--digest, -d <string>', '摘要（仅 newspic）')
    .option('--server, -s <url>', '中转服务器地址')
    .option('--app-id <string>', '微信 APP_ID')
    .option('--app-secret <string>', '微信 APP_SECRET')
    .option('--api-key <string>', '中转服务器 API Key')
    .option('--dry-run', '验证模式：处理但不实际调用微信 API')
    .action(handlePublish);
}

export async function handlePublish(options: Record<string, string | string[] | boolean>): Promise<void> {
  let type = (options.type as string) || '';
  const dryRun = !!options.dryRun;

  // Auto-detect type from frontmatter if --md provided and no explicit --type
  if (!type && options.md) {
    const mdPath = String(options.md);
    if (existsSync(mdPath)) {
      try {
        const raw = readFileSync(mdPath, 'utf-8');
        const { frontmatter } = parseFrontmatter(raw, { strict: false });
        if (frontmatter.type === 'article') type = 'news';
      } catch {
        // fall through to default
      }
    }
  }

  if (!type) type = 'newspic';

  if (type === 'news') {
    await handleNewsPublish(options, dryRun);
  } else {
    await handleNewspicPublish(options, dryRun);
  }
}

async function handleNewsPublish(options: Record<string, string | string[] | boolean>, dryRun: boolean): Promise<void> {
  const theme = (options.theme as string) || 'default';
  const hlTheme = options.hlTheme as string | undefined;
  const themeFile = options.themeFile ? resolve(String(options.themeFile)) : undefined;

  if (themeFile) {
    if (!existsSync(themeFile)) {
      console.error(`错误：主题文件不存在: ${themeFile}`);
      process.exit(1);
    }
    const ext = extname(themeFile).toLowerCase();
    if (ext !== '.css') {
      console.error(`错误：主题文件必须是 .css 格式，当前: ${ext}`);
      process.exit(1);
    }
  }

  const title = String(options.title || '').trim();
  // #68: 以 md 文件所在目录为基准解析正文/封面相对路径，而非 process.cwd()
  const mdPath = options.md ? resolve(String(options.md)) : undefined;
  const mdDir = mdPath ? dirname(mdPath) : resolve(process.cwd());
  const mdContent = options.md
    ? readFileSync(mdPath!, 'utf-8')
    : String(options.content || '').trim();

  // 渲染 Markdown
  const rendered = await renderArticle({ content: mdContent, theme, hlTheme, themeFile });

  // 标题优先级: --title > frontmatter title
  const finalTitle = title || rendered.title || '';
  validateTitle(finalTitle);

  if (!rendered.content) {
    console.error('错误：渲染后内容为空');
    process.exit(1);
  }

  const cred = dryRun
    ? { appId: '', appSecret: '' }
    : getCredential({
        appId: options.appId as string | undefined,
        appSecret: options.appSecret as string | undefined,
      });

  const { serverUrl: fileServerUrl, apiKey: fileApiKey } = getServerConfig();
  const serverUrl = (options.server as string) || process.env.WECHAT_SERVER_URL || process.env.WX_NEWSPIC_SERVER || fileServerUrl || '';
  const apiKey = (options.apiKey as string) || process.env.WECHAT_API_KEY || process.env.WX_NEWSPIC_API_KEY || fileApiKey || '';

  const result = await executeNewsPublish({
    title: finalTitle,
    content: rendered.content,
    cover: rendered.cover,
    author: rendered.author || (options.author as string | undefined),
    sourceUrl: rendered.source_url,
    digest: rendered.digest,
    needOpenComment: rendered.need_open_comment,
    onlyFansCanComment: rendered.only_fans_can_comment,
    serverUrl,
    apiKey,
    appId: cred.appId,
    appSecret: cred.appSecret,
    dryRun,
    baseDir: mdDir,
  });

  console.log(JSON.stringify(result, null, 2));
}

async function handleNewspicPublish(options: Record<string, string | string[] | boolean>, dryRun: boolean): Promise<void> {
  const title = String(options.title || '').trim();
  const content = String(options.content || '').trim();
  const imageArgs = Array.isArray(options.images) ? options.images : [String(options.images)];

  validateTitle(title);
  validateContent(content);

  const imagePaths = resolveImagePaths(imageArgs);
  validateImages(imagePaths);

  const cred = dryRun
    ? { appId: '', appSecret: '' }
    : getCredential({
        appId: options.appId as string | undefined,
        appSecret: options.appSecret as string | undefined,
      });

  const { serverUrl: fileServerUrl, apiKey: fileApiKey } = getServerConfig();
  const serverUrl = (options.server as string) || process.env.WECHAT_SERVER_URL || process.env.WX_NEWSPIC_SERVER || fileServerUrl || '';
  const apiKey = (options.apiKey as string) || process.env.WECHAT_API_KEY || process.env.WX_NEWSPIC_API_KEY || fileApiKey || '';

  const result = await executeNewspicPublish({
    title,
    content,
    imagePaths,
    author: options.author as string | undefined,
    digest: options.digest as string | undefined,
    serverUrl,
    apiKey,
    appId: cred.appId,
    appSecret: cred.appSecret,
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
}

export function validateTitle(title: string): void {
  if (!title) {
    console.error('错误：标题不能为空');
    process.exit(1);
  }
  if (title.length > MAX_TITLE_LENGTH) {
    console.error(`错误：标题不能超过 ${MAX_TITLE_LENGTH} 个字，当前 ${title.length} 个字`);
    process.exit(1);
  }
}

export function validateContent(content: string): void {
  if (!content) {
    console.error('错误：正文不能为空');
    process.exit(1);
  }
}

export function resolveImagePaths(args: string[]): string[] {
  const paths: string[] = [];

  for (const arg of args) {
    const resolved = globbySync(arg, { onlyFiles: true });
    if (resolved.length > 0) {
      paths.push(...resolved);
    } else {
      try {
        statSync(arg);
        paths.push(arg);
      } catch {
        console.error(`错误：未找到匹配的图片: ${arg}`);
        process.exit(1);
      }
    }
  }

  return [...new Set(paths)].sort();
}

export function validateImages(imagePaths: string[]): void {
  if (imagePaths.length === 0) {
    console.error('错误：至少需要一张图片');
    process.exit(1);
  }

  if (imagePaths.length > MAX_IMAGE_COUNT) {
    console.error(`错误：图片数量不能超过 ${MAX_IMAGE_COUNT} 张，当前 ${imagePaths.length} 张`);
    process.exit(1);
  }

  for (const imgPath of imagePaths) {
    try {
      statSync(imgPath);
    } catch {
      console.error(`错误：图片文件不存在: ${imgPath}`);
      process.exit(1);
    }

    const ext = extname(imgPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      console.error(`错误：不支持的图片格式 "${ext}"，仅支持 PNG/JPEG/JPG/GIF: ${imgPath}`);
      process.exit(1);
    }

    const stats = statSync(imgPath);
    if (stats.size > MAX_IMAGE_SIZE) {
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.error(`错误：图片超过 10MB 限制 (${sizeMB}MB): ${imgPath}`);
      process.exit(1);
    }
  }
}

export async function executeNewspicPublish(params: {
  title: string;
  content: string;
  imagePaths: string[];
  author?: string;
  digest?: string;
  serverUrl: string;
  apiKey: string;
  appId: string;
  appSecret: string;
  dryRun?: boolean;
}): Promise<DraftResult> {
  const { title, content, imagePaths, author, digest, serverUrl, apiKey, dryRun } = params;

  if (!serverUrl && !dryRun) {
    throw new WechatClientError(
      'SERVER_URL_MISSING',
      '未指定中转服务器地址。请通过 --server 参数或 WECHAT_SERVER_URL 环境变量指定。',
    );
  }

  const baseUrl = serverUrl?.replace(/\/+$/, '') || '';
  const authHeaders: Record<string, string> = apiKey
    ? { 'Authorization': `Bearer ${apiKey}` }
    : {};

  const imageMediaIds: string[] = [];

  for (const imagePath of imagePaths) {
    const buffer = readFileSync(imagePath);
    const blob = new Blob([buffer]);

    if (dryRun) {
      console.log(`[dry-run] 图片已读取: ${imagePath} (${buffer.length} bytes)`);
      imageMediaIds.push(`dry-run-img-${imageMediaIds.length + 1}`);
      continue;
    }

    const formData = new FormData();
    formData.append('image', blob, safeBasename(imagePath));

    const uploadRes = await fetch(`${baseUrl}/api/wechat/upload-image`, {
      method: 'POST',
      headers: { ...authHeaders },
      body: formData,
    });

    const uploadResult = await uploadRes.json() as { success: boolean; data?: { image_media_id: string }; error?: { code: string; message: string } };

    if (!uploadResult.success || !uploadResult.data) {
      throw new WechatClientError(
        uploadResult.error?.code || 'UPLOAD_FAILED',
        uploadResult.error?.message || `图片上传失败: ${imagePath}`,
      );
    }

    imageMediaIds.push(uploadResult.data.image_media_id);
  }

  if (dryRun) {
    console.log(`[dry-run] 草稿体准备完毕: { title: "${title}", images: ${imageMediaIds.length} }`);
    return {
      media_id: 'dry-run',
      created_at: new Date().toISOString(),
      success: true,
    };
  }

  const draftBody = {
    article_type: 'newspic',
    title,
    content,
    author,
    digest,
    image_list: imageMediaIds.map((id) => ({ image_media_id: id })),
    need_open_comment: 0,
    only_fans_can_comment: 0,
  };

  const draftRes = await fetch(`${baseUrl}/api/wechat/create-draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(draftBody),
  });

  const draftResult = await draftRes.json() as {
    success: boolean;
    data?: { media_id: string; created_at: string };
    error?: { code: string; message: string };
  };

  if (!draftResult.success || !draftResult.data) {
    throw new WechatClientError(
      draftResult.error?.code || 'DRAFT_FAILED',
      draftResult.error?.message || '创建草稿失败',
    );
  }

  return {
    media_id: draftResult.data.media_id,
    created_at: draftResult.data.created_at,
    success: true,
  };
}

/** @deprecated 使用 executeNewspicPublish */
export const executePublish = executeNewspicPublish;

export async function executeNewsPublish(params: {
  title: string;
  content: string;
  cover?: string;
  author?: string;
  sourceUrl?: string;
  digest?: string;
  needOpenComment?: boolean;
  onlyFansCanComment?: boolean;
  serverUrl: string;
  apiKey: string;
  appId: string;
  appSecret: string;
  dryRun?: boolean;
  /**
   * 解析正文/封面相对图片路径的基准目录。
   * #68: 必须为 md 文件所在目录，否则从非 md 目录执行发布会导致图片静默跳过。
   */
  baseDir?: string;
}): Promise<DraftResult> {
  const { title, content, cover, author, sourceUrl, digest, needOpenComment, onlyFansCanComment, serverUrl, apiKey, dryRun, baseDir } = params;
  const imageBaseDir = baseDir ?? process.cwd();

  if (!serverUrl && !dryRun) {
    throw new WechatClientError(
      'SERVER_URL_MISSING',
      '未指定中转服务器地址。请通过 --server 参数或 WECHAT_SERVER_URL 环境变量指定。',
    );
  }

  const baseUrl = serverUrl?.replace(/\/+$/, '') || '';
  const authHeaders: Record<string, string> = apiKey
    ? { 'Authorization': `Bearer ${apiKey}` }
    : {};

  // 提取 HTML 中的图片并上传
  const imageSrcs = extractImageSrcs(content);
  // #55: 如果 cover 是本地路径且不在 imageSrcs 中，加入上传队列
  if (cover && !imageSrcs.includes(cover)) {
    imageSrcs.push(cover);
  }
  // 两个 map 分别服务不同用途，类型层面不可互换：
  // - srcToCdnUrl → 用于 <img src> 替换（需 CDN URL）
  // - srcToMediaId → 用于 thumb_media_id 查找（需微信 media_id）
  const srcToCdnUrl: Record<string, CdnUrl> = {};
  const srcToMediaId: Record<string, MediaId> = {};
  // #68: 路径解析失败的图片不再静默 continue，收集起来在结果中可见
  const failedImages: string[] = [];

  for (const src of imageSrcs) {
    if (src.startsWith('data:')) continue;

    let imagePath: string;
    if (src.startsWith('http://') || src.startsWith('https://')) {
      if (dryRun) {
        console.log(`[dry-run] 跳过远程图片下载: ${src}`);
        const idx = Object.keys(srcToCdnUrl).length + 1;
        srcToCdnUrl[src] = `dry-run-img-${idx}` as CdnUrl;
        srcToMediaId[src] = `dry-run-img-${idx}` as MediaId;
        continue;
      }
      imagePath = await downloadImage(src);
    } else {
      // #68: 路径基准由 CWD 改为 baseDir（md 文件所在目录）
      const resolved = resolveLocalImagePath(imageBaseDir, src);
      if (!resolved) {
        const base = normalizeForLog(imageBaseDir);
        console.warn(`[warn] 图片不存在，跳过上传: src="${src}" baseDir="${base}"`);
        failedImages.push(src);
        continue;
      }
      imagePath = resolved;
    }

    const buffer = readFileSync(imagePath);
    const blob = new Blob([buffer]);

    if (dryRun) {
      console.log(`[dry-run] 图片已读取: ${imagePath} (${buffer.length} bytes)`);
      const idx = Object.keys(srcToCdnUrl).length + 1;
      srcToCdnUrl[src] = `dry-run-img-${idx}` as CdnUrl;
      srcToMediaId[src] = `dry-run-img-${idx}` as MediaId;
      continue;
    }

    const formData = new FormData();
    formData.append('image', blob, safeBasename(imagePath));

    const uploadRes = await fetch(`${baseUrl}/api/wechat/upload-image`, {
      method: 'POST',
      headers: { ...authHeaders },
      body: formData,
    });

    const uploadResult = await uploadRes.json() as { success: boolean; data?: { image_media_id: string; url: string }; error?: { code: string; message: string } };

    if (!uploadResult.success || !uploadResult.data) {
      throw new WechatClientError(
        uploadResult.error?.code || 'UPLOAD_FAILED',
        uploadResult.error?.message || `图片上传失败: ${src}`,
      );
    }

    srcToCdnUrl[src] = uploadResult.data.url as CdnUrl;
    srcToMediaId[src] = uploadResult.data.image_media_id as MediaId;
  }

  // 替换 <img src> 为 CDN URL
  const htmlContent = replaceImageSrcs(content, srcToCdnUrl);

  // 确定封面
  let thumbMediaId: string | undefined;
  if (cover && srcToMediaId[cover]) {
    thumbMediaId = srcToMediaId[cover];
  } else {
    const firstSrc = extractFirstImage(content);
    if (firstSrc && srcToMediaId[firstSrc]) {
      thumbMediaId = srcToMediaId[firstSrc];
    }
  }

  if (dryRun) {
    console.log(`[dry-run] 草稿体准备完毕: { title: "${title}", images: ${imageSrcs.length}, thumb: ${thumbMediaId || 'none'} }`);
    if (failedImages.length > 0) {
      console.warn(`[dry-run] ${failedImages.length} 张图片路径解析失败: ${failedImages.map((s) => `"${s}"`).join(', ')}`);
    }
    return {
      media_id: 'dry-run',
      created_at: new Date().toISOString(),
      success: true,
      failedImages: failedImages.length > 0 ? failedImages : undefined,
    };
  }

  const draftBody: Record<string, unknown> = {
    article_type: 'news',
    title,
    content: htmlContent,
    author,
    need_open_comment: needOpenComment != null ? (needOpenComment ? 1 : 0) : 1,
    only_fans_can_comment: onlyFansCanComment != null ? (onlyFansCanComment ? 1 : 0) : 0,
  };
  if (sourceUrl) {
    draftBody.content_source_url = sourceUrl;
  }
  if (digest) {
    draftBody.digest = digest;
  }
  if (thumbMediaId) {
    draftBody.thumb_media_id = thumbMediaId;
  }

  const draftRes = await fetch(`${baseUrl}/api/wechat/create-draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(draftBody),
  });

  const draftResult = await draftRes.json() as {
    success: boolean;
    data?: { media_id: string; created_at: string };
    error?: { code: string; message: string };
  };

  if (!draftResult.success || !draftResult.data) {
    throw new WechatClientError(
      draftResult.error?.code || 'DRAFT_FAILED',
      draftResult.error?.message || '创建草稿失败',
    );
  }

  return {
    media_id: draftResult.data.media_id,
    created_at: draftResult.data.created_at,
    success: true,
  };
}

export function safeBasename(filePath: string): string {
  const ext = extname(filePath);
  const hash = createHash('md5').update(filePath).digest('hex').slice(0, 8);
  return `img-${hash}${ext}`;
}

async function downloadImage(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpFile = `/tmp/wx-newspic-${Date.now()}-${basename(url)}`;
  writeFileSync(tmpFile, buffer);
  return tmpFile;
}
