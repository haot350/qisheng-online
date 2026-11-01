import {useEffect} from 'react';
import type {Mode} from './types';
import FAQContent from './FAQContent';
import {FAQ_GROUPS} from './faq';
import {defaultFAQGroup} from './faq-search';
import {LATEST_RELEASE,PLAYER_RELEASES,RELEASE_DATES} from './releases';
import {markReleaseRead} from './release-read';
import styles from './ReadingUI.module.css';
export function MenuFAQ({mode,context='home'}:{mode:Mode;context?:'home'|'prepare'}){
 return <div className={styles.reading}><FAQContent groups={FAQ_GROUPS} initialGroup={defaultFAQGroup(mode,context)}/></div>;
}
export function MenuUpdates(){
 useEffect(()=>{const frame=requestAnimationFrame(()=>markReleaseRead(LATEST_RELEASE));return()=>cancelAnimationFrame(frame);},[]);
 return <div className={styles.reading+' '+styles.updates}>
  <section className={styles.latest} aria-labelledby="reading-latest-title"><h3 id="reading-latest-title">{LATEST_RELEASE.version}</h3><time dateTime={LATEST_RELEASE.date}>{LATEST_RELEASE.date}</time><ul>{LATEST_RELEASE.summary.slice(0,3).map(item=><li key={item}>{item}</li>)}</ul></section>
  <h3 className={styles.historyTitle}>完整更新记录</h3>
  <div className={styles.history}>{RELEASE_DATES.map(date=><details key={date}><summary><time dateTime={date}>{date}</time><span aria-hidden="true">+</span></summary><div>{PLAYER_RELEASES.filter(release=>release.date===date).map(release=><article key={release.id}><h4>{release.version}</h4><ul>{release.items.map(item=><li key={item}>{item}</li>)}</ul></article>)}</div></details>)}</div>
 </div>;
}
