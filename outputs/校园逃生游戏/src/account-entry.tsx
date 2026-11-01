import {useGamePresence} from './game-presence';
import {createRoot} from 'react-dom/client';
import {AccountPage} from '@qisheng/shared/community';
import {UIPresentationProvider,useUIPresentation,resolveUIPresentation,screenUIOrientation} from '@qisheng/shared/ui';
import {rankingClient} from './ranking/client';
import {achievementIconUrls} from './achievement-icons';
import {BrandLogo} from './BrandLogo';
import {isAndroidApp} from './platform/android';
import {staticAssetUrl} from './static-assets';
import styles from './AccountEntry.module.css';
import './ui-theme.css';

function Page(){
 useGamePresence();
 const viewport=useUIPresentation();
 const native=isAndroidApp(),touch=viewport.platform!=='desktop';
 const presentation=resolveUIPresentation({width:viewport.width,height:viewport.height,touch,android:native,orientation:native||touch?screenUIOrientation():undefined});
 const publicShortId=new URLSearchParams(location.search).get('profile')??undefined;
 return <UIPresentationProvider value={presentation}><div className={styles.page} data-ui-theme="campus" data-ui-platform={presentation.platform}>
  <header className={styles.header}>
   <a className={styles.brand} href="/" aria-label="齐盛Online主菜单"><BrandLogo/></a>
   <h1>{publicShortId?'公开档案':'账号与档案'}</h1>
   <nav className={styles.links} aria-label="页面导航">{publicShortId&&<a href="/account/">我的账号</a>}<a href="/">返回主菜单</a></nav>
  </header>
  <div className={styles.content}><AccountPage embedded campusArtUrl={staticAssetUrl('/assets/ui-b/courtyard-wide.webp')} campusPortraitArtUrl={staticAssetUrl('/assets/ui-b/courtyard-portrait.webp')} client={rankingClient} iconUrls={achievementIconUrls} publicShortId={publicShortId}/></div>
  <footer className={styles.footer}><span>© 2026 LIUFRAME INTERACTIVE</span><a href="/copyright/">版权与许可</a></footer>
 </div></UIPresentationProvider>;
}
createRoot(document.getElementById('root')!).render(<Page/>);
