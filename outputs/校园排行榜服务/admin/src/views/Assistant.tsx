import {useEffect, useRef, useState} from 'react';
import type {AssistantAdminConfig, AssistantUsage} from '@qisheng/shared/assistant';
import {api, useResource, type Administrator} from '../api';
import {ErrorBox, Field, Load, PageTitle, Panel, useNotify} from '../ui';

export default function Assistant({administrator}:{administrator:Administrator}) {
 const resource=useResource<AssistantAdminConfig>('assistant/config');
 const usage=useResource<AssistantUsage>('assistant/usage');
 const [draft,setDraft]=useState<AssistantAdminConfig|null>(null);
 const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const notify=useNotify(),mounted=useRef(true),action=useRef<AbortController|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;action.current?.abort();};},[]);
 useEffect(()=>{if(resource.data)setDraft({...resource.data});},[resource.data]);
 const dirty=!!draft&&(JSON.stringify(draft)!==JSON.stringify(resource.data)||!!key);
 useEffect(()=>{if(!dirty)return;const leave=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty]);
 const patch=<K extends keyof AssistantAdminConfig>(name:K,value:AssistantAdminConfig[K])=>setDraft(old=>old?{...old,[name]:value}:old);
 async function act(kind:'save'|'test') {
  if(!draft||busy)return;setBusy(true);setError('');const controller=new AbortController();action.current=controller;
  try {
   if(kind==='save') {
    const body={expectedRevision:resource.data!.revision,enabled:draft.enabled,guestDaily:draft.guestDaily,accountDaily:draft.accountDaily,globalDailyTokens:draft.globalDailyTokens,...(administrator.owner?{endpoint:draft.endpoint,model:draft.model,...(key?{apiKey:key}:{})}:{})};
    const result=await api<AssistantAdminConfig>('assistant/config',body,controller.signal);
    if(mounted.current){resource.setData(result);setDraft({...result});setKey('');notify('小齐设置已保存');}
   } else {
    await api('assistant/test',{expectedRevision:resource.data!.revision},controller.signal,65000);
    if(mounted.current){resource.reload();usage.reload();notify('生成与审核均已通过，可以启用小齐');}
   }
  } catch(e) {if(!controller.signal.aborted&&mounted.current){setError((e as Error).message);if(kind==='test'){resource.reload();usage.reload();}}}
  finally {if(mounted.current)setBusy(false);if(action.current===controller)action.current=null;}
 }
 const stats=usage.data;
 return <>
  <PageTitle eyebrow="玩家帮助" title="小齐助手"><button disabled={busy||dirty} onClick={()=>{resource.reload();usage.reload();}}>刷新</button></PageTitle>
  <Load loading={resource.loading} error={resource.error} retry={resource.reload}>
   {draft&&<form onSubmit={e=>{e.preventDefault();void act('save');}} className="assistant-admin-grid">
    <Panel title="服务状态">
     <p className="muted">回答会经过生成与独立审核两次调用，审核通过后才展示。关闭服务会停止正在处理的回答。</p>
     <label className="check"><input type="checkbox" checked={draft.enabled} disabled={busy||(!draft.enabled&&!draft.tested)} onChange={e=>patch('enabled',e.target.checked)}/>启用小齐</label>
     <p role="status">{draft.keyConfigured?(draft.tested?'连接已验证':'请先保存配置，再测试连接'):'尚未配置密钥'}</p>
     <Field label="接口地址"><input type="url" required value={draft.endpoint} disabled={!administrator.owner||busy} onChange={e=>patch('endpoint',e.target.value)} autoComplete="off" spellCheck={false}/></Field>
     <Field label="模型 ID"><input required maxLength={120} value={draft.model} disabled={!administrator.owner||busy} onChange={e=>patch('model',e.target.value)} autoComplete="off" spellCheck={false}/></Field>
     {administrator.owner&&<Field label={draft.keyConfigured?'更换密钥（留空保留现有密钥）':'API 密钥'}><input type="password" autoComplete="new-password" value={key} disabled={busy} onChange={e=>setKey(e.target.value)} maxLength={1024}/></Field>}
     <p className="muted">修改接口主机需填写新密钥；模型或密钥变更后重新测试。密钥不会回显。</p>
     <button type="button" disabled={busy||dirty||!draft.keyConfigured||!administrator.owner} onClick={()=>void act('test')}>{busy?'正在处理…':'测试生成与审核'}</button>
    </Panel>
    <Panel title="每日额度">
     <Field label="游客每日轮数"><input type="number" required min={1} max={100} step={1} value={draft.guestDaily} disabled={busy} onChange={e=>patch('guestDaily',Number(e.target.value))}/></Field>
     <Field label="账号每日轮数"><input type="number" required min={1} max={1000} step={1} value={draft.accountDaily} disabled={busy} onChange={e=>patch('accountDaily',Number(e.target.value))}/></Field>
     <Field label="全站每日 Token 上限"><input type="number" required min={10000} max={100000000} step={1000} value={draft.globalDailyTokens} disabled={busy} onChange={e=>patch('globalDailyTokens',Number(e.target.value))}/></Field>
     <p className="muted">按北京时间每日零点重置。生成与审核的输入、输出均计入；每人同时一轮，全站同时最多三轮。</p>
     <ErrorBox error={error}/>
     <div className="form-actions"><button className="primary" disabled={busy||!dirty}>{busy?'正在处理…':'保存设置'}</button><button type="button" disabled={busy||!dirty} onClick={()=>{setDraft({...resource.data!});setKey('');setError('');}}>放弃修改</button></div>
    </Panel>
   </form>}
  </Load>
  <Panel title="今日使用"><Load loading={usage.loading} error={usage.error} retry={usage.reload}>{stats&&<>
   <div className="assistant-usage"><article><small>{stats.day} · Token</small><strong>{stats.tokens.toLocaleString()} / {stats.dailyBudget.toLocaleString()}</strong></article><article><small>处理轮数</small><strong>{stats.turns}</strong></article><article><small>正在处理</small><strong>{stats.active} / 3</strong></article><article><small>平均耗时</small><strong>{(stats.averageMs/1000).toFixed(1)}秒</strong></article></div>
   <p className="muted">通过 {stats.approved} · 未通过审核 {stats.rejected} · 请求失败 {stats.failed}。只统计用量和结果，不保留聊天正文。</p>
  </>}</Load></Panel>
 </>;
}
