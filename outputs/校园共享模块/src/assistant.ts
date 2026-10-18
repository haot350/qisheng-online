/** Public assistant contracts. Provider addresses, models and secrets never enter public status. */
export interface AssistantHistoryTurn { question: string; answer: string; }
export interface AssistantFeedbackDraft { title: string; message: string; category: 'bug'|'suggestion'|'content'|'other'; }
export interface AssistantStatus { name: '小齐'; enabled: boolean; available: boolean; revision: number; noticeRevision: number; limits: {guestDaily: number; accountDaily: number; questionChars: number; historyTurns: number}; }
export type AssistantPage='home'|'modes'|'settings'|'help'|'about'|'ranking'|'feedback'|'account';
export type AssistantMode='story'|'escape'|'drive'|'roam';
export type AssistantDifficulty='easy'|'normal'|'hard';
export interface AssistantMenuContext { token:string; inBattle:boolean; page:AssistantPage|'prepare'|'lobby'|'assistant'; }
/** Deliberately finite menu capabilities: no DOM selectors, scripts, URLs, or battle inputs. */
export type AssistantMenuAction=
 |{type:'navigate';page:AssistantPage}
 |{type:'select_mode';mode:AssistantMode}
 |{type:'select_difficulty';difficulty:AssistantDifficulty}
 |{type:'select_weapon';weapon:'mp5'|'m4a1'|'ak47'|'r870'|'awm'|'m249'}
 |{type:'setting';setting:'music'|'quality'|'reducedMotion';value:number|'auto'|'smooth'|'high'|'ultra'|boolean}
 |{type:'create_room';mode:'coop'|'tdm'|'ffa';difficulty:AssistantDifficulty;maxPlayers:2|3|4|5|6|7|8;private:boolean}
 |{type:'join_room';code:string};
export interface AssistantActionPlan { id:string; contextToken:string; actions:AssistantMenuAction[]; }
export interface AssistantChatRequest { requestId: string; question: string; history?: AssistantHistoryTurn[]; visitorToken?: string; menuContext?:AssistantMenuContext; }
export interface AssistantChatReply { requestId: string; answer: string; feedbackDraft?: AssistantFeedbackDraft; actionPlan?:AssistantActionPlan; remaining: number; }
export interface AssistantPromptRevision { revision:number; changedAt:number; generationPrompt:string; reviewPrompt:string; }
export interface AssistantAdminConfig { revision: number; enabled: boolean; endpoint: string; model: string; keyConfigured: boolean; tested: boolean; guestDaily: number; accountDaily: number; globalDailyTokens: number; generationPrompt?:string; reviewPrompt?:string; promptHistory?:AssistantPromptRevision[]; }
export interface AssistantAdminUpdate { expectedRevision: number; enabled?: boolean; endpoint?: string; model?: string; apiKey?: string; guestDaily?: number; accountDaily?: number; globalDailyTokens?: number; generationPrompt?:string; reviewPrompt?:string; restoreDefaultPrompts?:boolean; }
export interface AssistantUsage { day: string; turns: number; tokens: number; approved: number; rejected: number; failed: number; active: number; dailyBudget: number; averageMs: number; }
export {ASSISTANT_KNOWLEDGE} from './player-content/assistant-knowledge.js';

export function validateAssistantMenuContext(value:unknown):AssistantMenuContext|undefined {
 if(value===undefined)return undefined;
 const v=value as AssistantMenuContext;
 if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['token','inBattle','page'].includes(k))||typeof v.token!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(v.token)||typeof v.inBattle!=='boolean'||!['home','modes','settings','help','about','ranking','feedback','account','prepare','lobby','assistant'].includes(v.page))throw Error('ASSISTANT_CONTEXT');
 return {token:v.token,inBattle:v.inBattle,page:v.page};
}
export function validateAssistantActions(value:unknown):AssistantMenuAction[] {
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>4)throw Error('ASSISTANT_ACTION');
 return value.map((raw,index)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('ASSISTANT_ACTION');
  const v=raw as Record<string,unknown>,keys=(...allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
  switch(v.type){
   case'navigate':if(index===value.length-1&&keys('type','page')&&['home','modes','settings','help','about','ranking','feedback','account'].includes(String(v.page)))return {...v} as AssistantMenuAction;break;
   case'select_mode':if(keys('type','mode')&&['story','escape','drive','roam'].includes(String(v.mode)))return {...v} as AssistantMenuAction;break;
   case'select_difficulty':if(keys('type','difficulty')&&['easy','normal','hard'].includes(String(v.difficulty)))return {...v} as AssistantMenuAction;break;
   case'select_weapon':if(keys('type','weapon')&&['mp5','m4a1','ak47','r870','awm','m249'].includes(String(v.weapon)))return {...v} as AssistantMenuAction;break;
   case'setting':if(keys('type','setting','value')&&((v.setting==='music'&&typeof v.value==='number'&&Number.isFinite(v.value)&&v.value>=0&&v.value<=1)||(v.setting==='quality'&&['auto','smooth','high','ultra'].includes(String(v.value)))||(v.setting==='reducedMotion'&&typeof v.value==='boolean')))return {...v} as AssistantMenuAction;break;
   case'create_room':if(keys('type','mode','difficulty','maxPlayers','private')&&['coop','tdm','ffa'].includes(String(v.mode))&&['easy','normal','hard'].includes(String(v.difficulty))&&Number.isInteger(v.maxPlayers)&&Number(v.maxPlayers)>=2&&Number(v.maxPlayers)<=(v.mode==='coop'?4:8)&&typeof v.private==='boolean')return {...v} as AssistantMenuAction;break;
   case'join_room':if(keys('type','code')&&typeof v.code==='string'&&/^[A-Za-z0-9-]{4,16}$/.test(v.code))return {type:'join_room',code:v.code.toUpperCase()};break;
  }
  throw Error('ASSISTANT_ACTION');
 });
}
export const assistantActionNeedsConfirmation=(a:AssistantMenuAction)=>a.type==='create_room'||a.type==='join_room';
export function assistantActionLabel(a:AssistantMenuAction):string {
 switch(a.type){case'navigate':return '打开'+({home:'首页',modes:'玩法选择',settings:'设置',help:'帮助',about:'关于',ranking:'排行榜',feedback:'反馈与进展',account:'账号与档案'}[a.page]);case'select_mode':return '选择'+({story:'明天，照常见',escape:'校园突围',drive:'大飞模式',roam:'自由漫游'}[a.mode]);case'select_difficulty':return '选择'+({easy:'轻松',normal:'标准',hard:'挑战'}[a.difficulty])+'难度';case'select_weapon':return '选择 '+a.weapon.toUpperCase();case'setting':return '调整'+({music:'音乐音量',quality:'画质',reducedMotion:'减少动态效果'}[a.setting]);case'create_room':return '创建'+({coop:'合作',tdm:'团队对战',ffa:'个人混战'}[a.mode])+`房间（${a.maxPlayers}人${a.private?'，私人':''}）`;case'join_room':return '加入房间 '+a.code;}
}
