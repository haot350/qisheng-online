import {createApp} from '../dist/app.js';
import {randomBytes} from 'node:crypto';
const {app}=await createApp({dbPath:':memory:',origins:['http://127.0.0.1:5180','http://localhost:5180'],credentialSecret:randomBytes(32).toString('hex'),serviceSecret:randomBytes(32).toString('hex'),telemetrySecret:randomBytes(32).toString('hex')});
app.addHook('onSend',async(_req,reply,payload)=>{reply.header('X-OpenQS-Profile','demo');return payload;});
app.addHook('onRequest',async(req,reply)=>{
 if(!['127.0.0.1:8792','localhost:8792','127.0.0.1:5180','localhost:5180'].includes(req.headers.host??'')||req.headers.origin&&!['http://127.0.0.1:5180','http://localhost:5180'].includes(req.headers.origin))return reply.code(403).send({error:{code:'DEMO_ORIGIN',message:'本地演示只接受 localhost 请求。',retryable:false}});
 if(!/^\/(?:health$|v1\/(?:accounts(?:\/|$)|identity\/(?:logout$|recent$)|profiles\/))/.test(req.url.split('?')[0]))return reply.code(403).send({error:{code:'DEMO_ONLY',message:'本地演示不提供竞技、排行榜或正式联机准入。',retryable:false}});
});
await app.listen({host:'127.0.0.1',port:8792});console.log('OpenQS localhost in-memory account API ready on 127.0.0.1:8792');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
