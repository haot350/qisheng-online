import {useGamePresence} from './game-presence';
import {createRoot} from 'react-dom/client';
import {CreditsPlayer} from './CreditsPlayer';
function Page(){useGamePresence();return <CreditsPlayer onClose={()=>location.assign('/')} onCopyright={()=>location.assign('/copyright/')}/>;}
createRoot(document.getElementById('root')!).render(<Page/>);
