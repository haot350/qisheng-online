export const NPC_APPEARANCE_MODES = ['real','test-code','fictional'] as const;
export type NpcAppearanceMode = typeof NPC_APPEARANCE_MODES[number];
export type NpcAppearancePolicy = {mode:NpcAppearanceMode;revision:number;updatedAt:number};
export type NpcAppearanceStatus = {
 policy:NpcAppearancePolicy;
 variant:'real'|'fictional';
 expiresAt:number;
 serverTime:number;
 grantExpiresAt:number|null;
 catalogRevision?:string;
 assetsUnchanged?:boolean;
 assets:Record<string,{id:string;bytes:number;sha256:string;mime:string}>;
};
export const FICTIONAL_NPC_NAMES:Readonly<Record<string,string>>={jiang:'林景川',meng:'陈砚舟',xu:'顾承远',luan:'周启明',xutao:'沈行知',chengguotao:'陆怀章',wangwenrui:'许庭安',wangdi:'贺星野',wangyuhan:'苏知夏',dafei:'赵远山'};
