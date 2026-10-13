import {staticAssetUrl} from '@/lib/static-assets';
import {ArrowDown,ArrowUpRight} from 'lucide-react';
import {SiteHeader,SiteFooter} from './site-shell';
import './home.css';
import {GAME_ORIGIN} from './site-config';
import {RELEASE_LABEL} from './release';
import type {Metadata} from 'next';
export const dynamic='force-static';
export const metadata:Metadata={description:`探索齐盛数字校园，也走进《明天，照常见》的七章黄昏故事。${RELEASE_LABEL} 跟上同伴，举起相机，把今天拍成一部片子；探索五处校园实拍、突围、摄影漫游和驾驶挑战。`};
const places=[['all','校园全景'],['gate','校门'],['admin','综合楼'],['teaching','教学区'],['library','图书馆'],['canteen','食堂'],['dorm','宿舍庭院'],['sports','运动区']];
export default function Home(){return <div className="home-page"><SiteHeader active="home"/><main id="main-content">
<section className="home-hero" aria-labelledby="hero-title"><div className="home-intro"><p className="home-kicker">淄博齐盛高级中学</p><h1 id="hero-title">齐盛，<br/>另一种<span>视角。</span></h1><p className="home-intro-copy">从校门出发，穿过教学区，<br/>走向操场与庭院。<br/>这一次，由你选择观看的角度。</p><a className="home-primary" href="/explore">进入三维校园 <ArrowUpRight aria-hidden="true"/></a><a className="home-scroll" href="#places">选一处熟悉的地方 <ArrowDown aria-hidden="true"/></a></div><figure className="home-hero-image"><img src={staticAssetUrl("/images/campus-overview.jpg")} width="1280" height="900" alt="齐盛校园数字模型全景，教学区与运动场、庭院相连" fetchPriority="high"/></figure></section>
<section className="home-places" id="places" data-reveal aria-labelledby="places-title"><div className="home-section-heading"><h2 id="places-title">校园，从这里展开。</h2><p>转动视角，改变光线，<br/>重新发现每天经过的地方。</p></div><nav className="home-place-grid" aria-label="选择三维浏览起点">{places.map(([id,name])=><a key={id} href={`/explore?zone=${id}`}><span>{name}</span><ArrowUpRight aria-hidden="true"/></a>)}</nav></section>
<section className="home-story" data-reveal><figure><img src={staticAssetUrl("/images/school-field.jpg")} alt="实拍齐盛校园，操场对面是教学楼与连廊" width="1600" height="902" loading="lazy" decoding="async"/><figcaption>操场对面的教学楼，是每天熟悉的风景。</figcaption></figure><div><h2>熟悉的地方，<br/>值得认真记录。</h2><p>楼宇之间的连廊，课间经过的庭院，操场边的一排树。校园的轮廓，也藏着日常生活的记忆。</p><p>了解这所学校，再到模型中看看它们如何连在一起。</p><a className="section-link" href="/school">认识齐盛 <ArrowUpRight aria-hidden="true"/></a></div></section>
<section className="home-project" data-reveal><div><h2>从一张照片，<br/>到一座数字校园。</h2><p>照片、视频和全景截图提供线索，亲历校园的人补充细节。一次次核对入口、连廊和庭院，让模型逐渐接近记忆中的样子。</p><a className="section-link" href="/making">看看制作过程 <ArrowUpRight aria-hidden="true"/></a></div><figure><img src={staticAssetUrl("/images/teaching-facade.jpg")} width="1920" height="1080" alt="数字重建后的教学楼与连廊" loading="lazy" decoding="async"/><figcaption>教学区的数字重建画面</figcaption></figure></section>
<section className="home-game" data-reveal aria-labelledby="game-title"><div><h2 id="game-title">齐盛Online。</h2><p>跟随同伴拍下一段校园故事，独自完成突围任务，或开上车挑战积分。<br/>四种模式，从同一座校园出发。</p><a className="section-link" href="/game">选择一种玩法</a></div><div className="home-game-entry"><p>先认识玩法，再选自己的路线。</p><a className="home-primary" href={GAME_ORIGIN} target="_blank" rel="noopener noreferrer">进入校园游戏</a><span className="home-game-hint">在独立游戏网站打开 · {RELEASE_LABEL} 预览版</span></div></section>
<section className="home-invitation" data-reveal><h2>换个角度，回到校园。</h2><p>停在一束晨光里，也可以让导览带你走一圈。</p><a className="home-primary" href="/explore">开始探索 <ArrowUpRight aria-hidden="true"/></a></section>
</main><SiteFooter/></div>}
