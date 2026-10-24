// New maintenance releases are explicit; historical scripts remain unchanged.
const policies={
 '0.9.2':{protocolVersion:'campus-mp-0.9.0',rollbackVersion:'0.9.1',schema:6},
 '0.9.3':{protocolVersion:'campus-mp-0.9.0',rollbackVersion:'0.9.2',schema:6},
 '0.9.4':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.3',schema:6},
 '0.9.5':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.4',schema:6},
 '0.9.6':{protocolVersion:'campus-mp-0.9.4',rollbackVersion:'0.9.5',schema:6,retainDrivingApi:true,vehicleRuleVersion:'dafei-2026-vehicles-1'},
};
export function releaseVerificationPolicy(version){const p=policies[version];return p?Object.freeze({...p}):null;}
