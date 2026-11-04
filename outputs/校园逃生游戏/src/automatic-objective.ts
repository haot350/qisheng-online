export type ObjectivePoint=readonly [number,number,number];
export type AutomaticObjectiveCandidate={id:string;positions:readonly ObjectivePoint[];locked?:boolean};
const distance=(a:ObjectivePoint,b:ObjectivePoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
/** Navigation chooses the guidance only; every legitimate task remains interactable. */
export class AutomaticObjective {
 private selected:string|undefined;private evaluatedAt=-Infinity;private signature='';private candidate:string|undefined;private candidateSince=0;
 reset(){this.selected=undefined;this.evaluatedAt=-Infinity;this.signature='';this.candidate=undefined;}
 choose(position:ObjectivePoint,items:readonly AutomaticObjectiveCandidate[],path:(from:ObjectivePoint,to:ObjectivePoint)=>readonly ObjectivePoint[],now:number):string|undefined {
  const locked=items.find(t=>t.locked);if(locked){this.selected=locked.id;this.candidate=undefined;this.signature='';this.evaluatedAt=-Infinity;return locked.id;}
  if(!items.length){this.reset();return undefined;}
  const signature=items.map(t=>t.id+':'+t.positions.map(p=>p.join(',')).join(';')).join('|');
  if(signature===this.signature&&now-this.evaluatedAt<750&&(this.selected===undefined||items.some(t=>t.id===this.selected)))return this.selected;
  this.signature=signature;this.evaluatedAt=now;
  const cost=(item:AutomaticObjectiveCandidate)=>Math.min(...item.positions.map(target=>{if(distance(position,target)<1.5)return distance(position,target);try{const route=path(position,target);if(!route.length||distance(route[route.length-1],target)>1.5)return Infinity;let sum=0,previous=position;for(const point of route){sum+=distance(previous,point);previous=point;}return sum;}catch{return Infinity;}}));
  const ranked=items.map(item=>({id:item.id,distance:cost(item)})).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)),best=ranked[0],current=ranked.find(t=>t.id===this.selected);
  if(!Number.isFinite(best.distance)){this.selected=undefined;this.candidate=undefined;return undefined;}
  if(!current||!Number.isFinite(current.distance)){this.selected=best.id;this.candidate=undefined;return this.selected;}
  if(best.id===current.id||!Number.isFinite(best.distance)||current.distance-best.distance<Math.max(5,current.distance*.2)){this.candidate=undefined;return this.selected;}
  if(this.candidate!==best.id){this.candidate=best.id;this.candidateSince=now;}else if(now-this.candidateSince>=2000){this.selected=best.id;this.candidate=undefined;}
  return this.selected;
 }
}
