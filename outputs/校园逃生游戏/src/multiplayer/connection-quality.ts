import type {OnlineDiagnostics} from '../types';
export function connectionQuality(d?:OnlineDiagnostics){
 const stalled=!!d&&d.snapshotAgeMs>600,congested=!!d&&d.bufferedBytes>65536,bad=!!d&&(d.rttMs>300||d.jitterMs>65);
 return{stalled,congested,bad,poor:stalled||congested||bad,label:stalled?'连接等待中':congested?'发送拥堵':bad?'连接波动':'连接正常'};
}
