import urls from './generated/static-assets.json' with {type:'json'};
export function staticAssetUrl(url:string):string {
 const split=url.search(/[?#]/),pathname=split<0?url:url.slice(0,split),suffix=split<0?'':url.slice(split);
 return ((urls as Record<string,string>)[pathname]??pathname)+suffix;
}
