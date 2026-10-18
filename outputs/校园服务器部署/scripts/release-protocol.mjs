const protocolPattern=/^campus-mp-\d+\.\d+\.\d+$/;
// Older immutable releases did not declare the wire protocol in their manifest.
const legacyProtocols=Object.fromEntries(['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.6.8','0.6.9','0.7.0','0.7.1','0.8.0'].map(version=>[version,'campus-mp-'+version]));

export function requiresExplicitReleaseProtocol(version){
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(version??'');
 if(!match)throw Error('Three-part public release version required');
 const [major,minor,patch]=match.slice(1).map(Number);
 return major>0||minor>8||minor===8&&patch>=1;
}

export function canonicalProtocolVersion(source){
 const matches=[...source.matchAll(/^export\s+const\s+PROTOCOL_VERSION\s*=\s*['"]([^'"]+)['"]\s+as\s+const\s*;/gm)];
 if(matches.length!==1||!protocolPattern.test(matches[0][1]))throw Error('Canonical multiplayer protocol declaration required');
 return matches[0][1];
}

export function releaseProtocolVersion(manifest){
 const explicit=requiresExplicitReleaseProtocol(manifest?.version);
 if(manifest?.protocolVersion!==undefined){
  if(!protocolPattern.test(manifest.protocolVersion))throw Error('Invalid release protocolVersion');
  if(!explicit&&manifest.protocolVersion!==legacyProtocols[manifest.version])throw Error('Historical release protocol mismatch');
  return manifest.protocolVersion;
 }
 if(explicit)throw Error('Explicit release protocolVersion required');
 const legacy=legacyProtocols[manifest.version];
 if(!legacy)throw Error('Unknown historical release protocol');
 return legacy;
}
