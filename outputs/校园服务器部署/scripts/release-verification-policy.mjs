// New maintenance releases are explicit; historical scripts remain unchanged.
const policies={
 '0.9.2':{protocolVersion:'campus-mp-0.9.0',rollbackVersion:'0.9.1',schema:6},
 '0.9.3':{protocolVersion:'campus-mp-0.9.0',rollbackVersion:'0.9.2',schema:6},
 '0.9.4':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.3',schema:6},
 '0.9.5':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.4',schema:6},
 '0.9.6':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.5',schema:6,retainDrivingApi:true,vehicleRuleVersion:'dafei-2026-vehicles-1'},
 '0.9.7':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.6',schema:6,retainMapCatalogs:true,vehicleRuleVersion:'dafei-hfr02-1',escapeRuleVersion:'campus-hfr02-1',drivingRuleVersion:'dafei-hfr02-1',coopRuleVersion:'coop-hfr02-1',mapSourceVersion:'hf-r02-web-1',mapCatalogId:'hf-r02-web-1',sourceSha256:'996f7a264654027d3784a6254633130d82e1d6de6565ed0cdfd0fd28c88c7d3b',rollbackMapCatalogId:'campus-v17-web-1',retainedMapCatalogId:'hf-r02-web-1'},
 '0.9.8':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.6',schema:6,retainMapCatalogs:true,mapIndexSchema:2,rollbackApiVersion:'0.9.8',vehicleRuleVersion:'dafei-hfr02-1',escapeRuleVersion:'campus-hfr02-1',drivingRuleVersion:'dafei-hfr02-1',coopRuleVersion:'coop-hfr02-1',mapSourceVersion:'hf-r02-web-2',mapCatalogId:'hf-r02-web-1',sourceSha256:'996f7a264654027d3784a6254633130d82e1d6de6565ed0cdfd0fd28c88c7d3b',rollbackMapCatalogId:'campus-v17-web-1',retainedMapCatalogId:'hf-r02-web-1'},
 '0.10.0':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.6',schema:6,retainMapCatalogs:true,mapIndexSchema:1,rollbackApiVersion:'0.10.0',vehicleRuleVersion:'dafei-webr01-1',escapeRuleVersion:'campus-webr01-1',drivingRuleVersion:'dafei-webr01-1',coopRuleVersion:'coop-webr01-1',mapSourceVersion:'web-r01-campus-1',mapCatalogId:'web-r01-campus-1',physicsRevision:'web-r01-physics-1',sourceSha256:'996f7a264654027d3784a6254633130d82e1d6de6565ed0cdfd0fd28c88c7d3b',rollbackMapCatalogId:'campus-v17-web-1',retainedMapCatalogId:'web-r01-campus-1',retainedMapCatalogIds:['hf-r02-web-1','web-r01-campus-1'],expectedPreviousStaticReleaseId:'20261028T160749Z-0.9.6',expectedPreviousRealtimeVersion:'0.9.6',expectedPreviousApiVersions:['0.9.7','0.10.0']},
 '0.10.1':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.10.0',schema:6,sameMapCatalogRollback:true,mapIndexSchema:2,rollbackApiVersion:'0.10.0',vehicleRuleVersion:'dafei-webr01-1',escapeRuleVersion:'campus-webr01-1',drivingRuleVersion:'dafei-webr01-1',coopRuleVersion:'coop-webr01-1',mapSourceVersion:'web-r01-campus-1',mapCatalogId:'web-r01-campus-1',physicsRevision:'web-r01-physics-2',visualRevision:'web-lite-r01-fix1',sourceSha256:'996f7a264654027d3784a6254633130d82e1d6de6565ed0cdfd0fd28c88c7d3b',rollbackMapCatalogId:'web-r01-campus-1',rollbackMapSourceVersion:'web-r01-campus-1',rollbackPhysicsRevision:'web-r01-physics-1',rollbackVisualRevision:'web-lite-r01',retainedMapCatalogIds:['campus-v17-web-1','hf-r02-web-1','web-r01-campus-1'],expectedPreviousStaticReleaseId:'20261030T162648Z-0.10.0',expectedPreviousRealtimeVersion:'0.10.0',expectedPreviousApiVersions:['0.10.0']},
 '0.10.2':{"protocolVersion":"campus-mp-0.9.4","rollbackVersion":"0.10.1","schema":6,"sameMapCatalogRollback":true,"mapIndexSchema":2,"rollbackApiVersion":"0.10.1","vehicleRuleVersion":"dafei-webr01-1","escapeRuleVersion":"campus-webr01-1","drivingRuleVersion":"dafei-webr01-1","coopRuleVersion":"coop-webr01-1","mapSourceVersion":"web-r01-campus-1","mapCatalogId":"web-r01-campus-1","physicsRevision":"web-r01-physics-2","visualRevision":"web-lite-r01-fix1","sourceSha256":"996f7a264654027d3784a6254633130d82e1d6de6565ed0cdfd0fd28c88c7d3b","rollbackMapCatalogId":"web-r01-campus-1","rollbackMapSourceVersion":"web-r01-campus-1","rollbackPhysicsRevision":"web-r01-physics-2","rollbackVisualRevision":"web-lite-r01-fix1","retainedMapCatalogIds":["campus-v17-web-1","hf-r02-web-1","web-r01-campus-1"],"expectedPreviousStaticReleaseId":"20261031T134107Z-0.10.1","expectedPreviousRealtimeVersion":"0.10.1","expectedPreviousApiVersions":["0.10.1"]},
};
policies['0.11.0']={...policies['0.10.2'],staticOnly:true,rollbackVersion:'0.10.2',rollbackApiVersion:'0.10.2',expectedPreviousStaticReleaseId:'20261031T160222Z-0.10.2',expectedPreviousRealtimeVersion:'0.10.2',expectedPreviousApiVersions:['0.10.2']};
export function releaseVerificationPolicy(version){const p=policies[version];return p?Object.freeze(Object.fromEntries(Object.entries(p).map(([key,value])=>[key,Array.isArray(value)?Object.freeze([...value]):value]))):null;}
export function assertReleaseMapManifest(manifest,policy){
 if(!policy?.mapCatalogId)return false;
 if(manifest?.sourceVersion!==(policy.mapSourceVersion??policy.mapCatalogId)||manifest?.mapCatalogId!==policy.mapCatalogId||manifest?.sourceSha256!==policy.sourceSha256)throw Error('Current map does not match the accepted resource revision, source and catalog');
 if(policy.physicsRevision&&manifest.physicsRevision!==policy.physicsRevision)throw Error('Current physical revision does not match the accepted map');
 if(policy.visualRevision&&manifest.visualRevision!==policy.visualRevision)throw Error('Current visual revision does not match the accepted map');
 return true;
}
export function assertRetainedMapCatalogAudit(audit,policy,version=policy?.rollbackApiVersion??'0.9.7'){
 if(!policy?.retainMapCatalogs)return false;
 const expected={escape:'campus-2026-0.9.0',dafei:'dafei-2026-0.9.0',coop:'coop-2026-0.9.0',tank:'dafei-2026-vehicles-1',scooter:'dafei-2026-vehicles-1'};
 if(audit.retainsMapCatalogs!==true||audit.retainsDrivingApi!==false||audit.rollbackMapCatalogId!==policy.rollbackMapCatalogId||audit.retainedMapCatalogId!==policy.retainedMapCatalogId||audit.rollbackApiVersion!==version||audit.rollbackApiHashVerified!==true)throw Error('Verified map catalog rollback identity required');
 if(!Number.isSafeInteger(audit.rollbackCatalogCounts?.legacy)||audit.rollbackCatalogCounts.legacy<=0||!Number.isSafeInteger(audit.rollbackCatalogCounts?.retained)||audit.rollbackCatalogCounts.retained<=0)throw Error('Both legacy and retained map catalogs must be present');
 if(policy.retainedMapCatalogIds){
  if(JSON.stringify(audit.retainedMapCatalogIds)!==JSON.stringify(policy.retainedMapCatalogIds)||policy.retainedMapCatalogIds.some(id=>!Number.isSafeInteger(audit.rollbackCatalogCounts?.catalogs?.[id])||audit.rollbackCatalogCounts.catalogs[id]<=0))throw Error('Every archived and new map catalog must remain in the rollback API');
 }
 if(Object.entries(expected).some(([mode,rule])=>audit.rollbackCurrentRules?.[mode]!==rule))throw Error('Rollback API must serve legacy-map rules while retaining new credentials');
 return true;
}
/** A resource-only hotfix returns to the prior matching catalog and rules; it
 * does not rebuild a legacy-map API or restore a database snapshot. */
