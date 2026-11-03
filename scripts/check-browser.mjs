import {readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=new URL('../tests/browser/',import.meta.url);
const available=readdirSync(directory).filter(name=>name.endsWith('.mjs')).map(name=>name.slice(0,-4)).sort();
const requested=process.argv.slice(2);
if(requested.length===1&&requested[0]==='--list')console.log(available.join('\n'));
else if(requested.some(name=>!available.includes(name))){
  console.error('Неизвестный сценарий. Доступные имена: '+available.join(', '));
  process.exitCode=1;
}else{
  const selected=requested.length?[...new Set(requested)]:available,failed=[];
  for(const name of selected){
    console.log(`\nПроверка: ${name}`);
    const code=await new Promise(resolve=>{
      const child=spawn(process.execPath,[fileURLToPath(new URL(name+'.mjs',directory))],{cwd:root,stdio:'inherit',windowsHide:true});
      child.once('error',error=>{console.error(error.message);resolve(1);});
      child.once('exit',code=>resolve(code??1));
    });
    if(code!==0)failed.push(name);
  }
  console.log(`\nБраузерные сценарии: ${selected.length-failed.length}/${selected.length}`);
  if(failed.length){console.error('Не прошли: '+failed.join(', '));process.exitCode=1;}
}
