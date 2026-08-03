/**
 * #69: preview 前端使用的图片路径处理纯函数。
 *
 * 这些函数同时被：
 * - 单测 import 做回归保护
 * - template.ts 通过源码字符串注入到前端 `<script>` 中
 *
 * 注意：函数体内不得引用模块作用域变量（否则 toString 注入后会 ReferenceError）。
 */

export function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function toProxyUrl(absPath: string): string {
  return '/image-proxy?path=' + encodeURIComponent(absPath);
}

/**
 * 将 md 中相对 `<img src>` 解析为 image-proxy URL
 * - 处理 `./` 前缀
 * - 处理反斜杠 → 正斜杠（Windows 兼容）
 * - 规范化多余斜杠
 */
export function resolveToProxy(fileDir: string, src: string): string {
  // 反复去除 ./ 前缀，处理 ././assets/x 这类多重前缀
  let cleaned = src.replace(/\\/g, '/');
  while (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  }
  const normalizedDir = fileDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const combined = (normalizedDir + '/' + cleaned).replace(/\/{2,}/g, '/');
  return toProxyUrl(combined);
}

/**
 * HTML 属性转义（防 srcdoc 断裂）
 * 仅转义属性值中必须转义的三个字符：& " <
 * （> 在属性值内不需要转义，HTML 规范允许）
 */
export function escapeHtmlAttr(value: string): string {
  return String(value)
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/</g, '<');
}

/**
 * 把所有函数序列化为前端可执行的 `<script>` 源码
 *
 * 注：使用 `.toString()` 取函数体，import 时函数已编译为 JS（无 TS 注解）。
 */
export function serializePreviewUtils(): string {
  return [isRemoteUrl, toProxyUrl, resolveToProxy, escapeHtmlAttr]
    .map((fn) => `var ${fn.name} = ${fn.toString()};`)
    .join('\n');
}
