import { describe, it, expect } from 'vitest';
import { renderArticle } from './index.js';

describe('renderArticle', () => {
  it('renders heading and paragraph', async () => {
    const result = await renderArticle({
      content: '# Hello\n\nThis is a paragraph.',
    });

    expect(result.content).toContain('Hello');
    expect(result.content).toContain('paragraph');
    expect(result.content).toContain('style=');
  });

  it('extracts title from frontmatter', async () => {
    const result = await renderArticle({
      content: '---\ntitle: My Title\ntype: article\ncreated: 2026-06-25\ncover: cover.png\n---\n\n# Not this title\n\nBody',
    });

    expect(result.title).toBe('My Title');
    expect(result.content).toContain('Not this title');
  });

  it('handles empty content', async () => {
    const result = await renderArticle({ content: '' });

    expect(result.content).toBe('');
    expect(result.title).toBe('');
  });

  it('handles content without frontmatter', async () => {
    const result = await renderArticle({ content: 'Just plain text content' });

    expect(result.title).toBe('');
    expect(result.content).toContain('plain text content');
  });

  it('extracts cover from frontmatter', async () => {
    const result = await renderArticle({
      content: '---\ntitle: With Cover\ntype: article\ncreated: 2026-06-25\ncover: https://example.com/cover.jpg\n---\n\nBody',
    });

    expect(result.cover).toBe('https://example.com/cover.jpg');
  });

  it('renders with code block', async () => {
    const result = await renderArticle({
      content: '# Code\n\n```js\nconsole.log("hello");\n```',
    });

    expect(result.content).toContain('hello');
    expect(result.content).toContain('code');
  });

  it('supports custom theme', async () => {
    const result = await renderArticle({
      content: '# Hello\n\nWorld',
      theme: 'default',
    });

    expect(result.content).toContain('style=');
  });

  it('renders image tag', async () => {
    const result = await renderArticle({
      content: '# Img\n\n![alt](https://example.com/img.png)',
    });

    expect(result.content).toContain('<img');
    expect(result.content).toContain('src="https://example.com/img.png"');
  });

  it('does NOT inject description into body (#69)', async () => {
    const result = await renderArticle({
      content: '---\ntitle: Desc\ntype: article\ncreated: 2026-06-25\ncover: cover.png\ndescription: 这是一段引言\n---\n\n正文内容',
    });

    // #69: description 是元数据，不应作为 blockquote 注入正文
    expect(result.content).not.toContain('<blockquote');
    expect(result.content).not.toContain('这是一段引言');
    // description 仍应保留在 frontmatter 返回值里
    expect(result.description).toBe('这是一段引言');
  });

  it('returns all frontmatter fields in result', async () => {
    const result = await renderArticle({
      content: `---
title: 完整字段
type: article
created: 2026-06-25
cover: cover.png
tags: [tag1, tag2]
author: 作者
digest: 摘要
source_url: https://example.com
need_open_comment: true
only_fans_can_comment: false
---

正文`,
    });

    expect(result.tags).toEqual(['tag1', 'tag2']);
    expect(result.author).toBe('作者');
    expect(result.digest).toBe('摘要');
    expect(result.source_url).toBe('https://example.com');
    expect(result.need_open_comment).toBe(true);
    expect(result.only_fans_can_comment).toBe(false);
  });
});
