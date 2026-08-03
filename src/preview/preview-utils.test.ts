import { describe, it, expect } from 'vitest';
import { isRemoteUrl, toProxyUrl, resolveToProxy, escapeHtmlAttr, serializePreviewUtils } from './preview-utils.js';

describe('preview-utils', () => {
  describe('isRemoteUrl', () => {
    it('识别 http/https URL', () => {
      expect(isRemoteUrl('http://a.com/b.png')).toBe(true);
      expect(isRemoteUrl('https://a.com/b.png')).toBe(true);
    });
    it('拒绝本地相对/绝对路径', () => {
      expect(isRemoteUrl('assets/b.png')).toBe(false);
      expect(isRemoteUrl('/abs/b.png')).toBe(false);
    });
  });

  describe('toProxyUrl', () => {
    it('绝对路径 → /image-proxy?path=<encoded>', () => {
      expect(toProxyUrl('/abs/news/article/assets/01.png')).toBe(
        '/image-proxy?path=%2Fabs%2Fnews%2Farticle%2Fassets%2F01.png',
      );
    });
    it('中文路径正确编码', () => {
      expect(toProxyUrl('/abs/预制娃/配图.png')).toBe(
        '/image-proxy?path=%2Fabs%2F%E9%A2%84%E5%88%B6%E5%A8%83%2F%E9%85%8D%E5%9B%BE.png',
      );
    });
  });

  describe('resolveToProxy (#69 核心逻辑)', () => {
    it('相对路径基于 fileDir 解析', () => {
      expect(resolveToProxy('/abs/article', 'assets/01.png')).toBe(
        '/image-proxy?path=%2Fabs%2Farticle%2Fassets%2F01.png',
      );
    });
    it('处理 ./ 前缀', () => {
      expect(resolveToProxy('/abs/article', './assets/01.png')).toBe(
        '/image-proxy?path=%2Fabs%2Farticle%2Fassets%2F01.png',
      );
    });
    it('处理多个 ./ 前缀（././）', () => {
      expect(resolveToProxy('/abs/article', '././assets/01.png')).toBe(
        '/image-proxy?path=%2Fabs%2Farticle%2Fassets%2F01.png',
      );
    });
    it('反斜杠 → 正斜杠（Windows 兼容）', () => {
      expect(resolveToProxy('C:\\abs\\article', 'assets\\01.png')).toBe(
        '/image-proxy?path=C%3A%2Fabs%2Farticle%2Fassets%2F01.png',
      );
    });
    it('规范化末尾多余斜杠', () => {
      expect(resolveToProxy('/abs/article/', 'assets/01.png')).toBe(
        '/image-proxy?path=%2Fabs%2Farticle%2Fassets%2F01.png',
      );
    });
    it('规范化中间连续斜杠', () => {
      expect(resolveToProxy('/abs//article', 'assets/01.png')).toBe(
        '/image-proxy?path=%2Fabs%2Farticle%2Fassets%2F01.png',
      );
    });
    it('保留 ../ 上跳（由后端 isPathSafe 决定是否拒绝）', () => {
      expect(resolveToProxy('/abs/article/sub', '../assets/01.png')).toBe(
        '/image-proxy?path=%2Fabs%2Farticle%2Fsub%2F..%2Fassets%2F01.png',
      );
    });
    it('中文 fileDir 正确编码', () => {
      expect(resolveToProxy('/abs/预制娃', 'assets/配图.png')).toBe(
        '/image-proxy?path=%2Fabs%2F%E9%A2%84%E5%88%B6%E5%A8%83%2Fassets%2F%E9%85%8D%E5%9B%BE.png',
      );
    });
  });

  describe('escapeHtmlAttr', () => {
    it('转义 & " <（> 不需转义）', () => {
      expect(escapeHtmlAttr('a"b<c>&d')).toBe('a"b<c>&d');
    });
    it('普通 URL 不变', () => {
      expect(escapeHtmlAttr('/image-proxy?path=%2Fabs%2F01.png')).toBe(
        '/image-proxy?path=%2Fabs%2F01.png',
      );
    });
  });

  describe('serializePreviewUtils', () => {
    it('生成前端可执行 <script> 源码，含 4 个函数声明', () => {
      const src = serializePreviewUtils();
      expect(src).toContain('var isRemoteUrl');
      expect(src).toContain('var toProxyUrl');
      expect(src).toContain('var resolveToProxy');
      expect(src).toContain('var escapeHtmlAttr');
      // 函数体应可被 eval，且行为与原函数一致
      // eslint-disable-next-line @typescript-eslint/no-eval
      const scope = eval('(function(){' + src + '; return { isRemoteUrl, toProxyUrl, resolveToProxy, escapeHtmlAttr }; })()');
      expect(scope.isRemoteUrl('https://a.com/b.png')).toBe(true);
      expect(scope.resolveToProxy('/abs', 'a/b.png')).toBe('/image-proxy?path=%2Fabs%2Fa%2Fb.png');
    });
  });
});
