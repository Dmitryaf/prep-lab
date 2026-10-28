import {createServer as createViteServer} from 'vite';
import {createServer as createApiServer} from './serve.mjs';
import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
export async function createDevelopmentServer({port=Number(process.env.PORT||4173),knowledgeRoot}={}){
  const api=createApiServer({knowledgeRoot});await new Promise(r=>api.listen(0,'127.0.0.1',r));
  let vite;
  try{
    vite=await createViteServer({server:{host:'127.0.0.1',port,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${api.address().port}`}}}});
    await vite.listen();
    return {vite,api,async close(){await vite.close();api.closeAllConnections();await new Promise(r=>api.close(r));}};
  }catch(error){api.closeAllConnections();api.close();throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dev=await createDevelopmentServer();dev.vite.printUrls();
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>dev.close());
}
