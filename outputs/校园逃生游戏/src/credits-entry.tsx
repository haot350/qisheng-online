import {createRoot} from 'react-dom/client';
import {CreditsPlayer} from './CreditsPlayer';
function Page(){return <CreditsPlayer onClose={()=>location.assign('/')} onCopyright={()=>location.assign('/copyright/')}/>;}
createRoot(document.getElementById('root')!).render(<Page/>);
