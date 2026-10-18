import type {WeaponId,AvatarId} from './shared/protocol';
export const weapons:Record<WeaponId,string>={glock:'Glock 17',mp5:'MP5',m4a1:'M4A1',ak47:'AK-47',r870:'R870',awm:'AWM',m249:'M249'};
export const avatars:Record<AvatarId,string>={'campus-a':'校园 · A','campus-b':'校园 · B','tactical-a':'战术 · A','tactical-b':'战术 · B'};
export const difficulties={easy:'轻松',standard:'标准',hard:'挑战'};
export const modeName=(room:{mode:string;variant?:string})=>room.mode==='coop'?'合作突围':room.variant==='tdm'?'团队对战':'个人混战';
export const clock=(seconds:number)=>{const s=Math.max(0,Math.ceil(seconds));return Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0');};
