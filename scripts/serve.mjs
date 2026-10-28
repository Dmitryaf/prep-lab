// Static app and read-only knowledge index. Corporate sources and preserved data are never served.
import http from 'node:http';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,dirname,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadKnowledge} from './knowledge.mjs';
const root=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../dist'));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
export function createServer({knowledgeRoot=process.env.CAREER_KNOWLEDGE_ROOT||resolve(root,'../../career-knowledge')}={}){
  return http.createServer((req,res)=>{
    const reject=(status)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(status===404?'Страница не найдена':'Запрос не разрешён');};
    if(req.method!=='GET'&&req.method!=='HEAD')return reject(405);
    const host=req.headers.host||'';
    if(!/^127\.0\.0\.1(?::\d+)?$/.test(host)&&!/^localhost(?::\d+)?$/.test(host))return reject(403);
    if(req.headers.origin&&req.headers.origin!==`http://${host}`)return reject(403);
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(p=>p.startsWith('.')))return reject(403);
      if(pathname==='/api/knowledge'){
        let body;let status=200;
        try{body=loadKnowledge(knowledgeRoot);}catch{status=503;body={error:'База знаний недоступна. Проверьте папку career-knowledge или настройку CAREER_KNOWLEDGE_ROOT. Карта проектов продолжает работать.'};}
        res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return res.end(req.method==='HEAD'?undefined:JSON.stringify(body));
      }
      const relative=pathname==='/'?'index.html':pathname.slice(1);
      if(!types[extname(relative)])return reject(404);
      const path=realpathSync(resolve(root,relative));
      if(!path.startsWith(root+sep)||!statSync(path).isFile())return reject(404);
      res.writeHead(200,{'Content-Type':types[extname(path)]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'"});
      res.end(req.method==='HEAD'?undefined:readFileSync(path));
    }catch{return reject(404);}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4173);
  createServer().listen(port,'127.0.0.1',()=>console.log(`Projects Map: http://127.0.0.1:${port}/`));
}
