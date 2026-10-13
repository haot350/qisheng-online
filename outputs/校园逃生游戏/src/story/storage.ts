import type {StoryCheckpoint} from './types';
import {validateStoryCheckpoint} from './session.ts';

export class StorySaveStore {
  private database:Promise<IDBDatabase>|null=null;
  private open(){
    if(!this.database)this.database=new Promise<IDBDatabase>((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new Error('浏览器未提供本机存档。可以导出文件保存进度。'));return;}const r=indexedDB.open('qisheng-story-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('checkpoints');r.onsuccess=()=>resolve(r.result);r.onerror=()=>{this.database=null;reject(new Error('无法打开本机故事存档。'));};});
    return this.database;
  }
  async save(value:StoryCheckpoint){
    const checkpoint=validateStoryCheckpoint(value),db=await this.open();
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('checkpoints','readwrite'),store=tx.objectStore('checkpoints'),r=store.get('current');r.onsuccess=()=>{if(r.result)store.put(r.result,'previous');store.put(checkpoint,'current');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('本机存档空间不足或写入失败，请导出进度。'));tx.onabort=()=>reject(new Error('本机存档写入被中断。'));});
  }
  async load(previous=false):Promise<StoryCheckpoint|null>{
    const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('checkpoints','readonly'),r=tx.objectStore('checkpoints').get(previous?'previous':'current');r.onsuccess=()=>{try{resolve(r.result?validateStoryCheckpoint(r.result):null);}catch(e){reject(e);}};r.onerror=()=>reject(new Error('无法读取故事存档。'));});
  }
  async close(){const db=await this.database?.catch(()=>null);db?.close();this.database=null;}
}
