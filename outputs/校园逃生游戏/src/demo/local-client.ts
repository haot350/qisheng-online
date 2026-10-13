import {RankingClient} from '@qisheng/shared/community/client';
export const isLocalDemo=()=>['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const localTransport:typeof fetch=(input,init)=>{
 if(!isLocalDemo())return Promise.reject(new Error('本地演示只能在 localhost 运行。'));
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/v1/'))return Promise.reject(new Error('Demo API must stay on this localhost origin.'));
 return fetch(input,init);
};
export const demoRankingClient=new RankingClient('/api',localTransport);
