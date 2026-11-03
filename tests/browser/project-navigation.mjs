import {startBrowserScenario} from '../helpers/browser.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const {server,base,browser,context,page,errors,close}=await startBrowserScenario();

mkdirSync('artifacts/ui-refresh',{recursive:true});
async function visibleTitle(){
 await page.locator('.topic-title').waitFor();
 await page.waitForFunction(()=>{const r=document.querySelector('.topic-title').getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;});
 assert.equal(await page.locator('.topic-row').count(),0);assert.equal(await page.locator('#inlineSearch').count(),0);
}
try{
 await page.goto(base+'/#/projects');await page.locator('.topic-row').first().waitFor();
 await page.screenshot({path:'artifacts/ui-refresh/projects-desktop.png',fullPage:false});
 await page.getByLabel('Раздел',{exact:true}).selectOption({label:'Сценарии'});await page.locator('#inlineSearch').fill('');
 const item=page.locator('.topic-row').last(),id=await item.getAttribute('data-topic-id'),title=await item.locator('strong').innerText();
 await item.click();await visibleTitle();assert.equal(await page.locator('.topic-title').innerText(),title);
 await page.screenshot({path:'artifacts/ui-refresh/reader-desktop.png',fullPage:false});
 await page.reload();await visibleTitle();assert.equal(await page.locator('.topic-title').innerText(),title);
 await page.getByRole('navigation',{name:'В этом разборе',exact:true}).getByRole('button',{name:/Реализация в коде/}).click();
 const code=page.locator('[data-section=code]>h3');assert(await code.evaluate(el=>el.getBoundingClientRect().top>=0&&el.getBoundingClientRect().top<innerHeight));
 await page.locator('[data-action=back-to-topics]').click();await page.locator('.topic-row').first().waitFor();assert.equal(await page.getByLabel('Раздел',{exact:true}).inputValue(),'Сценарии');assert.equal(await page.locator('#inlineSearch').inputValue(),'');
 const returned=page.locator(`[data-topic-id="${id}"]`);assert(await returned.evaluate(el=>el===document.activeElement));
 await returned.press('Enter');await visibleTitle();await page.goBack();await returned.waitFor();assert.equal(await page.getByLabel('Раздел',{exact:true}).inputValue(),'Сценарии');
 await page.locator('#inlineSearch').fill('ежеднев');await page.locator('.topic-row').first().click();await visibleTitle();await page.reload();await visibleTitle();await page.locator('[data-action=back-to-topics]').click();assert.equal(await page.locator('#inlineSearch').inputValue(),'ежеднев');
 await page.goto(base+'/#/projects');await page.locator('[data-action=mode][data-mode=map]').click();await page.locator('.route-topics a').first().click();await visibleTitle();await page.locator('.route-navigation .platform-button').last().click();await page.reload();await visibleTitle();await page.getByRole('button',{name:'← К маршруту',exact:true}).click();await page.locator('#projectRoute').waitFor();assert((await page.locator('.route-topics li').count())>1);
 await page.goto(base+'/#/projects?projectTopic=missing-topic');await page.getByRole('heading',{name:'Тема не найдена',exact:true}).waitFor();assert.equal(await page.locator('#details').count(),0);
 await page.goto(base+'/#/themes');await page.locator('.knowledge-subgroup').first().waitFor();assert.equal(await page.locator('.knowledge-subgroup[open]').count(),0);await page.screenshot({path:'artifacts/ui-refresh/library-desktop.png',fullPage:false});
 await page.goto(base+'/#/interview');await page.locator('[data-action=daily]').waitFor();await page.screenshot({path:'artifacts/ui-refresh/interview-desktop.png',fullPage:false});
 await page.goto(base+'/#/practice');await page.locator('[data-action=reveal]').click();await page.screenshot({path:'artifacts/ui-refresh/practice-desktop.png',fullPage:false});
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/projects');await page.locator('.topic-row').last().click();await visibleTitle();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'artifacts/ui-refresh/reader-mobile.png',fullPage:false});
 await page.locator('[data-action=back-to-topics]').click();await page.locator('.topic-row').first().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'artifacts/ui-refresh/projects-mobile.png',fullPage:false});
 await page.goto(base+'/#/practice');await page.locator('[data-action=reveal]').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'artifacts/ui-refresh/practice-mobile.png',fullPage:false});
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/#/projects?projectTopic=tr-purpose');await visibleTitle();await page.screenshot({path:'artifacts/ui-refresh/reader-purpose-desktop.png',fullPage:false});
 await page.setViewportSize({width:390,height:844});await page.reload();await visibleTitle();await page.screenshot({path:'artifacts/ui-refresh/reader-purpose-mobile.png',fullPage:false});
 for(const width of [760,850,1024,1280]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/#/projects?projectTopic=tr-purpose');await visibleTitle();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Reader overflow at ${width}px`);
  if(width>760)assert(await page.evaluate(()=>document.querySelector('.platform-header').getBoundingClientRect().right<=document.querySelector('.platform-workspace').getBoundingClientRect().left),'Navigation overlaps reading surface');
  await page.goto(base+'/#/interview');await page.locator('[data-action=daily]').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Interview overflow at ${width}px`);
 }
 assert.deepEqual(errors,[]);console.log('PASS UI workflow: immediate reader, reload, return context/focus, keyboard, outline, invalid link, compact library, five screens, mobile/tablet/desktop');
}finally{await close();}
