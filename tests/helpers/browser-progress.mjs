import {importState, loadState, storageKey} from '../../src/progress/engine.js';

// Test fixture setup through the real format validator, without a product import UI.
export async function restoreProgressFixture(page, value) {
  const current = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  const next = importState(typeof value === 'string' ? value : JSON.stringify(value), current || loadState({getItem:()=>null}));
  await page.evaluate(({key, value}) => localStorage.setItem(key, JSON.stringify(value)), {key:storageKey, value:next});
  await page.reload();
  await page.locator('#platformMain h1').waitFor();
}
