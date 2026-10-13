import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export const staticPages = ['index', 'school', 'making', 'astra', 'game', 'explore', 'feedback', '404'];

export function stylesheetUrls(html) {
  return [...html.matchAll(/<link\b[^>]*>/g)]
    .filter(([tag]) => /\brel="stylesheet"/.test(tag))
    .map(([tag]) => tag.match(/\bhref="([^"]+)"/)?.[1])
    .filter(Boolean);
}

export async function validateStaticStyles(root) {
  const results = [];
  for (const page of staticPages) {
    const html = await fs.readFile(path.join(root, `${page}.html`), 'utf8');
    const urls = stylesheetUrls(html);
    assert(urls.length, `${page}: missing stylesheet links`);
    const css = (await Promise.all(urls.map(async url => {
      assert(url.startsWith('/') && !url.startsWith('//'), `External stylesheet: ${url}`);
      const file = path.resolve(root, '.' + url.split(/[?#]/)[0]);
      assert(file.startsWith(root + path.sep), `Invalid stylesheet path: ${url}`);
      return fs.readFile(file, 'utf8');
    }))).join('\n');
    const selectors = ['.site-header', '.site-footer', ':root'];
    if (page === 'index') selectors.push('.home-game', '.home-primary');
    if (page === 'game') selectors.push('.game-intro');
    if (page === 'explore') selectors.push('.campus-shell', '.floor-selector');
    if (page === 'feedback') selectors.push('.feedback-panel');
    for (const selector of selectors) assert(css.includes(selector), `${page}: missing ${selector}`);
    results.push({page, stylesheets: urls, selectors});
  }
  return results;
}
