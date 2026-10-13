import type {MapCacheStats} from './map-cache';

export const mapDownloadSize=(bytes:number)=>(Math.max(0,bytes)/1000000).toFixed(1)+' MB';
export function mapDownloadState(stats:MapCacheStats,{loading,error}:{loading:boolean;error:string}){
 if(loading)return {title:'正在读取本机地图',action:'正在检查',disabled:true};
 if(error)return {title:'地图信息暂时无法读取',action:'重新检查',disabled:false};
 if(!stats.available)return {title:'本机暂时无法缓存地图',action:'重新检查',disabled:false};
 if(stats.current?.complete)return {title:'完整地图已准备好',action:'已全部缓存',disabled:true};
 if(stats.prefetch.running)return {title:stats.prefetch.stage==='reading'?'正在读取本机地图':stats.prefetch.stage==='verifying'?'正在校验地图':'正在下载地图',action:'暂停下载',disabled:false};
 if(stats.prefetch.error)return {title:'地图下载已中断',action:'重试下载',disabled:false};
 if(stats.prefetch.pausedBy==='battle')return {title:'已为联机暂停下载',action:'返回菜单后继续',disabled:true};
 if(stats.prefetch.pausedBy==='user')return {title:'地图下载已暂停',action:'继续下载',disabled:false};
 return {title:stats.current?.bytes?'部分地图已缓存':'尚未缓存地图',action:stats.current?.bytes?'下载剩余地图':'下载完整地图',disabled:!stats.current};
}
