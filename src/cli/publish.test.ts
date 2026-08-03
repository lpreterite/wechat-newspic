import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeNewsPublish } from './publish.js';

/**
 * #68 回归保护：news 模式图片路径解析应基于 md 文件所在目录，而非 process.cwd()
 *
 * 这里只走 dryRun 路径，避免依赖网络与凭证；
 * 通过 failedImages 字段判断哪些 src 解析失败。
 */
describe('executeNewsPublish baseDir 行为（#68）', () => {
  let tmpRoot: string;
  let mdDir: string;
  let otherDir: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'wx-newspic-publish-'));
    mdDir = join(tmpRoot, 'article');
    const assetsDir = join(mdDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, '01.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(assetsDir, '02.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    otherDir = join(tmpRoot, 'other-place');
    mkdirSync(otherDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  /**
   * 构造一段渲染好的 HTML，包含若干 <img src>。
   * 真实渲染输出形如 <img src="assets/01.png" alt="..." style="...">，故这里夹带 style 验证 replace 鲁棒性。
   */
  const html = (srcs: string[]) =>
    srcs.map((s) => `<img src="${s}" alt="alt" style="max-width: 100%;">`).join('');

  it('baseDir=md 文件所在目录时，相对 assets/ 路径全部解析成功', async () => {
    const result = await executeNewsPublish({
      title: 't',
      content: html(['assets/01.png', 'assets/02.png']),
      serverUrl: '',
      apiKey: '',
      appId: '',
      appSecret: '',
      dryRun: true,
      baseDir: mdDir,
    });

    expect(result.success).toBe(true);
    expect(result.failedImages).toBeUndefined();
  });

  it('baseDir=其他目录时，相对 assets/ 路径全部解析失败并返回 failedImages', async () => {
    const result = await executeNewsPublish({
      title: 't',
      content: html(['assets/01.png', 'assets/02.png']),
      serverUrl: '',
      apiKey: '',
      appId: '',
      appSecret: '',
      dryRun: true,
      baseDir: otherDir,
    });

    expect(result.success).toBe(true);
    expect(result.failedImages).toEqual(['assets/01.png', 'assets/02.png']);
  });

  it('未提供 baseDir 时回退到 process.cwd()（行为兼容；#68 后 baseUrl 由调用方负责传入）', async () => {
    // 这里仅校验函数在 baseDir 缺省时不会抛错，且 failedImages 行为符合 cwd 兜底
    const result = await executeNewsPublish({
      title: 't',
      content: html(['this-definitely-not-exists.png']),
      serverUrl: '',
      apiKey: '',
      appId: '',
      appSecret: '',
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.failedImages).toEqual(['this-definitely-not-exists.png']);
  });

  it('URL 编码的中文路径基于 baseDir 正确解析', async () => {
    const cnFile = '配图.png';
    writeFileSync(join(mdDir, 'assets', cnFile), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const encoded = encodeURIComponent('assets/' + cnFile);
    const result = await executeNewsPublish({
      title: 't',
      content: html([encoded]),
      serverUrl: '',
      apiKey: '',
      appId: '',
      appSecret: '',
      dryRun: true,
      baseDir: mdDir,
    });

    expect(result.success).toBe(true);
    expect(result.failedImages).toBeUndefined();
  });

  it('http 远程图片在 dryRun 下不计入 failedImages', async () => {
    const result = await executeNewsPublish({
      title: 't',
      content: html(['https://example.com/a.png']),
      serverUrl: '',
      apiKey: '',
      appId: '',
      appSecret: '',
      dryRun: true,
      baseDir: otherDir,
    });

    expect(result.success).toBe(true);
    expect(result.failedImages).toBeUndefined();
  });

  it('cover 字段相对路径同样基于 baseDir 解析', async () => {
    const result = await executeNewsPublish({
      title: 't',
      content: html(['assets/01.png']),
      cover: 'assets/02.png',
      serverUrl: '',
      apiKey: '',
      appId: '',
      appSecret: '',
      dryRun: true,
      baseDir: mdDir,
    });

    expect(result.success).toBe(true);
    expect(result.failedImages).toBeUndefined();
  });

  it('cover 字段相对路径在错误 baseDir 下进入 failedImages', async () => {
    const result = await executeNewsPublish({
      title: 't',
      content: '<p>no img</p>',
      cover: 'assets/02.png',
      serverUrl: '',
      apiKey: '',
      appId: '',
      appSecret: '',
      dryRun: true,
      baseDir: otherDir,
    });

    expect(result.success).toBe(true);
    expect(result.failedImages).toEqual(['assets/02.png']);
  });
});
