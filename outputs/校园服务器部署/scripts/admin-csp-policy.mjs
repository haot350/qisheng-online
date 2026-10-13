// Multiple CSP headers are enforced together. The site's broader policy must not
// be mistaken for relaxing the independent administrator response policy.
export function hasRestrictedAdminCsp(header){
 return typeof header==='string'&&header.split(',').some(policy=>{
  const directives=new Map(policy.split(';').map(part=>part.trim().split(/\s+/)).filter(parts=>parts[0]).map(([name,...values])=>[name,values.join(' ')]));
  return directives.get('default-src')==="'none'"&&directives.get('script-src')==="'self'"&&directives.get('style-src')==="'self'"&&directives.get('connect-src')==="'self'"&&directives.get('base-uri')==="'none'"&&directives.get('frame-ancestors')==="'none'";
 });
}
