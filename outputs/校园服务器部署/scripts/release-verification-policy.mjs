// New maintenance releases are explicit; historical scripts remain unchanged.
const policies={
 '0.9.2':{protocolVersion:'campus-mp-0.9.0',rollbackVersion:'0.9.1',schema:6},
 '0.9.3':{protocolVersion:'campus-mp-0.9.0',rollbackVersion:'0.9.2',schema:6},
 '0.9.4':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.3',schema:6},
 '0.9.5':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.4',schema:6},
 '0.9.6':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.5',schema:6,retainDrivingApi:true,vehicleRuleVersion:'dafei-2026-vehicles-1'},
 '0.9.7':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.6',schema:6,retainMapCatalogs:true,vehicleRuleVersion:'dafei-hfr02-1',escapeRuleVersion:'campus-hfr02-1',drivingRuleVersion:'dafei-hfr02-1',coopRuleVersion:'coop-hfr02-1',mapCatalogId:'hf-r02-web-1',sourceSha256:'996f7a264654027d3784a6254633130d82e1d6de6565ed0cdfd0fd28c88c7d3b',rollbackMapCatalogId:'campus-v17-web-1',retainedMapCatalogId:'hf-r02-web-1'},
};
export function releaseVerificationPolicy(version){const p=policies[version];return p?Object.freeze({...p}):null;}
export function assertReleaseMapManifest(manifest,policy){
 if(!policy?.retainMapCatalogs)return false;
 if(manifest?.sourceVersion!==policy.mapCatalogId||manifest?.mapCatalogId!==policy.mapCatalogId||manifest?.sourceSha256!==policy.sourceSha256)throw Error('Current map does not match the accepted source and catalog');
 return true;
}
export function assertRetainedMapCatalogAudit(audit,policy,version='0.9.7'){
 if(!policy?.retainMapCatalogs)return false;
 const expected={escape:'campus-2026-0.9.0',dafei:'dafei-2026-0.9.0',coop:'coop-2026-0.9.0',tank:'dafei-2026-vehicles-1',scooter:'dafei-2026-vehicles-1'};
 if(audit.retainsMapCatalogs!==true||audit.retainsDrivingApi!==false||audit.rollbackMapCatalogId!==policy.rollbackMapCatalogId||audit.retainedMapCatalogId!==policy.retainedMapCatalogId||audit.rollbackApiVersion!==version||audit.rollbackApiHashVerified!==true)throw Error('Verified map catalog rollback identity required');
 if(!Number.isSafeInteger(audit.rollbackCatalogCounts?.legacy)||audit.rollbackCatalogCounts.legacy<=0||!Number.isSafeInteger(audit.rollbackCatalogCounts?.retained)||audit.rollbackCatalogCounts.retained<=0)throw Error('Both legacy and retained map catalogs must be present');
 if(Object.entries(expected).some(([mode,rule])=>audit.rollbackCurrentRules?.[mode]!==rule))throw Error('Rollback API must serve legacy-map rules while retaining new credentials');
 return true;
}
