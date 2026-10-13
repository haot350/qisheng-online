'use client';
import {useEffect,useId,useState} from 'react';
import {searchFAQs,type FAQGroup,type FAQGroupId} from './faq-search';
export default function FAQContent({groups,initialGroup='start'}:{groups:readonly FAQGroup[];initialGroup?:FAQGroupId}){
 const [selected,setSelected]=useState<FAQGroupId>(initialGroup),[query,setQuery]=useState(''),id=useId();
 useEffect(()=>{setSelected(initialGroup);setQuery('');},[initialGroup]);
 const searching=!!query.trim(),group=groups.find(item=>item.id===selected)??groups[0];
 const visible=searching?searchFAQs(groups,query):group?[group]:[],count=visible.reduce((n,item)=>n+item.items.length,0);
 return <div className="reading-faq">
  <div className="reading-search"><label htmlFor={id}>搜索常见问题</label><div><input id={id} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="输入问题或关键词" autoComplete="off" maxLength={120}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="清空搜索">清空</button>}</div></div>
  <nav className="reading-topics" aria-label="问题分类">{groups.map(item=><button type="button" key={item.id} aria-pressed={!searching&&item.id===group?.id} onClick={()=>{setSelected(item.id);setQuery('');}}>{item.title}</button>)}</nav>
  <p className="reading-search-result" role="status">{searching?'找到 '+count+' 个问题':group?.title}</p>
  {searching&&!count?<div className="reading-empty"><p>没有找到相关问题。</p><p>换个关键词，或回到分类查看。</p><button type="button" onClick={()=>setQuery('')}>返回分类</button></div>:visible.map(section=><section className="reading-faq-group" key={section.id} aria-label={section.title}>{searching&&<h3>{section.title}</h3>}{section.items.map(item=><details key={item.q}><summary>{item.q}<span aria-hidden="true">+</span></summary><p>{item.a}</p></details>)}</section>)}
 </div>;
}
