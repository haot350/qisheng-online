import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type WeaponKind = 'pistol' | 'auto' | 'scatter';
export interface CharacterState { speed: number; aim: boolean; firing: boolean; reloading: boolean; suppressed: number; hit: number }
export interface CharacterRig {
  root: THREE.Group;
  setWeapon(id: WeaponKind): void;
  update(dt: number, state: CharacterState, distance: number): void;
  dispose(): void;
}
export interface ViewWeaponState { weapon: WeaponKind; moving: number; aim: boolean; reloading: number; recoil: number; running: boolean; crouch: boolean }
export interface ViewWeapon { root: THREE.Group; update(dt: number, state: ViewWeaponState): void; dispose(): void }

export const CHARACTER_DESIGNS = [
  { name: '姜晓峰', id: 'jiang-xiaofeng', skin: '#d7a184', coat: '#242834', inner: '#195bbb', pants: '#24252d', hair: '#17171d', collar: '#185cba', width: .93, height: .97, faceWidth: .95, longHair: true, glasses: true },
  { name: '孟庆升', id: 'meng-qingsheng', skin: '#c99575', coat: '#235569', inner: '#214858', pants: '#414247', hair: '#555958', collar: '#b9ab86', width: 1.07, height: 1.01, faceWidth: 1.08, longHair: false, glasses: false },
  { name: '徐泗龙', id: 'xu-silong', skin: '#cd9b7f', coat: '#cbcbe2', inner: '#d6d4e8', pants: '#323841', hair: '#202323', collar: '#dad6e8', width: .99, height: 1.02, faceWidth: 1.01, longHair: false, glasses: true },
  { name: '栾晓光', id: 'luan-xiaoguang', skin: '#d7a085', coat: '#b63865', inner: '#c34070', pants: '#23272e', hair: '#191a21', collar: '#af355f', width: 1.12, height: .95, faceWidth: 1.06, longHair: true, glasses: false },
] as const;
type Design = typeof CHARACTER_DESIGNS[number];
type BoneName = 'hips'|'spine'|'chest'|'neck'|'head'|'armL'|'foreL'|'handL'|'armR'|'foreR'|'handR'|'thighL'|'shinL'|'footL'|'thighR'|'shinR'|'footR';
type V = [number, number, number];
const WHITE = '#eee8dd';
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();


// Every visible component is geometry. Parts are merged into one vertex-coloured
// skinned mesh per LOD, keeping four animated characters inexpensive to draw.
class Sculpt {
  parts: THREE.BufferGeometry[] = [];
  constructor(private bone = 0, private offset = new THREE.Vector3()) {}
  at(bone: number, offset: THREE.Vector3) { this.bone = bone; this.offset = offset; return this; }
  add(g: THREE.BufferGeometry, color: string, p: V = [0,0,0], s: V = [1,1,1], rotation: V = [0,0,0]) {
    g = g.index ? g.toNonIndexed() : g;
    Q.setFromEuler(E.set(...rotation));
    M.compose(new THREE.Vector3(...p).add(this.offset), Q, new THREE.Vector3(...s));
    g.applyMatrix4(M);
    const count = g.attributes.position.count;
    const c = new THREE.Color(color), colors = new Float32Array(count*3);
    const si = new Uint16Array(count*4), sw = new Float32Array(count*4);
    for(let i=0;i<count;i++) { c.toArray(colors,i*3); si[i*4]=this.bone; sw[i*4]=1; }
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    g.setAttribute('skinIndex',new THREE.BufferAttribute(si,4));
    g.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
    g.deleteAttribute('uv');
    this.parts.push(g);
  }
  ellipsoid(p: V, s: V, color: string, quality = 14, rotation: V = [0,0,0]) {
    this.add(new THREE.SphereGeometry(1,quality,Math.max(6,Math.round(quality*.7))),color,p,s,rotation);
  }
  box(p: V, s: V, color: string, rotation: V = [0,0,0]) { this.add(new THREE.BoxGeometry(...s),color,p,[1,1,1],rotation); }
  tube(points: V[], radius: number, color: string, radial = 5) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    this.add(new THREE.TubeGeometry(curve,Math.max(4,points.length*3),radius,radial,false),color);
  }
  finish() {
    const merged=mergeGeometries(this.parts,false)!;
    this.parts.forEach(g=>g.dispose()); this.parts=[];
    merged.computeBoundingSphere(); return merged;
  }
}

