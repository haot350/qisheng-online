import type {Vec3} from './shared/protocol';
export type OnlineContact={id:string;kind:'seen';position:Vec3;left:number}|{id:string;kind:'heard';bearing:number;left:number};
export class OnlineContacts{
 private contacts=new Map<string,OnlineContact>();
 seen(id:string,position:Vec3){this.contacts.set('seen:'+id,{id,kind:'seen',position:[...position],left:3});}
 heard(id:string,bearing:number){if(Number.isFinite(bearing))this.contacts.set('heard:'+id,{id,kind:'heard',bearing,left:3});}
 update(dt:number){for(const [id,c]of this.contacts){c.left-=dt;if(c.left<=0)this.contacts.delete(id);}}
 read(){return [...this.contacts.values()].map(c=>c.kind==='seen'?{...c,position:[...c.position] as Vec3}:{...c});}
 clear(){this.contacts.clear();}
}
