import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { topics } from '../dist/data.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let testServer;
if(!process.env.MAP_URL){
  const {createServer}=await import('../lab/server.mjs');
  testServer=createServer().server;
  await new Promise(resolve=>testServer.listen(0,'127.0.0.1',resolve));
}
const base = process.env.MAP_URL || `http://127.0.0.1:${testServer.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('artifacts', { recursive: true });
try {
  await page.goto(base);
  await page.getByRole('button', { name: /Inbox Point.*тем/ }).click();
  await page.getByRole('button', { name: /Все темы/ }).click();
  await page.locator('#inlineSearch').fill('React');
  assert(await page.locator('.topic-row').count() > 0);
  await page.locator('.topic-row').first().click();
  await page.getByRole('button', { name: '✓ Могу объяснить', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть разбор' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('project-map-review-v1')));
  assert(Object.values(saved).some(v => v.status === 'done'));
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать прогресс ↓' }).click();
  const download = await downloadEvent;
  const downloaded = await download.path();
  await page.evaluate(() => localStorage.removeItem('project-map-review-v1'));
  await page.reload();
  await page.locator('#importProgress').setInputFiles(downloaded);
  await page.getByRole('status').filter({ hasText: 'Прогресс восстановлен' }).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('project-map-review-v1'))), saved);
  await page.locator('#importProgress').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"progress":[]}') });
  await page.getByRole('status').filter({ hasText: 'Не удалось прочитать' }).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('project-map-review-v1'))), saved);
  await page.locator('.top-review-btn').click();
  await page.getByRole('button', { name: '40 минут · один проект', exact: true }).click();
  await page.keyboard.press('Space');
  await page.locator('.review-answer').waitFor();
  await page.keyboard.press('2');
  await page.getByRole('button', { name: 'Самопроверка', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /Открыть разбор и исходники/ }).count(), 0);
  await page.keyboard.press('Space');
  assert.equal(await page.getByRole('button', { name: /Открыть разбор и исходники/ }).count(), 1);
  const commercial = page.locator('[data-action="project"][data-project="lanit"]');
  if (await commercial.count()) {
    await commercial.click();
    await page.getByRole('button', { name: 'Карта проекта', exact: false }).click();
    await page.getByRole('button', { name: 'Начать маршрут ↗' }).click();
    await page.locator('.story-boundaries').waitFor();
    await page.getByRole('button', { name: 'Следующий шаг →', exact: true }).click();
    await page.getByRole('button', { name: 'Закрыть разбор' }).click();
  }
  await page.screenshot({ path: 'artifacts/map-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobileMenu').click();
  await page.locator('[data-action="project"][data-project="inbox"]').click();
  await page.getByRole('button', { name: 'Начать маршрут ↗' }).click();
  await page.getByRole('button', { name: 'Показать ориентир', exact: true }).click();
  assert(await page.locator('#details .answer').isVisible());
  await page.screenshot({ path: 'artifacts/map-mobile.png', animations: 'disabled' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  await page.locator('#searchInput').fill('Inbox Point');
  assert(await page.locator('.search-result').count() > 0);
  await page.keyboard.press('Escape');
  for(const path of new Set(topics.flatMap(t=>(t.code||[]).map(([path])=>path)))){
    const response=await context.request.get(base+'/source/'+path);
    assert.equal(response.status(),200,path);
    assert.match(response.headers()['content-type'],/text\/plain/);
    assert((await response.text()).length>20,path);
  }
  await page.goto(base+'/lab/?section=rules');
  await page.getByRole('heading',{name:'Правила сортировки',exact:true}).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS map browser: search, route, keyboard, progress export/import/error, sessions, desktop/mobile');
} finally { await browser.close(); if(testServer)await new Promise(resolve=>testServer.close(resolve)); }
