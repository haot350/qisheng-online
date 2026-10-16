import {createRoot} from 'react-dom/client';
import {AccountPage} from '@qisheng/shared/community';
import '@qisheng/shared/community/account.css';
import {rankingClient} from './ranking/client';
import {achievementIconUrls} from './achievement-icons';
import './account-page.css';
function Page(){return <main className="account-standalone"><nav className="account-site-nav" aria-label="站点导航"><a href="/" aria-label="返回齐盛Online">齐盛Online</a><a href="/">返回游戏 ↗</a></nav><AccountPage client={rankingClient} iconUrls={achievementIconUrls} publicShortId={new URLSearchParams(location.search).get('profile')??undefined}/><footer className="account-site-footer">© 2026 OpenQS · 齐盛Online · <a href="/copyright/">版权与许可</a></footer></main>;}
createRoot(document.getElementById('root')!).render(<Page/>);
