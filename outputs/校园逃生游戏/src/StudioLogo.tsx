import {staticAssetUrl} from './static-assets';
import './studio-brand.css';

export function StudioLogo({variant='primary',className=''}:{variant?:'primary'|'reverse';className?:string}){
 return <img className={'liuframe-brand '+className} src={staticAssetUrl(`/images/branding/liuframe-interactive-${variant}.webp`)} width={2043} height={770} alt="LIUFRAME INTERACTIVE" decoding="async" draggable={false}/>;
}
