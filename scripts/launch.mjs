import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,openSync,writeSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {workspaceId} from './workspace.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

export async function probe(base){
  try{
    const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)});
    if(!response.ok)return null;
    const data=await response.json();
    if(data.application!=='projects-map'||data.workspace!==workspaceId)return null;
    const page=await fetch(base+'/',{signal:AbortSignal.timeout(1000)});
    return page.ok&&(await page.text()).includes('id="app"')?data:null;
  }catch{return null;}
}

export async function ensureRunning({port=4173,start}={}){
  const base=`http://127.0.0.1:${port}`;
  if(await probe(base))return {base,reused:true};
  // A free port is claimed by Vite with strictPort. No other process is stopped.
  try{
    const service=await start(port);
    if(!await probe(base)){await service.close();throw Error('Сервер запущен, но проверка готовности не прошла.');}
    return {base,reused:false,service};
  }catch(error){
    // Another double-click may have started the same application concurrently.
    if(await probe(base))return {base,reused:true};
    throw Error(`Не удалось запустить платформу на ${base}. Если порт занят другой программой или старой версией платформы, закройте её и повторите запуск. ${error.message}`);
  }
}

function run(command,args,options={}){
  return new Promise((accept,reject)=>{
    const child=spawn(command,args,{windowsHide:true,...options});
    child.once('error',reject);child.once('exit',code=>code===0?accept():reject(Error(`Команда завершилась с кодом ${code}.`)));
  });
}

async function main(){
  process.chdir(root);
  const logs=resolve(root,'artifacts/launcher');mkdirSync(logs,{recursive:true});
  const log=openSync(resolve(logs,'launch.log'),'a');
  // Hidden launch keeps diagnostics available without a permanent terminal window.
  process.stdout.write=(chunk,encoding,callback)=>{writeSync(log,String(chunk));if(typeof encoding==='function')encoding();else callback?.();return true;};
  process.stderr.write=process.stdout.write;
  try{
    const result=await ensureRunning({start:async port=>{
      if(!existsSync(resolve(root,'node_modules/vite/package.json'))||!existsSync(resolve(root,'node_modules/vue/package.json'))){
        await run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm ci'],{cwd:root,stdio:['ignore',log,log]});
      }
      const {createDevelopmentServer}=await import('./dev.mjs');
      return createDevelopmentServer({port});
    }});
    await run('rundll32.exe',['url.dll,FileProtocolHandler',result.base],{stdio:'ignore'});
    if(result.reused)process.exitCode=0;
  }catch(error){
    const message=`${error.message}\n\nЖурнал: ${resolve(logs,'launch.log')}`;
    process.stderr.write(message+'\n');
    await run('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($env:PROJECTS_MAP_ERROR, 'Projects Map') | Out-Null"],{env:{...process.env,PROJECTS_MAP_ERROR:message},stdio:'ignore'}).catch(()=>{});
    process.exitCode=1;
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
