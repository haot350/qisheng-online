export type PlatformPerformance={thermalStatus:number;powerSave:boolean;lowMemory:boolean};
let value:PlatformPerformance={thermalStatus:0,powerSave:false,lowMemory:false};
export const platformPerformance=()=>value;
export function updatePlatformPerformance(input:unknown){
 const v=input as Partial<PlatformPerformance>|undefined,status=v?.thermalStatus;
 if(!v||typeof status!=='number'||!Number.isInteger(status)||status<0||status>6||typeof v.powerSave!=='boolean'||typeof v.lowMemory!=='boolean')return;
 const changed=v.thermalStatus!==value.thermalStatus||v.powerSave!==value.powerSave||v.lowMemory!==value.lowMemory;
 value={thermalStatus:status,powerSave:v.powerSave,lowMemory:v.lowMemory};
 if(changed)window.dispatchEvent(new CustomEvent('qisheng:performance',{detail:{...value}}));
}
