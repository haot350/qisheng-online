import dark from './assets/branding/qisheng-online-dark.webp';
import light from './assets/branding/qisheng-online-light.webp';

/** The accessible game name remains available independently of the bitmap. */
export function BrandLogo({variant='dark',className=''}:{variant?:'dark'|'light';className?:string}){
 return <img className={'qisheng-brand '+className} src={variant==='light'?light:dark} alt="齐盛Online" decoding="async" draggable={false}/>;
}
