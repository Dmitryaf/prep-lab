import {createDevelopmentServer} from '../../scripts/dev.mjs';
let server;
server=await createDevelopmentServer({port:0,studyChatOptions:process.env.TEST_CHAT_DIR?{directory:process.env.TEST_CHAT_DIR}:undefined,lifecycle:{idleMs:Number(process.env.TEST_IDLE_MS||700),startupMs:Number(process.env.TEST_STARTUP_MS||15000),onIdle:async()=>{await server.close();process.disconnect();}}});
process.send({base:`http://127.0.0.1:${server.vite.httpServer.address().port}`});
