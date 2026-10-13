export type FAQGroupId='start'|'escape'|'dafei'|'story'|'storage';
export type FAQItem={q:string;a:string};
export type FAQGroup={id:FAQGroupId;title:string;items:readonly FAQItem[]};
export function defaultFAQGroup(mode:string='story',context:'home'|'prepare'='home'):FAQGroupId{
 if(context==='home')return 'start';
 return mode==='escape'?'escape':mode==='dafei'?'dafei':mode==='story'||mode==='roam'?'story':'start';
}
export function searchFAQs(groups:readonly FAQGroup[],query:string):readonly FAQGroup[]{
 const tokens=query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 if(!tokens.length)return groups;
 return groups.map(group=>({...group,items:group.items.filter(item=>{
  const text=(item.q+' '+item.a).normalize('NFKC').toLocaleLowerCase();
  return tokens.every(token=>text.includes(token));
 })})).filter(group=>group.items.length>0);
}
