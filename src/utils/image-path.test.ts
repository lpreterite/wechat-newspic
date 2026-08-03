import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveLocalImagePath, isRemoteOrDataUrl, normalizeForLog } from './image-path.js';

describe('utils/image-path', () => {
  let tmpRoot: string;
  let baseDir: string;
  let subDir: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'wx-newspic-imgpath-'));
    baseDir = join(tmpRoot, 'article');
    subDir = join(baseDir, 'assets');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    mkdirSync(join(tmpRoot, 'shared'), { recursive: true });
    writeFileSync(join(tmpRoot, 'shared', 'cover.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('resolveLocalImagePath', () => {
    it('resolves relative path under baseDir', () => {
      const result = resolveLocalImagePath(baseDir, 'assets/pic.png');
      expect(result).toBe(join(baseDir, 'assets', 'pic.png'));
    });

    it('resolves relative path with leading ./', () => {
      const result = resolveLocalImagePath(baseDir, './assets/pic.png');
      expect(result).toBe(join(baseDir, 'assets', 'pic.png'));
    });

    it('resolves URL-encoded relative path (中文/空格场景)', () => {
      // 写一个中文名文件
      const cnFile = '配图 01.png';
      writeFileSync(join(subDir, cnFile), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const encoded = encodeURIComponent('assets/' + cnFile);
      const result = resolveLocalImagePath(baseDir, encoded);
      expect(result).toBe(join(baseDir, 'assets', cnFile));
    });

    it('resolves ../ up-jump within filesystem bounds', () => {
      const nested = join(baseDir, 'sub');
      mkdirSync(nested, { recursive: true });
      const result = resolveLocalImagePath(nested, '../assets/pic.png');
      expect(result).toBe(join(baseDir, 'assets', 'pic.png'));
    });

    it('resolves absolute path regardless of baseDir', () => {
      const abs = join(subDir, 'pic.png');
      const result = resolveLocalImagePath('/some/other/dir', abs);
      expect(result).toBe(abs);
    });

    it('returns null for non-existent file', () => {
      const result = resolveLocalImagePath(baseDir, 'assets/no-such-file.png');
      expect(result).toBeNull();
    });

    it('returns null for http/https/data URLs', () => {
      expect(resolveLocalImagePath(baseDir, 'https://example.com/a.png')).toBeNull();
      expect(resolveLocalImagePath(baseDir, 'http://example.com/a.png')).toBeNull();
      expect(resolveLocalImagePath(baseDir, 'data:image/png;base64,xxx')).toBeNull();
    });

    it('returns null for invalid URI-encoded fallback gracefully', () => {
      // 含 % 但非合法编码 → decodeURIComponent 抛错 → 走原值 stat → null
      const result = resolveLocalImagePath(baseDir, 'assets/%zz.png');
      expect(result).toBeNull();
    });

    it('does not silently swallow falsy src', () => {
      const result = resolveLocalImagePath(baseDir, '');
      expect(result).toBeNull();
    });

    it('follows symlinks (跨目录软链)', () => {
      const linkPath = join(baseDir, 'link-to-shared');
      try {
        symlinkSync(join(tmpRoot, 'shared'), linkPath, 'dir');
      } catch {
        // 创建符号链接可能因 OS 权限失败，跳过该用例
        return;
      }
      const result = resolveLocalImagePath(baseDir, 'link-to-shared/cover.jpg');
      expect(result).toBe(join(linkPath, 'cover.jpg'));
    });
  });

  describe('isRemoteOrDataUrl', () => {
    it('recognizes http/https/data', () => {
      expect(isRemoteOrDataUrl('https://a.com/b.png')).toBe(true);
      expect(isRemoteOrDataUrl('http://a.com/b.png')).toBe(true);
      expect(isRemoteOrDataUrl('data:image/png;base64,xxx')).toBe(true);
    });
    it('rejects local relative and absolute paths', () => {
      expect(isRemoteOrDataUrl('assets/b.png')).toBe(false);
      expect(isRemoteOrDataUrl('/abs/b.png')).toBe(false);
    });
  });

  describe('normalizeForLog', () => {
    it('replaces platform separator with /', () => {
      // 仅校验函数行为，跨平台测试不改 POSIX 路径
      expect(normalizeForLog(join('a', 'b', 'c'))).toBe('a/b/c');
    });
  });
});
