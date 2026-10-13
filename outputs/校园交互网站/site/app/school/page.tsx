import {staticAssetUrl} from '@/lib/static-assets';
import type { Metadata } from 'next';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../site-shell';
import { schoolFacts, schoolSources } from '../content';
import '../editorial.css';

export const dynamic = 'force-static';
export const metadata: Metadata = {
  alternates: {canonical: '/school'},
  openGraph: {url: 'https://zbqsgz.tianhw.top/school', images: [{url: new URL(staticAssetUrl('/images/campus-overview.jpg'),'https://zbqsgz.tianhw.top').href, width: 1280, height: 900, alt: '齐盛校园数字模型全景'}]},
  title: '学校介绍 | 齐盛数字校园',
  description: '认识淄博齐盛高级中学的校园空间、办学理念与文化生活。',
};

export default function SchoolPage() {
  return <div className="editorial-page school-page">
    <SiteHeader active="school" />
    <main id="main-content">
      <section className="editorial-intro editorial-width" aria-labelledby="school-title">
        <div>
          <p className="editorial-kicker">学校介绍</p>
          <h1 id="school-title">一座校园，<br />学习与生活在此相连。</h1>
        </div>
        <div className="editorial-intro-aside">
          <p>{schoolFacts.name}位于{schoolFacts.location}，是一所{schoolFacts.type}。从课堂、实验室到运动场与生活庭院，校园承载着学习，也容纳着每一天的成长。</p>
          <a className="editorial-text-link" href="#school-life">走近齐盛 <ArrowDown aria-hidden="true" /></a>
        </div>
      </section>

      <figure className="editorial-cover editorial-width">
        <img src={staticAssetUrl("/images/school-field.jpg")} width="1600" height="900" alt="齐盛高中校园实景，开阔的运动场与远处的教学建筑" fetchPriority="high" />
        <figcaption className="school-photo-caption"><span>运动场与教学区<a className="editorial-text-link" href="/explore?zone=sports">浏览运动区 <ArrowUpRight aria-hidden="true" /></a></span><span>校园实景</span></figcaption>
      </figure>

      <section className="school-overview editorial-width" id="school-life" aria-labelledby="school-overview-title">
        <div className="school-overview-heading" data-reveal>
          <p className="editorial-kicker">关于学校</p>
          <h2 id="school-overview-title">见贤思齐，<br />于斯为盛。</h2>
          <p className="editorial-muted">这是齐盛的办学理念，也是认识这所学校的一条线索。</p>
        </div>
        <div className="school-overview-body" data-reveal>
          <p>学校在课程、校园文化与日常生活中开展育人实践。教学区、实验室、体育馆、食堂和学生公寓共同构成完整的校园生活空间。</p>
          <p>齐盛新校园于 <strong>{schoolFacts.newCampusOpened}</strong>启用。</p>
          <dl className="school-facts">
            <div><dt>学校性质</dt><dd>{schoolFacts.type}</dd></div>
            <div><dt>所在地区</dt><dd>{schoolFacts.location}</dd></div>
            <div><dt>新校园启用</dt><dd>{schoolFacts.newCampusOpened}</dd></div>
          </dl>
        </div>
      </section>

      <section className="school-culture editorial-width" aria-labelledby="school-culture-title">
        <figure className="editorial-figure school-library" data-reveal>
          <img src={staticAssetUrl("/images/library-photo.jpg")} width="1200" height="900" alt="齐盛高中图书馆实景" loading="lazy" decoding="async" />
          <figcaption className="school-photo-caption"><span>图书馆<a className="editorial-text-link" href="/explore?zone=library">浏览图书馆 <ArrowUpRight aria-hidden="true" /></a></span><span>校园实景</span></figcaption>
        </figure>
        <div className="school-culture-copy" data-reveal>
          <p className="editorial-kicker">校园文化</p>
          <h2 id="school-culture-title">让知识走出课堂，<br />让文化走进日常。</h2>
          <p>齐盛印迹馆记录学校发展，“管子文化”学科融合展馆将地方文化引入学习空间。校园里的场馆与课程，为课堂之外的观察、阅读和探究提供了更多可能。</p>
          <p>学校开展“齐迹”课程建设，将育人理念落实到课程实践中。认识齐盛，也可以从这些具体的空间与学习活动开始。</p>
          <a className="editorial-text-link" href={schoolSources.campus.href} target="_blank" rel="noreferrer">阅读教育局相关报道 <ArrowUpRight aria-hidden="true" /></a>
        </div>
      </section>

      <figure className="school-courtyard editorial-width editorial-figure" data-reveal>
        <img src={staticAssetUrl("/images/school-courtyard.jpg")} width="1600" height="900" alt="齐盛校园的楼宇、连廊与庭院实景" loading="lazy" decoding="async" />
        <figcaption className="school-photo-caption"><span>教学庭院，日常经过的地方<a className="editorial-text-link" href="/explore?zone=teaching">浏览教学区 <ArrowUpRight aria-hidden="true" /></a></span><span>校园实景</span></figcaption>
      </figure>

      <section className="editorial-next editorial-width" aria-labelledby="school-next-title" data-reveal>
        <div><p className="editorial-kicker">换一个角度</p><h2 id="school-next-title">在数字校园里，<br />继续这次漫步。</h2></div>
        <div><p>从全景辨认校园布局，再走近教学楼、庭院与运动场。三维模型提供一种新的观看方式。</p><a className="editorial-button" href="/explore">进入三维校园 <ArrowUpRight aria-hidden="true" /></a></div>
      </section>

      <aside className="editorial-sources editorial-width" aria-labelledby="school-sources-title">
        <h2 id="school-sources-title">资料来源</h2>
        <p>学校信息依据淄博市教育局公开资料整理。网站中的三维场景为个人数字重建作品。</p>
        <ul>{Object.values(schoolSources).map((source) => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight aria-hidden="true" /></a><span>{source.publisher}，{source.date}</span></li>)}</ul>
      </aside>
    </main>
    <SiteFooter />
  </div>;
}
