import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {listPhotoMetadata,photoSummary,readPhoto,removePhoto,watchAlbum} from './album.ts';
import {AlbumThumbnailCache} from './thumbnail.ts';
import type {PhotoMetadata,PhotoRecord} from './types.ts';

export function useAlbumMedia(extras:PhotoRecord[]=[],enabled=true){
 const extraRef=useRef(new Map<string,PhotoRecord>());extraRef.current=new Map(extras.map(photo=>[photo.id,photo]));
 const removed=useRef(new Set<string>()),alive=useRef(true),[photos,setPhotos]=useState<PhotoMetadata[]>(extras.map(photoSummary)),[selected,setSelected]=useState<PhotoMetadata|null>(extras[0]?photoSummary(extras[0]):null),[record,setRecord]=useState<PhotoRecord|null>(extras[0]??null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [listError,setListError]=useState(''),[recordError,setRecordError]=useState(''),[missing,setMissing]=useState(false),[listLoading,setListLoading]=useState(false),[listAttempt,setListAttempt]=useState(0),[recordAttempt,setRecordAttempt]=useState(0);
 const get=async(id:string)=>extraRef.current.get(id)??await readPhoto(id);
 const[cache]=useState(()=>new AlbumThumbnailCache(async photo=>{const row=await get(photo.id);if(!row)throw Error('这张照片已不在本机相册中。');return row.blob;}));
 const signature=extras.map(photo=>`${photo.id}:${photo.taskId??''}:${photo.reality?.anchorId??''}`).join('|');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let cancelled=false,serial=0;const refresh=()=>{const request=++serial;setListError('');setListLoading(true);void listPhotoMetadata().then(rows=>{if(cancelled||request!==serial)return;const extraRows=[...extraRef.current.values()].filter(photo=>!rows.some(row=>row.id===photo.id)).map(photoSummary),merged=[...extraRows,...rows].filter(photo=>!removed.current.has(photo.id));cache.reconcileAvailable(merged.map(photo=>photo.id));setPhotos(merged);setSelected(old=>merged.find(photo=>photo.id===old?.id)??merged[0]??null);setListLoading(false);}).catch(()=>{if(!cancelled&&request===serial){setListLoading(false);setListError('本机相册暂时无法读取，请重试。');}});};refresh();const unwatch=watchAlbum(refresh);return()=>{cancelled=true;serial++;unwatch();};},[signature,cache,listAttempt]);
 useEffect(()=>{let cancelled=false;setRecordError('');setMissing(false);if(!selected||!enabled){setRecord(null);setLoading(false);return;}const extra=extraRef.current.get(selected.id);setRecord(extra??null);setLoading(!extra);void get(selected.id).then(photo=>{if(cancelled)return;setRecord(photo);setLoading(false);setMissing(!photo);}).catch(()=>{if(!cancelled){setLoading(false);setRecordError('这张照片暂时无法读取，请重试。');}});return()=>{cancelled=true;};},[selected?.id,selected?.taskId,selected?.taskLabel,selected?.reality?.anchorId,selected?.reality?.image,signature,enabled,recordAttempt]);
 useLayoutEffect(()=>{if(enabled)cache.activate();else cache.dispose();return()=>cache.dispose();},[cache,enabled]);
 const retryList=()=>{setError('');setListAttempt(n=>n+1);};
 const retryRecord=()=>{setError('');setRecordAttempt(n=>n+1);};
 const retry=()=>{retryList();retryRecord();};
 const select=(photo:PhotoMetadata)=>{setError('');if(photo.id!==selected?.id)setRecord(null);else if(recordError||missing)retryRecord();setSelected(photo);};
 const erase=async(photo:PhotoMetadata)=>{if(photo.storageStatus!=='temporary')await removePhoto(photo.id);if(!alive.current)return photo.id;removed.current.add(photo.id);cache.remove(photo.id);setPhotos(old=>old.filter(row=>row.id!==photo.id));setRecord(old=>old?.id===photo.id?null:old);setSelected(old=>old?.id===photo.id?null:old);return photo.id;};
 return{photos,selected,record:record?.id===selected?.id?record:null,loading,error:error||listError||recordError,listError,recordError,missing,listLoading,setError,cache,select,erase,get,retryList,retryRecord,retry};
}

/** Offscreen grid rows have no image source and never open the original. */
export function PhotoThumbnail({photo,cache,alt='玩家拍摄的数字校园照片'}:{photo:PhotoMetadata;cache:AlbumThumbnailCache;alt?:string}){
 const ref=useRef<HTMLImageElement|null>(null),[visible,setVisible]=useState(false),[url,setURL]=useState('');
 useEffect(()=>{const node=ref.current;if(!node)return;if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'64px'});observer.observe(node);return()=>observer.disconnect();},[photo.id]);
 useEffect(()=>{let cancelled=false;if(!visible){setURL('');return;}void cache.get(photo).then(value=>{if(!cancelled)setURL(value);}).catch(()=>{if(!cancelled)setURL('');});return()=>{cancelled=true;};},[photo.id,visible,cache]);
 return <img ref={ref} src={url||undefined} alt={alt} loading="lazy" decoding="async" data-photo-thumbnail={photo.id} width={photo.settings.orientation==='portrait'?213:320} height={photo.settings.orientation==='portrait'?320:213}/>;
}

/** Only the chosen photo creates an original-sized DOM image. */
export function PhotoImage({photo}:{photo:PhotoRecord}){
 const[image,setImage]=useState({id:'',url:''}),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const source=URL.createObjectURL(photo.blob);setFailed(false);setImage({id:photo.id,url:source});return()=>{URL.revokeObjectURL(source);};},[photo.id,photo.blob,attempt]);
 return <>{failed&&<div className="photo-album-alert" role="alert"><span>照片暂时无法显示。</span><button onClick={()=>{setFailed(false);setAttempt(n=>n+1);}}>重新显示照片</button></div>}<img src={image.id===photo.id?image.url||undefined:undefined} alt="玩家拍摄的数字校园照片" decoding="async" onError={()=>{if(image.id===photo.id&&image.url)setFailed(true);}} style={failed?{display:'none'}:undefined}/></>;
}
