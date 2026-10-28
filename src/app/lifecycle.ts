export function trackWindow(){
  let connection:EventSource|undefined;
  const connect=()=>{connection??=new EventSource('/api/lifecycle');};
  const disconnect=()=>{connection?.close();connection=undefined;};
  connect();
  window.addEventListener('pagehide',disconnect);
  window.addEventListener('pageshow',connect);
  return ()=>{disconnect();window.removeEventListener('pagehide',disconnect);window.removeEventListener('pageshow',connect);};
}
