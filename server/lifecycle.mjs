// Connection leases avoid relying on timers in background/suspended browser tabs.
export function createLifecycle({onIdle,idleMs=15000,startupMs=90000}={}){
  const clients=new Set();let timer,seen=false,stopping=false;
  function schedule(delay){clearTimeout(timer);timer=setTimeout(()=>{if(!clients.size&&!stopping){stopping=true;Promise.resolve(onIdle()).catch(error=>console.error('Shutdown failed:',error.message));}},delay);timer.unref?.();}
  schedule(startupMs);
  return {
    reserve(){if(!clients.size&&!stopping)schedule(seen?idleMs:startupMs);},
    handle(req,res){
      if(new URL(req.url,'http://localhost').pathname!=='/api/lifecycle')return false;
      if(req.method!=='GET'){res.writeHead(405);res.end();return true;}
      if(stopping){res.writeHead(503);res.end();return true;}
      clearTimeout(timer);seen=true;clients.add(res);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});
      res.write('retry: 1000\n\ndata: connected\n\n');
      const heartbeat=setInterval(()=>res.write(': alive\n\n'),15000);heartbeat.unref?.();
      res.once('close',()=>{clearInterval(heartbeat);clients.delete(res);if(!clients.size&&!stopping)schedule(idleMs);});
      return true;
    },
    dispose(){stopping=true;clearTimeout(timer);for(const res of clients)res.end();clients.clear();},
  };
}
