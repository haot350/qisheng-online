/** Public runtime pose inventory for Preview0.3.2, high-res mothers stay outside uploads. */
export const NPC_ASSET_IDS=Object.freeze(['jiang','meng','xu','luan','xutao','chengguotao']);
export const NPC_LOCOMOTION_POSES=Object.freeze(['combat-walk-a','combat-walk-b','combat-run-a','combat-run-b']);
export const NPC_POSE_WEBPS=Object.freeze(NPC_ASSET_IDS.flatMap(id=>['idle','attack',...NPC_LOCOMOTION_POSES,'reload',...(id==='xutao'?['skill','run-a','run-b']:id==='chengguotao'?['skill']:[])].flatMap(pose=>{const revised=pose==='attack'||pose==='reload'||pose.startsWith('combat-'),base='characters/billboards/'+(revised?'v032/':'');const name=id+(pose==='idle'?'':'-'+pose)+'.webp';return [base+name,base+'mobile/'+name];})));
export const NPC_POSE_WEBP_COUNT=NPC_POSE_WEBPS.length;
