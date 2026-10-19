/** Capability is connection-owned. A drop or reconnect must declare it again. */
export class RematchCapabilities {
 private readonly supported=new WeakSet<object>();
 declare(connection:object,body:unknown){
  if(!body||typeof body!=='object'||Object.keys(body).some(key=>key!=='rematch')||(body as {rematch?:unknown}).rematch!==true)return false;
  if(this.supported.has(connection))return false;this.supported.add(connection);return true;
 }
 forget(connection:object){this.supported.delete(connection);}
 allows(members:readonly {id:string;connected:boolean}[],connections:readonly {connection:object;playerId:string}[]){
  return members.length>0&&members.every(member=>member.connected&&connections.some(item=>item.playerId===member.id&&this.supported.has(item.connection)));
 }
}
