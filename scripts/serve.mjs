// Static map only. Corporate sources and preserved data are never served.
import http from 'node:http';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,dirname,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../dist'));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
export function createServer(){
  return http.createServer((req,res)=>{
    const reject=(status)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(status===404?'Страница не найдена':'Запрос не разрешён');};
    if(req.method!=='GET'&&req.method!=='HEAD')return reject(405);
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(p=>p.startsWith('.')))return reject(403);
      const relative=pathname==='/'?'index.html':pathname.slice(1);
      if(!types[extname(relative)])return reject(404);
      const path=realpathSync(resolve(root,relative));
      if(!path.startsWith(root+sep)||!statSync(path).isFile())return reject(404);
      res.writeHead(200,{'Content-Type':types[extname(path)]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'"});
      res.end(req.method==='HEAD'?undefined:readFileSync(path));
    }catch{return reject(404);}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4173);
  createServer().listen(port,'127.0.0.1',()=>console.log(`Projects Map: http://127.0.0.1:${port}/`));
}
