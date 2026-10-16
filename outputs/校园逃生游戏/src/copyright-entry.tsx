import {createRoot} from 'react-dom/client';
import {CopyrightPage} from './CopyrightPage';
function Page(){return <main className="copyright-standalone"><nav aria-label="站点导航"><a href="/">齐盛Online</a><a href="/">返回主菜单 →</a></nav><CopyrightPage/></main>;}
createRoot(document.getElementById('root')!).render(<Page/>);
