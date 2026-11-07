import type {Response} from 'express';

/** A durable admission can be acknowledged before its cold world is created. */
export function sendQueuedAdmission(
 response:Response,
 view:unknown,
 processQueue:()=>Promise<void>,
 onError:(error:unknown)=>void,
){
 const cancel=()=>response.off('finish',start);
 const start=()=>{
  response.off('close',cancel);
  setImmediate(()=>{void Promise.resolve().then(processQueue).catch(onError);});
 };
 response.once('finish',start);
 response.once('close',cancel);
 response.status(202).json(view);
}
