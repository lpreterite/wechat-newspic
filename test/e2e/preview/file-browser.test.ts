import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createPreviewServer } from '../../../src/preview/server.js';
import type { Server } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const HOST = '127.0.0.1';

describe('preview 文件浏览器 E2E', () => {
  let server: Server;
  let port: number;
  let browser: Browser;
  let page: Page;
  let singleDir: string;
  let multiDir1: string;
  let multiDir2: string;

  beforeAll(async () => {
    singleDir = mkdtempSync(join(tmpdir(), 'e2e-single-'));
    writeFileSync(join(singleDir, 'intro.md'), '# Intro\n\nHello world', 'utf-8');
    writeFileSync(join(singleDir, 'guide.md'), '# Guide\n\nContent', 'utf-8');
    mkdirSync(join(singleDir, 'drafts'));
    writeFileSync(join(singleDir, 'drafts', 'draft-1.md'), '# Draft 1', 'utf-8');
    writeFileSync(join(singleDir, 'logo.png'), 'fake-png');
    // #69: 带相对路径图片的 md + assets 目录
    mkdirSync(join(singleDir, 'assets'));
    writeFileSync(join(singleDir, 'assets', 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    writeFileSync(
      join(singleDir, 'with-image.md'),
      '# Has Image\n\n![alt](assets/pic.png)\n',
      'utf-8',
    );

    multiDir1 = mkdtempSync(join(tmpdir(), 'e2e-multi1-'));
    writeFileSync(join(multiDir1, 'article-a.md'), '# Article A', 'utf-8');

    multiDir2 = mkdtempSync(join(tmpdir(), 'e2e-multi2-'));
    writeFileSync(join(multiDir2, 'article-b.md'), '# Article B', 'utf-8');

    server = await createPreviewServer({
      port: 0,
      host: HOST,
      watchDirs: [singleDir, multiDir1, multiDir2],
    });
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      port = addr.port;
    } else {
      throw new Error('Failed to get server port');
    }

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  });

  afterAll(async () => {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(singleDir, { recursive: true, force: true });
    rmSync(multiDir1, { recursive: true, force: true });
    rmSync(multiDir2, { recursive: true, force: true });
  });

  async function gotoPreview(): Promise<void> {
    await page.goto(`http://${HOST}:${port}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('.file-tree');
      return el && !el.querySelector('.file-tree-loading');
    }, { timeout: 45000 });
  }

  it('E2E-01: 侧栏可见，显示文件树（多目录三个区块）', async () => {
    await gotoPreview();

    const sidebar = page.locator('.file-sidebar');
    expect(await sidebar.isVisible()).toBe(true);
    const classAttr = await sidebar.getAttribute('class');
    expect(classAttr).toContain('expanded');

    const sections = page.locator('.file-tree-section-header');
    expect(await sections.count()).toBe(3);
  });

  it('E2E-02: 侧栏过滤非 .md 文件', async () => {
    await gotoPreview();

    const items = page.locator('.file-tree-item');
    const allTexts = await items.allTextContents();

    expect(allTexts.some((t) => t.includes('logo.png'))).toBe(false);
    expect(allTexts.some((t) => t.includes('intro.md'))).toBe(true);
  });

  it('E2E-03: 点击 .md 文件加载到编辑器并触发预览', async () => {
    await gotoPreview();

    await page.waitForFunction(() => !!(window as any).editor, { timeout: 10000 });

    const introItem = page.locator('.file-tree-item', { hasText: 'intro.md' });
    await introItem.click();
    await page.waitForTimeout(500);

    const editorContent = await page.evaluate(() => (window as any).editor.value());
    expect(editorContent).toContain('# Intro');

    const classAttr = await introItem.getAttribute('class');
    expect(classAttr).toContain('active');

    const srcdoc = await page.evaluate(() => {
      const preview = document.getElementById('preview') as HTMLIFrameElement;
      return preview?.srcdoc || '';
    });
    expect(srcdoc).toContain('Hello');

    const guideItem = page.locator('.file-tree-item', { hasText: 'guide.md' });
    await guideItem.click();
    await page.waitForTimeout(500);

    const guideContent = await page.evaluate(() => (window as any).editor.value());
    expect(guideContent).toContain('# Guide');

    const guideClass = await guideItem.getAttribute('class');
    expect(guideClass).toContain('active');
  });

  it('E2E-04: 侧栏收起/展开', async () => {
    await gotoPreview();

    const sidebar = page.locator('.file-sidebar');

    let classAttr = await sidebar.getAttribute('class');
    expect(classAttr).toContain('expanded');

    await page.locator('.sidebar-toggle').click();
    classAttr = await sidebar.getAttribute('class');
    expect(classAttr).not.toContain('expanded');

    await page.locator('.sidebar-show-btn').click();
    classAttr = await sidebar.getAttribute('class');
    expect(classAttr).toContain('expanded');
  });

  it('E2E-05: 目录展开/折叠', async () => {
    await gotoPreview();

    const draftsItem = page.locator('.file-tree-item', { hasText: 'drafts' });

    expect(await draftsItem.locator('.fa-caret-right').isVisible()).toBe(true);

    await draftsItem.click();
    await page.waitForTimeout(200);

    expect(await draftsItem.locator('.fa-caret-down').isVisible()).toBe(true);

    const draftFile = page.locator('.file-tree-item', { hasText: 'draft-1.md' }).last();
    expect(await draftFile.isVisible()).toBe(true);
  });

  it('截图留底: 侧栏完整视图（供视觉验收对照）', async () => {
    await gotoPreview();
    const firstDir = page.locator('.file-tree-item:has(.fa-folder)').first();
    if (await firstDir.isVisible()) {
      await firstDir.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: 'test/artifacts/sidebar.png', fullPage: true });
    expect(await page.locator('.file-sidebar').isVisible()).toBe(true);
  });

  it('E2E-06 (#69): 点选带图片的 md 后 <img src> 替换为 /image-proxy 代理 URL', async () => {
    await gotoPreview();
    await page.waitForFunction(() => !!(window as any).editor, { timeout: 10000 });

    const imgItem = page.locator('.file-tree-item', { hasText: 'with-image.md' });
    await imgItem.click();
    await page.waitForTimeout(800);

    const srcdoc = await page.evaluate(() => {
      const preview = document.getElementById('preview') as HTMLIFrameElement;
      return preview?.srcdoc || '';
    });
    // 渲染后 <img src> 必须是 /image-proxy?path=... 形态，不是原相对路径
    expect(srcdoc).toContain('/image-proxy?path=');
    expect(srcdoc).not.toMatch(/src="assets\/pic\.png"/);
  });
});