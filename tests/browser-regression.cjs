'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const basePath = '/mama-calendar/';
const oldFiles = new Map();
for (const name of ['index.html', 'app.js', 'schedule.js', 'profiles.js', 'money.js', 'style.css', 'service-worker.js', 'manifest.webmanifest']) {
  oldFiles.set(name, execFileSync('git', ['show', '5a928a6:' + name], { cwd: root }));
}
let legacy = true;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = url.pathname.slice(basePath.length) || 'index.html';
  if (!url.pathname.startsWith(basePath) || name.includes('..')) { res.writeHead(404).end(); return; }
  const file = path.join(root, name);
  const body = legacy ? oldFiles.get(name) : (fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null);
  if (!body) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
const snapshot = page => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]))));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}${basePath}`;
  const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(url);
    assert.notEqual(await page.title(), 'Мой график', 'fixture must reproduce corrupted HTML');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.locator('#empty-add').click();
    await page.locator('#profile-name').fill('Тестовый график');
    await page.locator('#pattern').fill('2/2');
    await page.locator('#anchor').fill('2026-11-17');
    await page.locator('#save-profile').click();
    assert.equal(await page.locator('#profile-title').innerText(), 'Тестовый график');
    const saved = await snapshot(page);
    await page.evaluate(async () => { const cache = await caches.open('unrelated-app-cache'); await cache.put('/unrelated.txt', new Response('keep')); });
    legacy = false;
    const errors = [];
    page.on('pageerror', e => errors.push(e.stack));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(url + '?v=2');
    assert.equal(await page.title(), 'Мой график', 'updated page title is Russian');
    let updated = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const keys = await page.evaluate(() => caches.keys());
      if (keys.includes('my-schedule-mama-v2') && !keys.includes('my-schedule-v1')) { updated = true; break; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(updated, 'v2 must replace v1 offline cache, not just change HTML on server');
    assert.equal(await snapshot(page), saved, 'update must preserve exact localStorage bytes');
    assert.equal(await page.evaluate(() => caches.has('unrelated-app-cache')), true, 'do not wipe another app cache');
    await page.reload();
    assert.equal(await page.locator('#screen-title').innerText(), 'Мой график');
    await page.locator('[data-page="salary"]').click();
    await page.locator('#salary-content details summary').click();
    await page.locator('#salary-day').fill('10');
    await page.locator('#advance-day').fill('25');
    await page.locator('#save-paydays').click();
    assert.equal(await page.locator('#paydays-status').innerText(), 'Плановые дни выплат сохранены.');
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const section of ['calendar', 'people', 'together', 'salary', 'more']) {
        await page.locator(`[data-page="${section}"]`).click();
        const text = await page.locator('body').innerText();
        assert(!/Р[њѕ№і]|С[ЂЃ]|вЂ[”№є¦]|пј‹|[\u0080-\u009f\ufffd]/u.test(text), 'no corrupted visible labels: ' + section);
        const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
        assert(size.content <= size.viewport + 1, `no horizontal overflow at ${width}, ${section}: ${JSON.stringify(size)}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-page="calendar"]').click();
    await page.locator('#grid .day').first().click();
    await page.locator('#override-type').selectOption('О');
    await page.locator('#override-save').click();
    assert.match(await page.locator('#override-status').innerText(), /Исключение сохранено/);
    await page.locator('#close-day').click();
    const afterOverride = await snapshot(page);
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.title(), 'Мой график', 'offline reload must use corrected HTML');
    assert.equal(await snapshot(page), afterOverride, 'offline reload preserves schedule and override');
    assert.equal(await page.locator('#profile-title').innerText(), 'Тестовый график');
    assert.equal(await page.locator('#grid .day.overridden').count(), 1);
    assert.deepEqual(errors, [], 'updated UI has no JS/CSP/network console errors');
    await page.screenshot({ path: process.env.QA_SCREENSHOT || path.join(root, 'tests', 'verified-mobile.png'), fullPage: true });
    console.log('PASS: real v1 → v2 worker migration; exact saved data preserved; Russian UI on all 5 screens at 320/390/430px; override; offline reload; no JS/CSP errors');
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => server.close());
