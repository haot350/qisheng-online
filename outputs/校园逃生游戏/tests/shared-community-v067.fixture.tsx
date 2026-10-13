import {createRoot} from 'react-dom/client';
import GameFeedbackUI from '../src/FeedbackUI';
import GameRankingUI from '../src/RankingUI';
import SiteFeedbackUI from '../../校园交互网站/site/app/community/FeedbackUI';
import SiteRankingUI from '../../校园交互网站/site/app/community/RankingUI';
import {rankingClient as gameClient} from '../src/ranking/client';
import {rankingClient as siteClient} from '../../校园交互网站/site/app/community/ranking/client';
import {RankingUI,FeedbackUI} from '@qisheng/shared/community';
import {RankingClient} from '@qisheng/shared/community/client';
import {FAQ_GROUPS,PLAYER_CONTENT} from '@qisheng/shared/player-content';
import FAQContent from '@qisheng/shared/player-content/FAQContent';
import '@qisheng/shared/player-content/reading.css';
const kind=new URLSearchParams(location.search).get('kind')??'game-feedback';
const actions:unknown[]=[];(window as any).__actions=actions;
const close=()=>actions.push({action:'close'}),identity=()=>actions.push({action:'identity'});
const directClient=new RankingClient('/explicit-api');
let pendingRows=[{id:'pending-a',config:{mode:'escape',difficulty:'standard'},summary:{score:90},finishedAt:1}];
const pendingRuns={list:async()=>{actions.push({action:'pending-list'});return pendingRows as any;},submit:async(id:string)=>{actions.push({action:'pending-submit',id});pendingRows=pendingRows.filter(row=>row.id!==id);return{status:'ranked'} as any;}};
async function run(){
 const client=kind.startsWith('site-')?siteClient:kind.startsWith('direct-')?directClient:gameClient;
 await client.me();
 createRoot(document.getElementById('root')!).render(
  kind==='game-feedback'?<GameFeedbackUI onClose={close} onIdentity={identity}/>:
  kind==='site-feedback'?<SiteFeedbackUI embedded onIdentity={identity}/>:
  kind==='game-ranking'?<GameRankingUI initialPanel="recent" onClose={close}/>:
  kind==='site-ranking'?<SiteRankingUI initialPanel="recent" onClose={close}/>:
  kind==='direct-ranking'?<RankingUI client={client} pendingRuns={pendingRuns} initialPanel="recent" onClose={close}/>:
  kind==='direct-feedback'?<FeedbackUI client={client} onClose={close}/>:
  <main><h1>{PLAYER_CONTENT.latest.version}</h1><FAQContent groups={FAQ_GROUPS}/></main>
 );
}
void run();