// Elliptical contour rings give the clothing shaped shoulders, a waist and hems,
// instead of stacking cylinders. y, half-width, half-depth, depth-centre.
function loft(rings: number[][], radial: number) {
  const pos:number[]=[],idx:number[]=[];
  rings.forEach(([y,rx,rz,z=0])=>{for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2;pos.push(Math.sin(a)*rx,y,Math.cos(a)*rz+z);}});
  const ascending=rings[rings.length-1][0]>rings[0][0];
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;if(ascending)idx.push(a,a+1,b,b,a+1,b+1);else idx.push(a,b,a+1,b,b+1,a+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function flatShape(points: V[]) {
  const p=points.flat(),idx:number[]=[];for(let i=1;i<points.length-1;i++)idx.push(0,i,i+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function createBones() {
  const bones: THREE.Bone[]=[];const named={} as Record<BoneName,THREE.Bone>;
  const add=(name:BoneName,parent:BoneName|null,p:V)=>{const b=new THREE.Bone();b.name=name;b.position.set(...p);bones.push(b);named[name]=b;if(parent)named[parent].add(b);};
  add('hips',null,[0,.92,0]);add('spine','hips',[0,.15,0]);add('chest','spine',[0,.2,0]);add('neck','chest',[0,.18,0]);add('head','neck',[0,.11,0]);
  for(const side of ['L','R'] as const){const sign=side==='L'?-1:1;
    add(`arm${side}`,'chest',[sign*.22,.095,0]);add(`fore${side}`,`arm${side}`,[0,-.275,0]);add(`hand${side}`,`fore${side}`,[0,-.255,0]);
    add(`thigh${side}`,'hips',[sign*.105,-.015,0]);add(`shin${side}`,`thigh${side}`,[0,-.405,0]);add(`foot${side}`,`shin${side}`,[0,-.405,0]);
  }
  named.hips.updateMatrixWorld(true);
  return {bones,named,skeleton:new THREE.Skeleton(bones)};
}

function buildBody(d:Design,index:number,bones:THREE.Bone[],low:boolean) {
  const b=new Sculpt();const q=low?9:20;const radial=low?10:20;
  const at=(name:BoneName)=>{const i=bones.findIndex(x=>x.name===name);return b.at(i,bones[i].getWorldPosition(new THREE.Vector3()));};
  at('hips').add(loft([[-.12,.145,.083],[0,.157,.095],[.075,.153,.09]],radial),d.pants);
  at('spine').add(loft([[-.16,.153,.095],[-.05,.149,.097],[.08,.173,.106],[.16,.185,.10]],radial),d.coat);
  at('chest').add(loft([[-.08,.178,.105],[.04,.191,.108],[.10,.199,.085],[.14,.10,.061],[.17,.062,.052]],radial),d.coat);
  // The shirt, opening, buttons and lapels follow each reference garment.
  if(index===0){
    at('chest').add(flatShape([[-.074,.15,.060],[.074,.15,.060],[.054,-.12,.107],[-.054,-.12,.107]]),d.inner);
    for(const s of [-1,1])at('chest').add(flatShape([[s*.07,.15,.065],[s*.128,.1,.09],[s*.052,-.095,.117],[s*.015,.07,.115]]),'#363941');
    at('spine').box([0,-.05,.104],[.012,.22,.006],d.coat);
    for(const s of [-1,1])at('spine').box([s*.10,-.09,.092],[.084,.018,.012],'#1c202a');
  } else if(index===3){
    if(!low)for(const x of [-.115,0,.115])for(let y=-.16;y<.22;y+=.028)at('spine').box([x,y,.104],[.003,.008,.002],'#d4879e');
    at('spine').add(loft([[-.17,.153,.096],[-.12,.153,.096]],radial),'#a7305b');
  } else {
    at('chest').box([0,-.012,.11],[.018,.27,.007],index===1?'#193644':'#b9b9d1');
    if(index===2){at('chest').box([-.105,-.03,.11],[.063,.07,.005],'#bebed7');at('chest').box([-.105,.007,.115],[.066,.006,.005],'#dedbed');}
  }
  if(index!==3)for(const s of [-1,1])at('chest').add(flatShape([[s*.004,.16,.06],[s*.075,.17,.05],[s*.095,.075,.107],[s*.04,.091,.12]]),d.collar);
  if(index!==3)for(let y=-.11;y<.12;y+=.052)at('chest').ellipsoid([0,y,.117],[.005,.005,.003],index===1?'#b3a588':'#dedbdf',8);
  if(index!==0&&index!==3){at('hips').add(loft([[.055,.157,.098],[.078,.157,.098]],radial),'#24262c');at('hips').box([0,.067,.103],[.036,.022,.008],'#858887');}
  at('neck').add(loft([[-.04,.06,.05],[.07,.053,.05],[.12,.058,.054]],radial),d.skin);
  // Slightly asymmetric sculpted cranial rings, shaped chin, cheek and brow.
  if(index!==1)at('head').add(loft([[-.126,.035,.048,.025],[-.11,.065,.070,.019],[-.073,.082,.085,.008],[-.035,.095,.087,0],[.01,.10,.081,-.006],[.055,.098,.086,-.009],[.104,.09,.078,-.009],[.139,.065,.057,-.015],[.155,.005,.005,-.014]],q),d.skin,[0,0,0],[d.faceWidth,1,1]);
  if(index!==1)for(const s of [-1,1]){
    at('head').ellipsoid([s*.10,-.005,-.003],[.018,.035,.021],d.skin,low?7:12);
    if(!low)at('head').ellipsoid([s*.109,-.006,.01],[.006,.022,.007],'#b77e68',10);
    at('head').ellipsoid([s*.039,.013,.078],[.025,.008,.013],WHITE,low?7:14);
    at('head').ellipsoid([s*.038,.013,.089],[.009,.009,.004],'#443d36',low?7:12);
    at('head').ellipsoid([s*.038,.013,.093],[.004,.005,.002],'#1d252b',8);
    if(!low)at('head').ellipsoid([s*.036,.016,.095],[.0018,.002,.0015],'#ffffff',6);
    at('head').tube([[s*.014,.042,.082],[s*.033,.046,.087],[s*.062,.039,.076]],.004,d.hair,low?3:5);
    if(!low)at('head').tube([[s*.019,.020,.086],[s*.038,.023,.09],[s*.060,.017,.08]],.0022,'#936653',4);
  }
  if(index!==1){at('head').ellipsoid([0,-.018,.086],[.016,.033,.014],d.skin,low?8:14);
  at('head').ellipsoid([0,-.034,.10],[.019,.013,.017],d.skin,low?8:14);
  for(const s of [-1,1])at('head').ellipsoid([s*.015,-.042,.099],[.007,.006,.007],'#b38168',8);
  at('head').tube([[-.028,-.071,.078],[-.014,-.075,.087],[0,-.073,.090],[.014,-.075,.087],[.028,-.071,.078]],.0027,'#9b625a',low?3:5);
  at('head').ellipsoid([0,-.082,.080],[.022,.005,.008],'#c18376',low?7:12);
  if(!low)at('head').tube([[-.015,-.102,.065],[0,-.105,.073],[.015,-.102,.065]],.0015,'#bd8d75',4);}
  // Hair is a shaped cap with a real silhouette; long styles add back volume.
  const hg=new THREE.SphereGeometry(1,q,low?5:10,0,Math.PI*2,0,Math.PI*.42);
  if(index!==1)at('head').add(hg,d.hair,[0,.032,-.012],[.104,.127,.098]);else hg.dispose();
  if(index===1){ // Receding hairline; smaller sparse top, broad visible forehead.
    // The photographic mesh supplies this hairline and scalp, including the
    // receding front; no generic cap is placed over the identity texture.
  } else if(index===0){
    at('head').ellipsoid([-.043,.087,.058],[.064,.029,.031],d.hair,q,[0,0,-.42]);
    at('head').ellipsoid([0,-.063,-.092],[.061,.099,.044],d.hair,q);
    at('head').ellipsoid([0,-.205,-.105],[.056,.126,.042],d.hair,q,[.22,0,0]);
    at('head').ellipsoid([0,-.116,-.106],[.046,.013,.039],'#303039',12);
  } else if(index===3){
    for(const s of [-1,1])at('head').ellipsoid([s*.09,-.086,-.060],[.036,.15,.060],d.hair,q,[0,0,s*.12]);
    at('head').ellipsoid([0,-.065,-.079],[.092,.143,.038],d.hair,q);
  }
  if(!low&&index!==1)for(let i=-3;i<=3;i++)at('head').tube([[i*.024,.145,-.022],[i*.023,.155,.003],[i*.020-.014,.103,.078]],.0014,'#343740',4);
  if(d.glasses){
    for(const s of [-1,1]){
      const cx=s*.044;at('head').tube([[cx-.032,.031,.098],[cx+.031,.031,.096],[cx+.031,-.008,.100],[cx-.030,-.008,.101],[cx-.032,.031,.098]],low?.0024:.0019,'#8a8e8c',low?3:5);
      at('head').tube([[s*.077,.025,.096],[s*.103,.018,.065],[s*.108,.014,-.008]],.002,'#787e7e',4);
    }at('head').tube([[-.012,.025,.10],[0,.03,.108],[.012,.025,.10]],.002,'#878b89',4);
  }
  for(const side of ['L','R'] as const){const s=side==='L'?-1:1;
    const sleeve=index===2;
    at(`arm${side}`).add(loft([[.025,.062,.063],[-.035,.072,.066],[-.15,.058,.057],[-.275,.045,.046]],radial),sleeve?d.skin:d.coat);
    if(sleeve)at(`arm${side}`).add(loft([[.025,.068,.065],[-.075,.075,.063],[-.145,.071,.062]],radial),d.coat);
    at(`fore${side}`).add(loft([[.018,.047,.047],[-.045,.049,.047],[-.18,.038,.04],[-.255,.03,.033]],radial),sleeve?d.skin:d.coat);
    if(!sleeve)at(`fore${side}`).add(loft([[-.23,.036,.035],[-.26,.034,.034]],radial),index===0?d.inner:d.coat);
    at(`hand${side}`).ellipsoid([0,-.052,0],[.037,.063,.023],d.skin,low?8:14);
    if(!low){for(let finger=0;finger<4;finger++)at(`hand${side}`).ellipsoid([(finger-1.5)*.016,-.107+(finger===3?.010:0),.003],[.009,.039-finger*.003,.012],d.skin,10,[0,0,(finger-1.5)*.02]);at(`hand${side}`).ellipsoid([s*.040,-.048,.006],[.013,.032,.013],d.skin,10,[0,0,s*.42]);}
    at(`thigh${side}`).add(loft([[.06,.088,.09],[-.06,.09,.09],[-.23,.077,.073],[-.405,.059,.059]],radial),d.pants);
    at(`shin${side}`).add(loft([[.035,.062,.064],[-.07,.065,.06],[-.27,.051,.052],[-.405,.045,.05]],radial),d.pants);
    if(!low)at(`shin${side}`).tube([[0,-.055,.062],[0,-.23,.054],[0,-.38,.052]],.0012,'#4a4d55',4);
    at(`foot${side}`).add(loft([[-.10,.061,.125,.04],[-.072,.065,.129,.04],[-.035,.058,.114,.035],[.026,.042,.07,0]],radial),'#202329');
    at(`foot${side}`).add(loft([[-.109,.062,.125,.04],[-.09,.065,.128,.04]],radial),'#3d4144');
    if(!low)for(let z=0;z<.07;z+=.017)at(`foot${side}`).tube([[-.03,-.018,z],[0,-.01,z+.004],[.03,-.018,z]],.0022,'#656a6c',4);
  }
  return b.finish();
}

const GUN_COLOURS={body:'#3a6478',dark:'#26313c',grip:'#20292d',metal:'#7d8d92',orange:'#f49b47',sight:'#9bd7c7'};
export function createTrainingWeapon(id:WeaponKind):THREE.Group {
  const g=new THREE.Group();g.name=`training-${id}`;const b=new Sculpt(),c=GUN_COLOURS;
  if(id==='pistol'){
    b.box([0,.012,.07],[.042,.055,.205],c.body);b.box([0,.044,.06],[.037,.017,.19],c.metal);
    b.box([0,-.066,.008],[.036,.11,.051],c.grip,[.18,0,0]);b.box([0,-.124,.017],[.041,.017,.052],c.dark);
    b.tube([[-.018,-.007,.060],[-.021,-.050,.060],[.02,-.05,.06],[.021,-.007,.06]],.004,c.dark);
    b.box([0,.058,.146],[.01,.014,.016],c.dark);b.box([0,.058,-.002],[.025,.012,.012],c.dark);
    b.ellipsoid([0,.065,.146],[.002,.003,.003],c.sight,8);
    b.add(new THREE.CylinderGeometry(.018,.018,.032,16),c.orange,[0,.011,.184],[1,1,1],[Math.PI/2,0,0]);
    b.add(new THREE.CylinderGeometry(.009,.009,.003,12),c.dark,[0,.011,.202],[1,1,1],[Math.PI/2,0,0]);
    for(let z=-.012;z<.031;z+=.013)b.box([.022,.013,z],[.002,.029,.004],c.dark);
  }else{
    const scatter=id==='scatter';
    b.box([0,.012,.08],[.065,.075,.27],c.body);b.box([0,.06,.08],[.054,.018,.29],c.dark);
    b.box([0,-.073,-.01],[.041,.12,.06],c.grip,[.2,0,0]);
    b.box([0,-.081,.10],[.045,.13,.074],scatter?c.body:c.dark,[-.12,0,0]);
    b.box([0,.0,-.14],[.046,.056,.17],c.dark);b.box([0,-.018,-.23],[.066,.125,.04],c.grip);
    b.add(new THREE.CylinderGeometry(.018,.018,.28,14),c.metal,[0,.027,.322],[1,1,1],[Math.PI/2,0,0]);
    b.add(new THREE.CylinderGeometry(.024,.024,.033,16),c.orange,[0,.027,.472],[1,1,1],[Math.PI/2,0,0]);
    b.add(new THREE.CylinderGeometry(.012,.012,.003,12),c.dark,[0,.027,.491],[1,1,1],[Math.PI/2,0,0]);
    b.box([0,-.003,.27],[.062,.063,.15],scatter?c.orange:c.grip);
    for(let z=.21;z<.35;z+=.024)b.box([0,-.041,z],[.063,.012,.006],c.dark);
    for(let z=-.018;z<.2;z+=.031)b.box([0,.074,z],[.057,.008,.009],c.metal);
    b.box([0,.09,.22],[.024,.03,.018],c.dark);b.box([0,.095,-.014],[.034,.026,.025],c.dark);
    b.tube([[-.029,-.027,.016],[-.029,-.078,.04],[.029,-.078,.04],[.029,-.027,.016]],.004,c.dark);
  }
  const geo=b.finish();geo.deleteAttribute('skinIndex');geo.deleteAttribute('skinWeight');
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.52,metalness:.2});
  const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;g.add(mesh);
  const flash=new THREE.Mesh(new THREE.ConeGeometry(.027,.105,7),new THREE.MeshBasicMaterial({color:'#d5ffff',transparent:true,opacity:.8,depthWrite:false}));
  flash.name='muzzle-flash';flash.rotation.x=Math.PI/2;flash.position.set(0,id==='pistol'?.011:.027,id==='pistol'?.25:.54);flash.visible=false;g.add(flash);
  return g;
}

function disposeGroup(group:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();}

function createPortraitHead(index:number) {
  const points:number[]=[],uv:number[]=[],triangles:number[]=[];const rows=40,cols=40;
  const widths=[.045,.070,.09,.100,.109,.113,.111,.109,.101,.077,.012];
  const gaussian=(v:number,c:number,w:number)=>Math.exp(-Math.pow((v-c)/w,2));
  for(let iy=0;iy<=rows;iy++){
    const t=iy/rows,y=-.125+t*.28,wi=Math.min(9,Math.floor(t*10));const rx=THREE.MathUtils.lerp(widths[wi],widths[wi+1],t*10-wi);
    for(let ix=0;ix<=cols;ix++){
      const x=(ix/cols*2-1)*rx;
      let z=.087*Math.sqrt(Math.max(0,1-Math.pow(x/(rx+.003),2)))-.004;
      z+=.023*gaussian(x,0,.017)*gaussian(y,.015,.042)+.041*gaussian(x,0,.021)*gaussian(y,-.015,.018);
      z+=.011*gaussian(x,0,.034)*gaussian(y,-.065,.017);
      z+=.012*(gaussian(x,-.052,.025)+gaussian(x,.052,.025))*gaussian(y,-.01,.033);
      z-=.006*(gaussian(x,-.037,.020)+gaussian(x,.037,.020))*gaussian(y,.032,.014);
      points.push(x,y,z+.003);uv.push(.5+x/.299,t);
    }
  }
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+cols+1;triangles.push(a,a+1,b,b,a+1,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(triangles);g.computeVertexNormals();
  const tex=new THREE.TextureLoader().load(`/characters/faces/${CHARACTER_DESIGNS[index].id}.png`);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const m=new THREE.MeshStandardMaterial({map:tex,roughness:.92,metalness:0,alphaTest:.4});
  const mesh=new THREE.Mesh(g,m);mesh.name='identity-textured-sculpted-face';mesh.castShadow=true;
  const group=new THREE.Group();group.add(mesh);
  const backPoints:number[]=[],backUV:number[]=[],backColors:number[]=[];
  const skin=new THREE.Color('#c99880'),hair=new THREE.Color('#545651');
  for(let iy=0;iy<=rows;iy++){
    const t=iy/rows,y=-.125+t*.28,wi=Math.min(9,Math.floor(t*10));const rx=THREE.MathUtils.lerp(widths[wi],widths[wi+1],t*10-wi);
    for(let ix=0;ix<=cols;ix++){const a=ix/cols*Math.PI,x=Math.cos(a)*rx,z=-Math.sin(a)*.089-.007;backPoints.push(x,y,z);backUV.push(ix/cols,t);(t>.5?hair:skin).toArray(backColors,backColors.length);}
  }
  const back=new THREE.BufferGeometry();back.setAttribute('position',new THREE.Float32BufferAttribute(backPoints,3));back.setAttribute('color',new THREE.Float32BufferAttribute(backColors,3));back.setIndex(triangles);back.computeVertexNormals();
  group.add(new THREE.Mesh(back,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide})));
  return group;
}

