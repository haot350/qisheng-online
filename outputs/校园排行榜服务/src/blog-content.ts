import {AppError} from './validation.js';
import {renderToHTMLString} from '@tiptap/static-renderer/pm/html-string';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import {getSchema} from '@tiptap/core';

export type BlogNode={type:string;text?:string;attrs?:Record<string,unknown>;marks?:{type:string;attrs?:Record<string,unknown>}[];content?:BlogNode[]};
export type BlogDocument={type:'doc';content:BlogNode[]};
export const EMPTY_BLOG_DOCUMENT:BlogDocument={type:'doc',content:[{type:'paragraph'}]};
const containers=new Set(['doc','paragraph','heading','bulletList','orderedList','listItem','blockquote']);
const extensions=[StarterKit.configure({heading:{levels:[2,3]},codeBlock:false}),Image];
const schema=getSchema(extensions);
const safeMedia=/^\/api\/v1\/blog\/media\/([A-Za-z0-9_-]{12,80})$/;
export function blogText(value:unknown,min:number,max:number,label:string){
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new AppError('BLOG_CONTENT',label+'长度不合适。');
 return value.trim();
}
export function safeBlogLink(value:unknown){
 if(typeof value!=='string'||value.length>2000||/[\u0000-\u0020\\]/.test(value))return null;
 if(/^\/(?!\/)/.test(value))return value;
 try {const parsed=new URL(value);return ['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password?parsed.href:null;}catch{return null;}
}
export function normalizeBlogDocument(value:unknown):{document:BlogDocument;media:string[];plain:string}{
 if(!value||typeof value!=='object'||JSON.stringify(value).length>180000)throw new AppError('BLOG_CONTENT','正文过长或格式无效。');
 let count=0,textLength=0;const media=new Set<string>(),plain:string[]=[];
 function visit(raw:any,depth:number):BlogNode {
  if(++count>2500||depth>12||!raw||typeof raw!=='object'||typeof raw.type!=='string')throw new AppError('BLOG_CONTENT','正文结构过于复杂。');
  const type=raw.type;
  if(type==='text'){
   if(typeof raw.text!=='string'||(textLength+=raw.text.length)>100000)throw new AppError('BLOG_CONTENT','正文过长。');
   plain.push(raw.text);const marks:NonNullable<BlogNode['marks']>=[];
   for(const mark of Array.isArray(raw.marks)?raw.marks.slice(0,6):[]){
    if(['bold','italic','strike','code'].includes(mark?.type))marks.push({type:mark.type});
    else if(mark?.type==='link'){const href=safeBlogLink(mark.attrs?.href);if(!href)throw new AppError('BLOG_LINK','链接地址无效。');marks.push({type:'link',attrs:{href,target:'_blank',rel:'noopener noreferrer'}});}
   }
   return {type,text:raw.text,...(marks.length?{marks}:{})};
  }
  if(type==='image'){
   const match=safeMedia.exec(String(raw.attrs?.src??''));if(!match)throw new AppError('BLOG_IMAGE','请先上传正文图片。');
   media.add(match[1]);return {type,attrs:{src:match[0],alt:String(raw.attrs?.alt??'').slice(0,200),title:String(raw.attrs?.title??'').slice(0,200)}};
  }
  if(type==='hardBreak'||type==='horizontalRule')return {type};
  if(!containers.has(type))throw new AppError('BLOG_CONTENT','正文包含暂不支持的内容。');
  const attrs=type==='heading'?{level:raw.attrs?.level===3?3:2}:type==='orderedList'?{start:Math.min(999,Math.max(1,Number(raw.attrs?.start)||1))}:undefined;
  const content=Array.isArray(raw.content)?raw.content.map((x:any)=>visit(x,depth+1)):[];
  if(type==='doc'&&depth!==0||depth===0&&type!=='doc')throw new AppError('BLOG_CONTENT','正文格式无效。');
  return {type,...(attrs?{attrs}:{}),...(content.length?{content}:{})};
 }
 const document=visit(value,0) as BlogDocument;
 if(!Array.isArray(document.content))document.content=[];
 try{schema.nodeFromJSON(document).check();}catch{throw new AppError('BLOG_CONTENT','正文段落格式无效，请重新整理这一段。');}
 return {document,media:[...media],plain:plain.join(' ').slice(0,100000)};
}
export const escapeBlogHtml=(s:unknown)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
/** The normalized document is intentionally rendered without user HTML. */
export function renderBlogDocument(document:BlogDocument):string {
 const e=escapeBlogHtml;
 return renderToHTMLString({content:document,extensions,options:{nodeMapping:{image:({node})=>'<figure><img loading="lazy" decoding="async" src="'+e(node.attrs.src)+'" alt="'+e(node.attrs.alt)+'">'+(node.attrs.title?'<figcaption>'+e(node.attrs.title)+'</figcaption>':'')+'</figure>'}}});
}
