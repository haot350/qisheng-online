import {staticAssetUrl} from '@/lib/static-assets';
import type { Metadata } from 'next';
import Campus from '../campus';
export const dynamic = 'force-static';
export const metadata: Metadata = {
  alternates: {canonical: '/explore'},
  openGraph: {url: 'https://zbqsgz.tianhw.top/explore', images: [{url: new URL(staticAssetUrl('/images/campus-overview.jpg'),'https://zbqsgz.tianhw.top').href, width: 1280, height: 900, alt: '齐盛校园数字模型全景'}]},
  title: '探索校园 | 齐盛数字校园',
  description: '自由探索齐盛校园的建筑与庭院，体验不同的光影天气，开启自动导览或分享你的视角。',
};
export default function Explore() { return <Campus />; }
