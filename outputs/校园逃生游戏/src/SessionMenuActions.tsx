import type {MenuPageId} from './MenuPages';

/** Session utilities never navigate through the public sidebar or resume play. */
export function SessionMenuActions({onOpen,onMain,onLobby,busy=false}:{onOpen:(page:MenuPageId)=>void;onMain:()=>void;onLobby?:()=>void;busy?:boolean}){
 return <div className="session-menu-actions">
  <nav aria-label="对局选项" className="session-menu-utilities">
   <button disabled={busy} onClick={()=>onOpen('settings')}>设置</button>
   <button disabled={busy} onClick={()=>onOpen('help')}>操作帮助</button>
   <button disabled={busy} onClick={()=>onOpen('assistant')}><span className="session-assistant-star" aria-hidden="true">✦</span>小齐助手</button>
  </nav>
  <details className="session-menu-more"><summary>更多选项</summary><div className="session-menu-utilities"><button disabled={busy} onClick={()=>onOpen('account')}>账号与档案</button><button disabled={busy} onClick={()=>onOpen('ranking')}>排行榜</button><button disabled={busy} onClick={()=>onOpen('feedback')}>反馈与进展</button></div></details>
  <div className="session-menu-exits">{onLobby&&<button disabled={busy} onClick={onLobby}>返回联机大厅</button>}<button disabled={busy} onClick={onMain}>返回主菜单</button></div>
 </div>;
}
