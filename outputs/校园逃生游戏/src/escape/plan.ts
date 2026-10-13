import { ESCAPE_DIFFICULTIES,ESCAPE_RULES,escapeFallbackTasks } from './config.ts';
import { escapeRandom,escapeShuffle } from './random.ts';
import type { EscapePlan,EscapePlanOptions,EscapeRouteValidation,EscapeTask,EscapeTaskKind,EscapeVec3 } from './types.ts';
const permutations=<T>(items:T[]):T[][]=>items.length<=1?[items]:items.flatMap((a,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[a,...rest]));
const finitePoint=(p:EscapeVec3)=>p.length===3&&p.every(Number.isFinite);
const key=(p:EscapeVec3)=>p.map(n=>n.toFixed(5)).join(',');
const indoor=(task:EscapeTask)=>task.sites.some(p=>(p.floor??0)>0);
export class EscapePlanError extends Error {constructor(message:string,public diagnostics:string[]=[]){super(message);this.name='EscapePlanError';}}
/** Every edge is checked both ways; a partial Recast success never counts as a route. */
export function generateEscapePlan(options:EscapePlanOptions):EscapePlan {
 const cfg=ESCAPE_DIFFICULTIES[options.difficulty],random=escapeRandom(options.seed),cache=new Map<string,EscapeRouteValidation>(),diagnostics:string[]=[];
 const route=(a:EscapeVec3,b:EscapeVec3):EscapeRouteValidation=>{if(key(a)===key(b))return {complete:true,length:0};const id=key(a)+'>'+key(b);if(cache.has(id))return cache.get(id)!;let value:EscapeRouteValidation;try{value=options.validateRoute(a,b);}catch(error){value={complete:false,length:Infinity,reason:String(error)};}if(!value.complete||!Number.isFinite(value.length)||value.length<0)value={...value,complete:false,length:Infinity};cache.set(id,value);return value;};
 const edge=(a:EscapeVec3,b:EscapeVec3)=>{const ab=route(a,b),ba=route(b,a);return ab.complete&&ba.complete?Math.max(ab.length,ba.length):Infinity;};
 const sites=options.sites.filter(s=>finitePoint(s.position)&&(s.floor===undefined||s.floor===0||s.floor===1||s.floor===2)&&options.validateSite(s));
 const role=(kind:EscapeTaskKind)=>sites.filter(s=>!s.roles||s.roles.includes(kind));
 const make=(kind:EscapeTaskKind):EscapeTask|null=>{const choices=escapeShuffle(role(kind),random);if(kind==='take'||kind==='hold'){const a=choices.find(s=>kind!=='hold'||!(s.floor??0));return a?{id:kind+'-'+a.id,kind,label:kind==='take'?'夺取物资':'守住信标',sites:[a],duration:kind==='hold'?cfg.hold:0,radius:kind==='hold'?ESCAPE_RULES.holdRadius:ESCAPE_RULES.interactionRadius}:null;}
  for(const a of choices){for(const b of escapeShuffle(choices.filter(s=>s.id!==a.id),random)){const distance=edge(a.position,b.position),min=kind==='activate'?ESCAPE_RULES.activateMin:ESCAPE_RULES.deliverMin,max=kind==='activate'?ESCAPE_RULES.activateMax:ESCAPE_RULES.deliverMax;if(distance>=min-1e-6&&distance<=max+1e-6)return {id:kind+'-'+a.id+'-'+b.id,kind,label:kind==='activate'?'启动两处设备':'运送物资',sites:[a,b],duration:0,radius:ESCAPE_RULES.interactionRadius};}}
  return null;};
 function inspect(tasks:EscapeTask[],fallback:boolean):EscapePlan|null {
  if(tasks.length!==3||new Set(tasks.map(t=>t.kind)).size!==3||tasks.filter(indoor).length>1)return null;
  const regions=new Set(tasks.flatMap(t=>t.sites.map(s=>s.region)));if(regions.size<2)return null;
  const used=tasks.flatMap(t=>t.sites.map(s=>s.id));if(new Set(used).size!==used.length)return null;
  if(tasks.some(t=>t.sites.some(s=>!finitePoint(s.position)||!options.validateSite(s))))return null;
  for(const task of tasks){if(task.kind==='activate'||task.kind==='deliver'){if(task.sites.length!==2)return null;const d=edge(task.sites[0].position,task.sites[1].position);const min=task.kind==='activate'?ESCAPE_RULES.activateMin:ESCAPE_RULES.deliverMin,max=task.kind==='activate'?ESCAPE_RULES.activateMax:ESCAPE_RULES.deliverMax;if(d<min-1e-6||d>max+1e-6)return null;}else if(task.sites.length!==1)return null;}
  let worst=0;for(const order of permutations(tasks)){let paths:EscapeVec3[][]=[[options.spawn]];for(const task of order){const orders=task.kind==='activate'?[task.sites,[...task.sites].reverse()]:[task.sites];paths=paths.flatMap(path=>orders.map(points=>[...path,...points.map(p=>p.position)]));}for(const path of paths){path.push(options.extraction.position);let length=0;for(let i=1;i<path.length;i++)length+=edge(path[i-1],path[i]);if(!Number.isFinite(length))return null;worst=Math.max(worst,length);}}
  const budget=worst/ESCAPE_RULES.walk+tasks.reduce((sum,t)=>sum+t.duration,0)+cfg.extract;if(budget>cfg.round*ESCAPE_RULES.budgetFraction+1e-6)return null;
  return {seed:options.seed>>>0,difficulty:options.difficulty,tasks,spawn:[...options.spawn],extraction:options.extraction,budgetSeconds:budget,worstRouteMeters:worst,fallback};
 }
 if(!finitePoint(options.spawn)||!options.validateSite(options.extraction))throw new EscapePlanError('撤离点未通过安全检查。');
 const kinds:EscapeTaskKind[]=['take','activate','hold','deliver'];
 for(let attempt=0;attempt<(options.attempts??96);attempt++){const selected=escapeShuffle(kinds,random).slice(0,3),tasks=selected.map(make);if(tasks.every((task):task is EscapeTask=>task!==null)){const plan=inspect(tasks,false);if(plan)return plan;}}
 const fallback=inspect(options.fallbackTasks??escapeFallbackTasks(options.difficulty),true);if(fallback)return fallback;
 diagnostics.push(`有效点 ${sites.length}/${options.sites.length}`,`已检查有向路线 ${cache.size}`,`时间上限 ${cfg.round*ESCAPE_RULES.budgetFraction} 秒`);
 throw new EscapePlanError('任务路线暂未准备好，请重试。',diagnostics);
}