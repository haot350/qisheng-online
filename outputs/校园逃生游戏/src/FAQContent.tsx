import {useSyncExternalStore,type ComponentProps} from 'react';
import FAQContentBase from '@qisheng/shared/player-content/FAQContent';
import {npcAppearanceSnapshot,npcAppearanceSubscribe,npcPublicText} from './npc-appearance';
export default function FAQContent(props:ComponentProps<typeof FAQContentBase>){useSyncExternalStore(npcAppearanceSubscribe,npcAppearanceSnapshot,npcAppearanceSnapshot);return <FAQContentBase {...props} groups={props.groups.map(group=>({...group,title:npcPublicText(group.title),items:group.items.map(item=>({q:npcPublicText(item.q),a:npcPublicText(item.a)}))}))}/>;}
