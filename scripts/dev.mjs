import {createServer as createViteServer} from 'vite';
import {createServer as createApiServer} from './serve.mjs';
import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
export async function createDevelopmentServer({port=Number(process.env.PORT||4173),knowledgeRoot,lifecycle,studyChatOptions}={}){
  const api=createApiServer({knowledgeRoot,lifecycle,studyChatOptions});await new Promise(r=>api.listen(0,'127.0.0.1',r));
  let vite;
  try{
    vite=await createViteServer({server:{host:'127.0.0.1',port,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${api.address().port}`}}}});
    await vite.listen();
    let closing;
    return {vite,api,close(){return closing??= (async()=>{await api.closeStudyChat();await vite.close();api.closeAllConnections();await new Promise(r=>api.close(r));})();}};
  }catch(error){await vite?.close();api.closeAllConnections();await new Promise(r=>api.close(r));throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dev=await createDevelopmentServer();dev.vite.printUrls();
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>dev.close());
}
