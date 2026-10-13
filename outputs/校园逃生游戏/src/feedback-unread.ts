'use client';
import {useFeedbackUnread as useSharedFeedbackUnread} from '@qisheng/shared/community/unread';
import {rankingClient} from './ranking/client.ts';
export * from '@qisheng/shared/community/unread';
export function useFeedbackUnread(active:boolean){return useSharedFeedbackUnread(active,rankingClient);}
