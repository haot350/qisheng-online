import type {Metadata} from 'next';
import {SiteHeader,SiteFooter} from '../site-shell';
import {SITE_ORIGIN} from '../site-config';
import CommunityPageUI from './feedback-ui';
import './page.css';
export const dynamic='force-static';
export const metadata:Metadata={title:'反馈与进展 | 齐盛数字校园',description:'提交游玩反馈，查看问题处理进展与更新记录。',alternates:{canonical:new URL('/feedback',SITE_ORIGIN).href}};
export default function FeedbackPage(){return <><SiteHeader active="feedback"/><main id="main-content" className="community-page"><CommunityPageUI/></main><SiteFooter/></>;}
