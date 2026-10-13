import type {RankingDatabase} from './db.js';
const DAY=86400000;
const unfinished="submitted IS NULL AND status IN ('pending','expired') AND expires<? AND created<?";
const processed="submitted<? AND status NOT IN ('pending','expired','review')";

export function expirePendingRun(db:RankingDatabase,id:string,now:number){return db.prepare("UPDATE runs SET status='expired',reason='EXPIRED' WHERE id=? AND status='pending' AND expires<?").run(id,now).changes;}
/** This inspection performs SELECT only and can use a genuinely read-only connection. */
export function inspectRunRetention(db:RankingDatabase,now:number){
 const cutoff=now-30*DAY;
 const count=(sql:string,...args:any[])=>Number((db.prepare(sql).get(...args) as {n:number}).n);
 return{at:now,cutoff,expirePending:count("SELECT count(*) n FROM runs WHERE status='pending' AND expires<?",now),unsubmittedEvents:count('SELECT count(*) n FROM events WHERE run_id IN(SELECT id FROM runs WHERE '+unfinished+')',now,cutoff),processedEvents:count('SELECT count(*) n FROM events WHERE run_id IN(SELECT id FROM runs WHERE '+processed+')',cutoff),preserveScores:true,preserveReview:true};
}
export function applyRunRetention(db:RankingDatabase,now:number,{dryRun=true}:{dryRun?:boolean}={}){
 const planned=inspectRunRetention(db,now);if(dryRun)return{...planned,dryRun:true,changed:0};
 const changes=db.transaction(()=>{
  const expired=db.prepare("UPDATE runs SET status='expired',reason='EXPIRED' WHERE status='pending' AND expires<?").run(now).changes;
  const unsubmitted=db.prepare('DELETE FROM events WHERE run_id IN(SELECT id FROM runs WHERE '+unfinished+')').run(now,planned.cutoff).changes;
  const submitted=db.prepare('DELETE FROM events WHERE run_id IN(SELECT id FROM runs WHERE '+processed+')').run(planned.cutoff).changes;
  return{expired,unsubmitted,submitted};
 })();
 return{...planned,dryRun:false,changed:changes.expired+changes.unsubmitted+changes.submitted,changes};
}
