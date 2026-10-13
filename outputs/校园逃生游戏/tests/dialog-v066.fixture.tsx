import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import RankingUI from '../src/RankingUI';
import FeedbackUI from '../src/FeedbackUI';
import '../src/feedback.css';
function Fixture(){
 const [feedback,setFeedback]=useState(false),[identity,setIdentity]=useState(false);
 return <><button id="original" onClick={()=>setFeedback(true)}>反馈</button>
  {identity&&<RankingUI mode="escape" initialPanel="identity" onClose={()=>setIdentity(false)}/>}
  {feedback&&<FeedbackUI onClose={()=>setFeedback(false)} onIdentity={()=>setIdentity(true)}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
