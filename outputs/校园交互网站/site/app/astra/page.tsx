import {staticAssetUrl} from '@/lib/static-assets';
import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../site-shell';
import { astraSource } from '../content';
import { Starlight } from './starlight';
import '../editorial.css';

export const dynamic = 'force-static';
export const metadata: Metadata = {
  alternates: {canonical: '/astra'},
  openGraph: {url: 'https://zbqsgz.tianhw.top/astra', images: [{url: new URL(staticAssetUrl('/images/campus-overview.jpg'),'https://zbqsgz.tianhw.top').href, width: 1280, height: 900, alt: '齐盛校园数字模型全景'}]},
  title: '关于 Astra | 齐盛数字校园',
  description: '了解 GPT-6 Astra 如何参与校园三维重建、影片制作与交互网站开发。',
};

export default function AstraPage() {
  return <div className="editorial-page astra-page">
    <SiteHeader active="astra" />
    <main id="main-content">
      <section className="editorial-intro editorial-width" aria-labelledby="astra-title">
        <div><p className="editorial-kicker">关于 Astra</p><h1 id="astra-title">把想法推进到<br />可以看见的作品。</h1></div>
        <div className="editorial-intro-aside"><p>GPT-6 Astra 参与了这座数字校园从建模、影像到网页的制作。在项目发起者提供的资料与反馈下，它将空间线索转化为脚本，把视觉设想落到具体的画面与交互中。</p><a className="editorial-text-link" href="#astra-work">了解它在项目中的工作 <ArrowUpRight aria-hidden="true" /></a></div>
      </section>

      <section className="astra-stage editorial-width" aria-labelledby="starlight-title">
        <div className="astra-stage-heading"><h2 id="starlight-title">GPT-6 Astra</h2><p>从片尾延续而来的星光</p></div>
        <Starlight />
      </section>

      <section className="astra-about editorial-width" aria-labelledby="astra-about-title" data-reveal>
        <div><p className="editorial-kicker">模型与能力</p><h2 id="astra-about-title">理解复杂问题，<br />也参与具体制作。</h2></div>
        <div><p>根据 OpenAI 官方模型文档，GPT-6 Astra 面向复杂推理、编程、计算机操作、研究与文档创作。这些能力结合工具使用，可以用于包含多个步骤的工作。</p><p>在本项目中，这些能力用于整理参考线索、编写建模与处理脚本、设计影片画面，以及实现网站的浏览体验。</p><a className="editorial-text-link" href={astraSource.href} target="_blank" rel="noreferrer">阅读 OpenAI 官方模型文档 <ArrowUpRight aria-hidden="true" /></a></div>
      </section>

      <section className="astra-work editorial-width" id="astra-work" aria-labelledby="astra-work-title">
        <div className="astra-work-heading" data-reveal><p className="editorial-kicker">在这个项目中</p><h2 id="astra-work-title">同一份校园记忆，<br />三种呈现方式。</h2></div>
        <div className="astra-work-list">
          <article data-reveal><h3>三维校园</h3><div><p>依据照片、视频与 VR 参考，编写 Blender 建模脚本，组织建筑、道路和庭院；结合熟悉校园的人的反馈调整楼层关系、连廊和局部地形。</p><a className="editorial-text-link" href="/explore">浏览三维校园 <ArrowUpRight aria-hidden="true" /></a></div></article>
          <article data-reveal><h3>校园影片</h3><div><p>围绕同一套场景安排镜头、渲染画面，再制作字幕、转场与星光片尾，让空间以连续的影像展开。</p><a className="editorial-text-link" href="/making#film">了解影片制作 <ArrowUpRight aria-hidden="true" /></a></div></article>
          <article data-reveal><h3>交互网站</h3><div><p>把三维场景带入浏览器，完成页面设计、内容整理和模型加载，让观看者能够选择区域、调整视角，也能了解作品背后的制作过程。</p><a className="editorial-text-link" href="/making#web">了解网页实现 <ArrowUpRight aria-hidden="true" /></a></div></article>
        </div>
      </section>

      <figure className="editorial-cover editorial-width astra-campus-image" data-reveal><img src={staticAssetUrl("/images/teaching-facade.jpg")} width="1920" height="1080" alt="由建模脚本构建的齐盛校园教学楼与连廊画面" loading="lazy" decoding="async" /><figcaption><span>从参考线索到建筑细节</span><span>数字模型</span></figcaption></figure>

      <section className="editorial-next editorial-width" aria-labelledby="astra-collaboration-title" data-reveal>
        <div><p className="editorial-kicker">人与工具的协作</p><h2 id="astra-collaboration-title">资料给出线索，<br />反馈让作品更准确。</h2></div>
        <div><p>项目发起者提供校园资料、确认空间关系并评审结果。Astra 在这些依据上完成脚本、设计与修改。每一处更接近校园的细节，都来自持续的核对。</p><a className="editorial-button" href="/making">查看完整制作过程 <ArrowUpRight aria-hidden="true" /></a></div>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
