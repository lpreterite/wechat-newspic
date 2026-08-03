import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { JSDOM } from 'jsdom';
import { createWenyanCore, registerAllBuiltInThemes, registerTheme } from '@wenyan-md/core';
import type { Theme } from '@wenyan-md/core';
import type { RenderOptions, RenderedArticle } from './types.js';
import { parseFrontmatter } from '../schema/frontmatter.js';

let coreInstance: Awaited<ReturnType<typeof createWenyanCore>> | null = null;
let themesRegistered = false;

function ensureThemesRegistered(): void {
  if (themesRegistered) return;
  registerAllBuiltInThemes();
  themesRegistered = true;
}

async function getCore(): Promise<Awaited<ReturnType<typeof createWenyanCore>>> {
  if (!coreInstance) {
    ensureThemesRegistered();
    coreInstance = await createWenyanCore({ isWechat: true });
  }
  return coreInstance;
}

const dom = new JSDOM('<!DOCTYPE html>');

export function registerThemeFromFile(themeFile: string, themeId: string): void {
  const css = readFileSync(themeFile, 'utf-8');
  const name = basename(themeFile, '.css');
  const theme: Theme = {
    meta: {
      id: themeId,
      name,
      description: `Custom theme from ${themeFile}`,
      appName: 'wx-newspic',
      author: 'user',
    },
    getCss() {
      return Promise.resolve(css);
    },
  };
  registerTheme(theme);
}

export async function renderArticle(options: RenderOptions): Promise<RenderedArticle> {
  const { content, theme = 'default', hlTheme = 'github-dark', themeFile } = options;

  if (!content) {
    return { content: '', title: '', type: 'article', created: '' };
  }

  if (themeFile) {
    registerThemeFromFile(themeFile, theme);
  }

  const core = await getCore();
  const { frontmatter, content: mdBody } = parseFrontmatter(content, { strict: false });

  // #69: 不再将 frontmatter.description 强注正文。
  // description 是文章元数据（SEO/Open Graph/摘要），不应作为块引用插入正文。
  // 摘要功能由 frontmatter.digest（微信草稿摘要）承担。
  const html = await core.renderMarkdown(mdBody);

  const el = dom.window.document.createElement('div');
  el.id = 'wenyan';
  el.innerHTML = html;

  const styledContent = await core.applyStylesWithTheme(el, {
    themeId: theme,
    hlThemeId: hlTheme,
  });

  return {
    ...frontmatter,
    content: styledContent,
  };
}