export function createCharacter(index:number):CharacterRig {
  index=((index%4)+4)%4;const d=CHARACTER_DESIGNS[index],root=new THREE.Group();root.name=d.name;
  const {bones,named,skeleton}=createBones();root.add(named.hips);
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.015});
  const near=new THREE.SkinnedMesh(buildBody(d,index,bones,false),mat),far=new THREE.SkinnedMesh(buildBody(d,index,bones,true),mat);
  for(const mesh of [near,far]){mesh.name=d.id;mesh.bind(skeleton);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);}
  root.userData.trianglesNear=near.geometry.attributes.position.count/3;root.userData.trianglesFar=far.geometry.attributes.position.count/3;
  root.scale.set(d.width,d.height,1);
  far.visible=false;
  if(index===1&&typeof document!=='undefined')named.head.add(createPortraitHead(index));
  const weaponPivot=new THREE.Group();weaponPivot.position.set(.14,-.12,.39);named.chest.add(weaponPivot);
  const guns={pistol:createTrainingWeapon('pistol'),auto:createTrainingWeapon('auto'),scatter:createTrainingWeapon('scatter')};Object.values(guns).forEach(g=>weaponPivot.add(g));
  let weapon:WeaponKind='pistol',time=0,kneel=0,aim=.5;const setWeapon=(id:WeaponKind)=>{weapon=id;Object.entries(guns).forEach(([key,g])=>g.visible=key===id);};setWeapon('pistol');
  const update=(dt:number,state:CharacterState,distance:number)=>{
    dt=Math.min(dt,.05);time+=dt;near.visible=distance<25;far.visible=!near.visible;
    const suppress=state.suppressed>0?1:0;kneel=THREE.MathUtils.damp(kneel,suppress,8,dt);aim=THREE.MathUtils.damp(aim,state.aim?1:.45,9,dt);
    const speed=Math.min(Math.max(state.speed,0),5),walking=Math.min(speed/.7,1)*(1-kneel),phase=time*(speed>3?10:7),swing=Math.sin(phase)*walking;
    named.hips.position.y=.92-kneel*.40+Math.abs(Math.sin(phase))*.017*walking;
    named.hips.rotation.y=Math.sin(phase)*.022*walking;
    named.spine.rotation.x=-.035*walking+kneel*.19;
    named.chest.rotation.x=Math.sin(time*1.8)*.008+(state.hit>0?Math.min(state.hit,.4)*-.19:0)+kneel*.24;
    named.head.rotation.x=-kneel*.2;named.head.rotation.y=Math.sin(time*.65)*.018*(1-aim);
    named.thighL.rotation.x=swing*.46-kneel*.88;named.thighR.rotation.x=-swing*.46+kneel*.58;
    named.shinL.rotation.x=Math.max(-swing,0)*.68+kneel*1.32;named.shinR.rotation.x=Math.max(swing,0)*.68+kneel*1.36;
    named.footL.rotation.x=-named.shinL.rotation.x*.37;named.footR.rotation.x=-named.shinR.rotation.x*.37;
    named.armR.rotation.set(-.65-.18*aim+kneel*.25,0,-.12);named.foreR.rotation.x=-.90*(1-kneel);
    named.armL.rotation.set(-.80-.17*aim+kneel*.25,.70,.20);named.foreL.rotation.x=-.76*(1-kneel);
    if(state.reloading){named.armL.rotation.x=-.40+Math.sin(time*8)*.12;named.foreL.rotation.x=-1.65;named.handL.rotation.z=Math.sin(time*10)*.28;}else named.handL.rotation.z=0;
    weaponPivot.position.y=-.12-kneel*.14;weaponPivot.rotation.x=(1-aim)*.17+(state.reloading?-.36:0)+kneel*.9;
    weaponPivot.position.z=.39-(state.firing?.025:0);weaponPivot.rotation.z=state.reloading?-.26:0;
    for(const g of Object.values(guns)){const flash=g.getObjectByName('muzzle-flash')!;flash.visible=g===guns[weapon]&&state.firing&&kneel<.1;}
  };
  update(0,{speed:0,aim:false,firing:false,reloading:false,suppressed:0,hit:0},0);
  return {root,setWeapon,update,dispose(){skeleton.dispose();disposeGroup(root);}};
}

