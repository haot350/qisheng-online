import {createRoot} from 'react-dom/client';
import {AccountPage} from '@qisheng/shared/community';
import {ACHIEVEMENT_CATALOG} from '@qisheng/shared/achievements';
import {useUIPresentation} from '@qisheng/shared/ui';
import styles from '../AccountEntry.module.css';
import '../ui-theme.css';
import {demoRankingClient,isLocalDemo} from './local-client';
const demoIcons=Object.fromEntries(ACHIEVEMENT_CATALOG.map(item=>[item.id,'/anonymous-avatar.svg']));
function Page(){const presentation=useUIPresentation();return <main className={styles.page} data-ui-theme="campus" data-ui-platform={presentation.platform}><header className={styles.header}><a className={styles.brand} href="/">LIUFRAME INTERACTIVE</a><h1>演示账号</h1><nav className={styles.links} aria-label="页面导航"><a href="/">返回演示</a></nav></header><div className={styles.content}><p role="note">账号仅保存在本机演示服务的内存中，服务重启后清空。请使用测试用户名和密码。</p>{isLocalDemo()?<AccountPage embedded client={demoRankingClient} iconUrls={demoIcons}/>:<p role="alert">请在 localhost 打开演示。</p>}</div><footer className={styles.footer}><span>LIUFRAME INTERACTIVE</span><span>本地演示</span><span>MIT</span></footer></main>;}
createRoot(document.getElementById('root')!).render(<Page/>);
