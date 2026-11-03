import {launchBrowser} from '../helpers/browser.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from '../../scripts/serve.mjs';
import {headingId} from '../../src/knowledge/markdown.js';

const sourceId='Фронтенд/JavaScript/Навигация';
const targetId='Фронтенд/JavaScript/Материал с пробелами';
const sourceText=`# Проверка учебной навигации
## На этой странице
[Локальный раздел](#На этой странице)
[Относительная заметка](<./Материал с пробелами.md#Пример>)
[[Фронтенд/Javascript/Материал с пробелами#Часть#Деталь|Вложенный раздел]]
[[Фронтенд/JavaScript/Материал с пробелами#Внутри ответа|Закрытый ответ]]
[Внешний источник](https://example.com)
[[HR и самопрезентация/03. Поведенческие ответы|Личная HR-заметка]]
[Резюме](../../Резюме/Личное.md)
[[Собеседования/02. Журнал проверки|Журнал проверки]]
[_meta](../../_meta/Служебное.md)
[Отсутствующий раздел](<./Материал с пробелами.md#Нет такого раздела>)
[[#Неизвестный раздел|Отсутствующий локальный якорь]]`;
const bank={notes:[
  {id:sourceId,path:sourceId+'.md',title:'Проверка учебной навигации',category:'JavaScript',markdown:sourceText},
  {id:targetId,path:targetId+'.md',title:'Учебный материал',category:'JavaScript',markdown:'# Учебный материал\n## Пример\nПояснение.\n## Часть\n### Деталь\nПодробности.\n> [!answer]- Ответ\n> ## Внутри ответа\n> Объяснение.'},
],questions:[],route:[],warnings:[]};
const server=createServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await launchBrowser();
await mkdir('artifacts/final-check',{recursive:true});
try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/knowledge',route=>route.fulfill({json:bank}));
    const origin=base+'/#/themes?note='+encodeURIComponent(sourceId);
    await page.goto(origin);await page.locator('.platform-note h1').waitFor();
    assert.equal(await page.locator('.unavailable-link').count(),6);
    for(const unavailable of await page.locator('.unavailable-link').all()){
      assert((await unavailable.innerText()).includes('недоступно в учебном каталоге'));
      assert.equal(await unavailable.locator('a').count(),0);
      assert.equal(await unavailable.getAttribute('tabindex'),null);
    }
    assert.equal(await page.getByRole('link',{name:'Внешний источник',exact:true}).getAttribute('href'),'https://example.com');
    await page.getByRole('link',{name:'Локальный раздел',exact:true}).click();
    assert(new URLSearchParams(page.url().split('?')[1]).get('heading')==='На этой странице');
    await page.goBack();await page.locator('.platform-note h1').waitFor();
    for(const [name,heading] of [['Относительная заметка','Пример'],['Вложенный раздел','Часть#Деталь'],['Закрытый ответ','Внутри ответа']]){
      const link=page.getByRole('link',{name,exact:true});await link.focus();await page.keyboard.press('Enter');
      await page.getByRole('heading',{name:'Учебный материал',exact:true}).waitFor();
      const query=new URLSearchParams(page.url().split('?')[1]);
      assert.equal(query.get('note'),targetId);assert.equal(query.get('heading'),heading);
      assert(await page.evaluate(id=>Boolean(document.getElementById(id)),headingId(heading)));
      if(name==='Закрытый ответ')assert(await page.locator('.md-callout').evaluate(el=>el.open));
      await page.locator('[data-action=back]').click();await page.getByRole('heading',{name:'Проверка учебной навигации',exact:true}).waitFor();
    }
    assert.equal(await page.getByRole('heading',{name:'Материал недоступен',exact:true}).count(),0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`artifacts/final-check/knowledge-links-${width}.png`,fullPage:true});
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS knowledge links browser: Markdown/wiki, relative and alias paths, anchors, closed answers, unavailable explanations, keyboard, back, desktop/mobile');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