export function createViewWeapon():ViewWeapon {
  const root=new THREE.Group();root.name='first-person-equipment';
  const pivot=new THREE.Group();pivot.rotation.y=Math.PI;root.add(pivot);
  const guns={pistol:createTrainingWeapon('pistol'),auto:createTrainingWeapon('auto'),scatter:createTrainingWeapon('scatter')};Object.values(guns).forEach(g=>pivot.add(g));
  const handRoot=new THREE.Group();pivot.add(handRoot);const s=new Sculpt();
  // Shaped palms and individual folded fingers hold the grip and forestock.
  for(const side of [-1,1]){
    const x=side===1?0:-.027,z=side===1?-.010:.19;
    s.ellipsoid([x,-.092,z],[.034,.054,.027],'#c5957a',18,[.2,0,0]);
    for(let i=0;i<4;i++)s.ellipsoid([x+.025,-.063-i*.016,z+.024],[.017,.008,.023],'#c5957a',12,[0,.45,0]);
    s.ellipsoid([x-.025,-.07,z+.019],[.013,.032,.014],'#d4a087',14,[.25,0,-.5]);
    s.add(loft([[-.39,.054,.05,-.12],[-.25,.049,.043,-.047],[-.13,.032,.03,0]],16),'#d7d9d8',[x,-.035,z]);
    s.add(loft([[-.42,.06,.052,-.14],[-.28,.057,.05,-.06]],16),'#27394b',[x,-.035,z]);
  }
  const geo=s.finish();geo.deleteAttribute('skinIndex');geo.deleteAttribute('skinWeight');handRoot.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8})));
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;}});
  let time=0,ads=0,run=0,lastWeapon:WeaponKind='pistol',switchAmount=0;
  return {root,update(dt,state){
    time+=dt;ads=THREE.MathUtils.damp(ads,state.aim&&!state.running?1:0,13,dt);run=THREE.MathUtils.damp(run,state.running?1:0,8,dt);
    if(lastWeapon!==state.weapon){switchAmount=1;lastWeapon=state.weapon;}switchAmount=Math.max(0,switchAmount-dt*5);
    Object.entries(guns).forEach(([id,g])=>{g.visible=id===state.weapon;g.getObjectByName('muzzle-flash')!.visible=id===state.weapon&&state.recoil>.58;});
    const moving=Math.min(1,state.moving),wave=time*(state.running?12:8),bob=moving*.009*(1-ads*.75);
    const reload=Math.max(0,Math.min(1,state.reloading));
    pivot.position.set(.185*(1-ads)+Math.sin(wave)*bob,-.185+ads*.118+Math.cos(wave*2)*bob-run*.12-reload*.075-switchAmount*.15,-.36+state.recoil*.027);
    pivot.rotation.set(state.recoil*-.12+run*.28+reload*.48,Math.PI+run*.33,-reload*.42+Math.sin(wave)*bob+run*.13);
    handRoot.rotation.x=reload*.35;handRoot.position.y=-reload*.07;handRoot.position.z=state.weapon==='pistol'?-.035:0;
  },dispose(){disposeGroup(root);}};
}
