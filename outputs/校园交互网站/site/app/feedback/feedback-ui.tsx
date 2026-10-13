'use client';
import {lazy,Suspense,useState} from 'react';
import FeedbackUI from '../community/FeedbackUI';
import {RELEASE_VERSION} from '../release';
const RankingUI=lazy(()=>import('../community/RankingUI'));
export default function CommunityPageUI(){const [identity,setIdentity]=useState(false);return <><FeedbackUI embedded diagnostics={{version:RELEASE_VERSION,mode:'校园网站'}} onIdentity={()=>setIdentity(true)}/>{identity&&<Suspense fallback={<p role="status">正在打开账号页…</p>}><RankingUI initialPanel="identity" onClose={()=>setIdentity(false)}/></Suspense>}</>;}
