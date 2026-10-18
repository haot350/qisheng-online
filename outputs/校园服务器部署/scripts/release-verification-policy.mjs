// New maintenance releases are explicit; historical scripts remain unchanged.
const policies={
 '0.9.2':{protocolVersion:'campus-mp-0.9.0',rollbackVersion:'0.9.1',schema:6},
};
export function releaseVerificationPolicy(version){const p=policies[version];return p?Object.freeze({...p}):null;}
