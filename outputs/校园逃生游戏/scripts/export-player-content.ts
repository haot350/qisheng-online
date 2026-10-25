import {FAQ_GROUPS,LATEST_RELEASE,PLAYER_RELEASES} from '@qisheng/shared/player-content';
// Compatibility command: both websites now import the shared package directly.
// A legacy destination argument is accepted without creating a stale snapshot.
console.log(JSON.stringify({releases:PLAYER_RELEASES.length,questions:FAQ_GROUPS.reduce((n,g)=>n+g.items.length,0),version:LATEST_RELEASE.version}));
