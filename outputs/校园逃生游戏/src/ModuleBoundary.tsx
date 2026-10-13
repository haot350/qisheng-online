import {refreshCurrentPage} from './fresh-browser';
import {Component,createElement,Suspense,type ElementType,type ReactElement,type ReactNode} from 'react';

type Props={children:ReactElement;label:string;retry:()=>ElementType;onBlocked?:(blocked:boolean)=>void;onClose?:()=>void};
type State={error:Error|null;replacement:ElementType|null;retrying:boolean};
/** Rebuild React.lazy on retry: its rejected promise is otherwise permanent. */
export class ModuleBoundary extends Component<Props,State>{
  state:State={error:null,replacement:null,retrying:false};
  static getDerivedStateFromError(error:Error){return {error,retrying:false};}
  componentDidCatch(){this.props.onBlocked?.(true);}
  componentWillUnmount(){if(this.state.error||this.state.retrying)this.props.onBlocked?.(false);}
  retry=()=>{this.props.onBlocked?.(true);this.setState({error:null,replacement:this.props.retry(),retrying:true});};
  ready=()=>{if(this.state.retrying){this.setState({retrying:false});this.props.onBlocked?.(false);}};
  close=()=>{this.props.onBlocked?.(false);this.props.onClose?.();};
  render():ReactNode{
    if(this.state.error)return <div className="streaming-shade"><section className="streaming-panel" role="alert"><h2>{this.props.label}暂时无法打开</h2><p>先重试。若仍无法载入，请刷新页面。</p><button className="primary" autoFocus onClick={this.retry}>重试</button><button className="secondary" onClick={()=>void refreshCurrentPage('game')}>刷新页面</button>{this.props.onClose&&<button className="text-button" onClick={this.close}>关闭</button>}</section></div>;
    const child=this.state.replacement?createElement(this.state.replacement,this.props.children.props):this.props.children;
    return <Suspense fallback={this.state.retrying?<div className="streaming-shade" role="status">正在重新载入{this.props.label}…</div>:null}><Ready onReady={this.ready}>{child}</Ready></Suspense>;
  }
}
class Ready extends Component<{onReady:()=>void;children:ReactNode}>{componentDidMount(){this.props.onReady();}componentDidUpdate(){this.props.onReady();}render(){return this.props.children;}}
