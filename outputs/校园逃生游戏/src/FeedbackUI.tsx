'use client';
import {FeedbackUI as SharedFeedbackUI,type FeedbackUIProps} from '@qisheng/shared/community';
import {rankingClient} from './ranking/client';
import {useState} from 'react';
import {safeConnectionSummary} from '@qisheng/shared/connection-summary';
export {prepareFeedbackPicture} from '@qisheng/shared/community';
export type {FeedbackDiagnostics} from '@qisheng/shared/community';
export default function FeedbackUI({connection,...props}:Omit<FeedbackUIProps,'client'>&{connection?:unknown}){const [includeConnection,setIncludeConnection]=useState(false),summary=safeConnectionSummary(connection);return <>{summary&&<label className="feedback-connection-choice"><input type="checkbox" checked={includeConnection} onChange={event=>setIncludeConnection(event.target.checked)}/>提交反馈时附上连接摘要<small>只含延迟、校正和停顿数据</small></label>}<SharedFeedbackUI {...props} diagnostics={{...props.diagnostics,...(includeConnection&&summary?{connection:summary}:{})}} client={rankingClient}/></>;}
