'use client';
import {FeedbackUI as SharedFeedbackUI,type FeedbackUIProps} from '@qisheng/shared/community';
import {rankingClient} from './ranking/client';
export {prepareFeedbackPicture} from '@qisheng/shared/community';
export type {FeedbackDiagnostics} from '@qisheng/shared/community';
export default function FeedbackUI(props:Omit<FeedbackUIProps,'client'>){return <SharedFeedbackUI {...props} client={rankingClient}/>;}
