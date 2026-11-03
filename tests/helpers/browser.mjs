import {createRequire} from 'node:module';
import {createServer} from '../../scripts/serve.mjs';

export async function launchBrowser() {
  const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
  return chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
}

export async function startBrowserScenario({contextOptions={}}={}) {
  const server=createServer();
  let browser,closing;
  const close=()=>closing??= (async()=>{
    try {await browser?.close();}
    finally {
      await server.closeStudyChat();
      server.closeAllConnections();
      if(server.listening)await new Promise(resolve=>server.close(resolve));
    }
  })();
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await launchBrowser();
    const context=await browser.newContext({viewport:{width:1440,height:1000},...contextOptions});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    return {server,base:`http://127.0.0.1:${server.address().port}`,browser,context,page,errors,close};
  } catch(error) {await close();throw error;}
}