export function assertSameMapCatalogRollbackAudit(audit,policy){
 if(!policy?.sameMapCatalogRollback)return false;
 if(audit.retainsMapCatalogs!==false||audit.retainsDrivingApi!==false||audit.rollbackApiVersion!==policy.rollbackVersion||audit.rollbackMapCatalogId!==policy.rollbackMapCatalogId||audit.rollbackMapSourceVersion!==policy.rollbackMapSourceVersion||audit.rollbackMapSourceSha256!==policy.sourceSha256||!Number.isInteger(audit.rollbackMapCatalogCount)||audit.rollbackMapCatalogCount<1||!Number.isInteger(audit.rollbackSchemaCeiling)||audit.rollbackSchemaCeiling<policy.schema)throw Error('Previous same-catalog API and resource revision required');
 if(policy.expectedPreviousStaticReleaseId){if(audit.rollbackApiHashVerified!==true||audit.rollbackPhysicsRevision!==policy.rollbackPhysicsRevision||audit.rollbackVisualRevision!==policy.rollbackVisualRevision||policy.retainedMapCatalogIds.some(id=>!Number.isSafeInteger(audit.rollbackCatalogCounts?.catalogs?.[id])||audit.rollbackCatalogCounts.catalogs[id]<1))throw Error('Exact previous API payload hashes, revisions and all three catalogs required');}
 const rules={escape:policy.escapeRuleVersion,dafei:policy.drivingRuleVersion,coop:policy.coopRuleVersion,tank:policy.drivingRuleVersion,scooter:policy.drivingRuleVersion};
 if(Object.entries(rules).some(([mode,rule])=>audit.rollbackCurrentRules?.[mode]!==rule))throw Error('Resource rollback must retain the current catalog scoring rules');
 return true;
}
