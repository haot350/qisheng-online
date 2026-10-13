import {staticAssetUrl} from '@/lib/static-assets';
import type { Metadata } from 'next';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../site-shell';
import { makingStages } from '../content';
import '../editorial.css';

export const dynamic = 'force-static';
export const metadata: Metadata = {
  alternates: {canonical: '/making'},
  openGraph: {url: 'https://zbqsgz.tianhw.top/making', images: [{url: new URL(staticAssetUrl('/images/campus-overview.jpg'),'https://zbqsgz.tianhw.top').href, width: 1280, height: 900, alt: '齐盛校园数字模型全景'}]},
  title: '制作过程 | 齐盛数字校园',
  description: '从照片、视频与 VR 资料，到 Blender 三维重建、校园影片与可交互的网站。',
};

export default function MakingPage() {
  return <div className="editorial-page making-page">
    <SiteHeader active="making" />
    <main id="main-content">
      <section className="editorial-intro editorial-width" aria-labelledby="making-title">
        <div><p className="editorial-kicker">制作过程</p><h1 id="making-title">从一份资料，<br />到一座可漫游的校园。</h1></div>
        <div className="editorial-intro-aside"><p>照片与记忆提供线索，模型让空间逐渐清晰。这份数字校园，来自资料整理、人工核对与持续修改，也经历了从三维影片到交互网页的转变。</p><a className="editorial-text-link" href="#making-process">查看制作过程 <ArrowDown aria-hidden="true" /></a></div>
      </section>

      <figure className="editorial-cover editorial-width making-cover">
        <img src={staticAssetUrl("/images/campus-overview.jpg")} width="1600" height="900" alt="齐盛数字校园全景，模型中可见教学区、体育场及生活区的空间布局" fetchPriority="high" />
        <figcaption><span>从整体布局，走向每一处细节</span><span>数字模型</span></figcaption>
      </figure>

      <nav className="making-index editorial-width" aria-label="制作阶段">
        {makingStages.map((stage) => <a key={stage.id} href={`#${stage.id}`}>{stage.label}<ArrowDown aria-hidden="true" /></a>)}
      </nav>

      <div className="making-process editorial-width" id="making-process">
        {makingStages.map((stage, index) => <section className="making-stage" id={stage.id} key={stage.id} aria-labelledby={`${stage.id}-title`}>
          <div className="making-stage-label" data-reveal><p className="editorial-kicker">{stage.label}</p><span className="making-stage-line" aria-hidden="true" /></div>
          <div className="making-stage-content" data-reveal>
            <h2 id={`${stage.id}-title`}>{stage.title}</h2>
            <p>{stage.body}</p>
            <p className="editorial-note">{stage.note}</p>
            {index === 0 && <figure className="editorial-figure making-stage-image"><img src={staticAssetUrl("/images/school-courtyard.jpg")} width="1400" height="900" alt="用于认识校园楼宇与连廊关系的校园实景" loading="lazy" decoding="async" /><figcaption><span>观察建筑与庭院的关系</span><span>校园实景</span></figcaption></figure>}
            {index === 1 && <figure className="editorial-figure making-stage-image"><img src={staticAssetUrl("/images/teaching-facade.jpg")} width="1920" height="1080" alt="数字重建后的教学建筑与连廊" loading="lazy" decoding="async" /><figcaption><span>楼宇、窗格与连廊逐步成形</span><span>数字模型</span></figcaption></figure>}
            {index === 2 && <dl className="making-calibrations"><div><dt>连廊所在楼层</dt><dd>对照不同视角与熟悉校园的人的反馈，校正连接位置，避免把视觉遮挡误读为空间关系。</dd></div><div><dt>下沉式圆形空间</dt><dd>根据补充说明调整高差与形态，让庭院里的地形关系更接近参考资料。</dd></div></dl>}
            {index === 3 && <div className="making-film-note"><span>场景渲染</span><strong>Blender EEVEE</strong><span>动效与合成</span><strong>Remotion</strong></div>}
            {index === 4 && <details className="making-technical"><summary>查看网页技术与模型来源</summary><p>网页采用 v16 校园模型，导出为 GLB 并以 Meshopt 压缩；重复构件复用几何，外观与楼层按需载入。原 Blender 模型保留完整，导出资产记录来源与哈希。</p></details>}
            {index === 4 && <a className="editorial-button" href="/explore">亲自走进模型 <ArrowUpRight aria-hidden="true" /></a>}
          </div>
        </section>)}
      </div>

      <section className="making-collaboration editorial-width" aria-labelledby="collaboration-title" data-reveal>
        <p className="editorial-kicker">共同完成的作品</p>
        <h2 id="collaboration-title">对校园的熟悉，<br />让数字重建有了依据。</h2>
        <div><p>项目发起者提供参考资料、指出空间差异，并参与每一轮结果核对。GPT-6 Astra 协助编写脚本、组织视觉设计与实现网页，再根据反馈持续细化。</p><p>这一过程依赖可见资料与人的判断。照片视角未能覆盖的部分，仍然保留着数字重建与真实校园之间的距离。</p><a className="editorial-text-link" href="/astra">了解 Astra 在项目中的工作 <ArrowUpRight aria-hidden="true" /></a></div>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
