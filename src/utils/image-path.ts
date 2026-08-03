import { statSync } from 'node:fs';
import { resolve, isAbsolute, sep } from 'node:path';

/**
 * 判断 src 是否为远程 URL（http:// 或 https://）或 data: 内联图
 */
export function isRemoteOrDataUrl(src: string): boolean {
  return (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:')
  );
}

/**
 * 将 md 正文里出现的 <img src> 相对路径解析为本地文件系统绝对路径。
 *
 * 一处权威实现，供 publish 与 preview 复用，避免反模式：
 * - 早期 publish 以 process.cwd() 为基准 → 见 #68
 * - 早期 preview 三处字符串裸拼 → 见 #69
 *
 * @param baseDir  基准目录（news 模式应为 md 文件所在目录的绝对路径）
 * @param src      渲染后 HTML 中 <img src> 的原始值（可能含 URL 编码、./ 前缀、../ 上跳）
 * @returns 解析后的绝对路径；若文件不存在则返回 null（由调用方决定是否可见化失败）
 */
export function resolveLocalImagePath(baseDir: string, src: string): string | null {
  if (isRemoteOrDataUrl(src)) return null;

  const decoded = (() => {
    try {
      return decodeURIComponent(src);
    } catch {
      return src;
    }
  })();

  // 绝对路径直接按原值 stat，不依赖 baseDir
  const candidate = isAbsolute(decoded) ? decoded : resolve(baseDir, decoded.replace(/^\.\/+/, ''));

  if (fileExists(candidate)) return candidate;

  // 兜底：用户 src 可能本身就是相对 CWD 的、或编码两次，试一次未解码原值
  const fallback = isAbsolute(src) ? src : resolve(baseDir, src.replace(/^\.\/+/, ''));
  if (fallback !== candidate && fileExists(fallback)) return fallback;

  return null;
}

/**
 * 跨平台文件存在性检查（含符号链接）
 *
 * statSync 不抛错即视为存在；如返回的 stats 含 isFile/isSymbolicLink 方法，
 * 则进一步校验为文件或符号链接（避免指向目录的场景被误当作图片）。
 */
function fileExists(p: string): boolean {
  try {
    const stats = statSync(p);
    if (typeof stats.isFile === 'function' || typeof stats.isSymbolicLink === 'function') {
      return stats.isFile() || stats.isSymbolicLink();
    }
    // 测试 mock 下 stats 可能是 plain object，statSync 未抛错即视为存在
    return true;
  } catch {
    return false;
  }
}

/**
 * 规范化用于日志的路径展示（统一分隔符为 POSIX）
 */
export function normalizeForLog(p: string): string {
  return p.split(sep).join('/');
}
