const files=Object.freeze({sites:'outputs/校园排行榜服务/src/sites.json',catalogs:'outputs/校园排行榜服务/src/site-catalogs.json',validated:'outputs/校园逃生游戏/src/escape/validated.ts'});
export const publicMapExampleFiles=new Set(Object.values(files));

/** Preserve source interfaces and IDs while keeping calibrated campus coordinates private. */
export function makePublicMapExamples(registry,validated){
 if(registry.schema!==1||!registry.catalogs?.[registry.current])throw Error('Missing current map catalog for public examples');
 const keys=Object.keys(registry.catalogs).sort(),catalogs={};
 const anonymous=(sites,offset=0)=>sites.map((site,index)=>({...site,label:`示例地点 ${index+1}`,position:[-16+(index%5)*8+offset,(site.floor??0)*3.8,-16+Math.floor(index/5)*8],...(site.roles?{roles:[...site.roles]}:{})}));
 for(const [index,id]of keys.entries())catalogs[id]=anonymous(registry.catalogs[id],index*.25);
 const current=validated.VALIDATED_ESCAPE_MAP_CATALOG_ID??registry.current;
 if(current!==registry.current)throw Error('Build current API map catalogs before exporting public source');
 const sites=catalogs[current],spawn=[0,0,0],extraction={id:'gate-extraction',label:'示例撤离点',region:'gate',position:spawn,floor:0};
 const respawns=anonymous(validated.VALIDATED_ESCAPE_RESPAWN_SITES??[]),points=[extraction,...sites],edges=[];
 for(const from of points)for(const to of points)if(from.id!==to.id)edges.push([from.id,to.id,Math.hypot(...from.position.map((n,i)=>n-to.position[i]))]);
 const json=value=>JSON.stringify(value,null,2);
 const text=`// Anonymous example geometry. Formal campus calibration is distributed separately.\nimport type {EscapeSite,EscapeVec3} from './types.ts';\nexport const VALIDATED_ESCAPE_MAP_CATALOG_ID=${JSON.stringify(current)};\nexport const VALIDATED_ESCAPE_SITES:EscapeSite[]=${json(sites)};\nexport const VALIDATED_ESCAPE_RESPAWN_SITES:EscapeSite[]=${json(respawns)};\nexport const VALIDATED_ESCAPE_SPAWN:EscapeVec3=${json(spawn)};\nexport const VALIDATED_ESCAPE_EXTRACTION:EscapeSite=${json(extraction)};\nexport const VALIDATED_ESCAPE_EDGES:[string,string,number][]=${json(edges)};\n`;
 return new Map([[files.sites,json(sites)+'\n'],[files.catalogs,json({...registry,catalogs})+'\n'],[files.validated,text]]);
}
