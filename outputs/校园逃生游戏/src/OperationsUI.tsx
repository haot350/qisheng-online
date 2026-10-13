import { useEffect, useState } from 'react';
import type { Announcement, ModeEntry } from '@qisheng/shared/operations';
import { gameOperations } from './game-operations';
import './operations.css';

export function useGameOperations() {
  const [state, setState] = useState(gameOperations.snapshot);
  useEffect(() => {
    const off = gameOperations.subscribe(() => setState(gameOperations.snapshot()));
    const refresh = () => { if (!document.hidden) void gameOperations.refresh(); };
    refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { off(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, []);
  return state;
}
const READ_KEY = 'qisheng-announcement-read-v1';
export function announcementKey(a: Announcement) { return a.id + ':' + a.revision; }
function loadRead() { try { return new Set<string>(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); } catch { return new Set<string>(); } }
export function useAnnouncements(entry: ModeEntry|undefined, revision: number, playing: boolean) {
  const [read] = useState(loadRead), [flash, setFlash] = useState<Announcement|null>(null);
  const [tick, setTick] = useState(0);
  const list = gameOperations.active(entry);
  const markRead = (a: Announcement) => { read.add(announcementKey(a)); try { localStorage.setItem(READ_KEY, JSON.stringify([...read].slice(-300))); } catch {} };
  const key = list.map(announcementKey).join(',');
  useEffect(() => {
    if (!playing) { setFlash(null); gameOperations.active(entry).forEach(markRead); return; }
    const next = gameOperations.active(entry).find(a => !read.has(announcementKey(a)));
    if (!next) return;
    markRead(next); setFlash(next);
    const timer = setTimeout(() => setFlash(null), 6000);
    return () => { clearTimeout(timer); setFlash(null); };
  }, [playing, entry, revision, key]);
  // Expiration uses server time even while the next network refresh is pending.
  useEffect(() => { const end=Math.min(...list.filter(a=>a.endsAt).map(a=>Date.parse(a.endsAt!)));if(!Number.isFinite(end))return;const timer=setTimeout(()=>setTick(t=>t+1),Math.min(2147483647,Math.max(20,end-gameOperations.serverNow())));return()=>clearTimeout(timer); }, [key, revision, tick]);
  void tick;
  return { list, flash: flash && list.some(a => announcementKey(a) === announcementKey(flash)) ? flash : null, markRead };
}
export function AnnouncementBanner({items,onOpen}:{items:Announcement[];onOpen:()=>void}) {
  if (!items.length) return null;
  const first = items[0];
  return <div className={'announcement-banner '+first.priority}><span className="announcement-label">{first.priority==='important'?'重要通知':'通知'}</span><strong>{first.title}</strong><button type="button" onClick={onOpen}>{items.length>1?'查看 '+items.length+' 条通知':'查看详情'} <span aria-hidden="true">→</span></button></div>;
}
export function AnnouncementList({items,onRead}:{items:Announcement[];onRead:(a:Announcement)=>void}) {
  useEffect(() => { items.forEach(onRead); }, [items.map(announcementKey).join(',')]);
  return <div className="announcement-list">{items.length ? items.map(a=><article key={announcementKey(a)}><h3>{a.title}</h3><time>{new Date(a.publishedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</time><p>{a.body}</p>{a.link&&<a href={a.link}>查看相关内容 →</a>}</article>) : <p>目前没有正在发布的通知。</p>}</div>;
}
