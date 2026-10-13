import {createRoot} from 'react-dom/client';
import {AccountPage} from '@qisheng/shared/community';
import {ACHIEVEMENT_CATALOG} from '@qisheng/shared/achievements';
import '@qisheng/shared/community/account.css';
import '../account-page.css';
import {demoRankingClient,isLocalDemo} from './local-client';
const demoIcons=Object.fromEntries(ACHIEVEMENT_CATALOG.map(item=>[item.id,'/anonymous-avatar.svg']));
function Page(){return <main className="account-standalone"><nav className="account-site-nav"><a href="/">OpenQS 本地演示</a></nav><p role="note">隔离的本地账号 API。账号仅保存在内存中，服务重启后清空；请使用测试凭据。</p>{isLocalDemo()?<AccountPage client={demoRankingClient} iconUrls={demoIcons}/>:<p role="alert">请在 localhost 打开演示。</p>}<footer className="account-site-footer">OpenQS · MIT · 本地演示</footer></main>;}
createRoot(document.getElementById('root')!).render(<Page/>);
