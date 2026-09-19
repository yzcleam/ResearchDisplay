import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/index.js';
import { logger } from './shared/logger.js';
await pool.query('SELECT 1');
const server=createApp().listen(config.PORT,config.HOST,()=>logger.info({port:config.PORT},'研究资料服务已启动'));
let closing=false;
function shutdown() { if(closing) return; closing=true;server.close(()=>{void pool.end().then(()=>process.exit(0));});setTimeout(()=>process.exit(1),15000).unref(); }
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
