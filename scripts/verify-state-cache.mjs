import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'packages/extension/package.json'));
const { build } = require('esbuild');
let playwright;
try { playwright = require('playwright'); } catch {
  const cache = join(homedir(), '.npm/_npx');
  const candidates = readdirSync(cache).map(dir => join(cache, dir, 'node_modules/playwright/index.js'));
  candidates.push(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright/index.js'));
  const candidate = candidates.find(existsSync);
  if (!candidate) throw new Error('Playwright is required to run this verification');
  playwright = createRequire(candidate)('playwright');
}
const temp = mkdtempSync(join(tmpdir(), 'opensider-vscode-cache-'));
const outfile = join(temp, 'test.js');
await build({ stdin: { contents: `import './chrome-shim'; import { setStateScope, loadState, saveState } from './persist'; globalThis.cacheTest = { setStateScope, loadState, saveState };`, resolveDir: join(root, 'packages/extension/src/sidepanel') }, bundle: true, outfile, platform: 'browser' });
const server = createServer((req, res) => {
  res.setHeader('content-type', req.url === '/test.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/test.js' ? readFileSync(outfile) : '<script src="/test.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await playwright.chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async () => {
    const { setStateScope, loadState, saveState } = globalThis.cacheTest;
    const now = new Date().toISOString();
    const payload = title => ({ version: 1, locale: 'en', theme: 'dark', savedAt: now, selectedId: 's', selectedProviderId: 'copilot', onboardingCompleted: true, sessions: [{ id: 's', title, createdAt: now, updatedAt: now, todos: [], messages: [{ id: 'm', role: 'assistant', createdAt: now, durationMs: 1, content: [{ type: 'text', text: 'synthetic history '.repeat(100000) }] }] }] });
    localStorage.setItem('opensider-vscode/state:/project-a', JSON.stringify(payload('A')));
    setStateScope('/project-a');
    const migrated = await loadState();
    const settingsBytes = localStorage.getItem('opensider-vscode/state:/project-a').length;
    setStateScope('/project-b');
    await saveState(payload('B'));
    setStateScope('/project-a');
    const a = await loadState();
    const first = payload('first');
    const last = payload('last');
    await Promise.all([saveState(first), saveState(last)]);
    const latest = await loadState();
    return { migrated: migrated.sessions[0].title, length: migrated.sessions[0].messages[0].content[0].text.length, settingsBytes, a: a.sessions[0].title, latest: latest.sessions[0].title };
  });
  assert.equal(result.migrated, 'A');
  assert.equal(result.length, 1800000);
  assert.ok(result.settingsBytes < 4096);
  assert.equal(result.a, 'A');
  assert.equal(result.latest, 'last');
  console.log('ok legacy transcript migration, workspace isolation, latest-write ordering', result);
  await page.reload();
  const title = await page.evaluate(async () => { cacheTest.setStateScope('/project-a'); return (await cacheTest.loadState()).sessions[0].title; });
  assert.equal(title, 'last');
  console.log('ok IndexedDB history survives reload');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
