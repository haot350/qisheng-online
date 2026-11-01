export function avatarImageView(playerId:string, revision:string|undefined, authenticated=true) {
  if (!revision) return undefined;
  const path=authenticated?'/api/v1/accounts/avatar':'/api/v1/players/'+encodeURIComponent(playerId)+'/avatar';
  const query='&revision='+encodeURIComponent(revision);
  return {revision,url:path+'?size=512'+query,thumbnailUrl:path+'?size=96'+query,width:512,height:512,authenticated};
}
