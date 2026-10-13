export const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const depthAndFocus=`
uniform sampler2D image,depthImage;uniform vec2 resolution;uniform float nearPlane,farPlane,focusDistance,focalLength,aperture,sensorWidth,useFocus,maxBlur,samples;
float eyeDepth(vec2 uv){float d=texture2D(depthImage,uv).x;return nearPlane*farPlane/(farPlane-(farPlane-nearPlane)*d);}
vec3 focused(vec2 uv){
 vec3 center=texture2D(image,uv).rgb;if(useFocus<.5)return center;
 float z=eyeDepth(uv)*1000.,s=focusDistance*1000.;float coc=focalLength*focalLength*abs(z-s)/(aperture*z*max(1.,s-focalLength))*resolution.x/sensorWidth;
 float radius=clamp(coc*.5,0.,maxBlur);if(radius<.4)return center;
 vec3 sum=center;float total=1.;
 for(int i=0;i<32;i++){if(float(i)>=samples)break;float angle=float(i)*2.39996323;float r=sqrt((float(i)+.5)/samples);r*=.9238795/cos(mod(angle,.7853982)-.3926991);vec2 delta=vec2(cos(angle),sin(angle))*r*radius/resolution;vec2 q=clamp(uv+delta,vec2(.001),vec2(.999));float nz=eyeDepth(q)*1000.;
  float nc=focalLength*focalLength*abs(nz-s)/(aperture*nz*max(1.,s-focalLength))*resolution.x/sensorWidth;
  float w=1.;if(nz<z&&nc*.5<length(delta*resolution))w=.02;if(nz>z*1.03&&z<s&&coc<2.)w=.02;sum+=texture2D(image,q).rgb*w;total+=w;
 }return sum/total;
}`;
export const accumulate=`varying vec2 vUv;${depthAndFocus}uniform sampler2D accumulated;uniform float blend;void main(){gl_FragColor=vec4(mix(texture2D(accumulated,vUv).rgb,focused(vUv),blend),1.);}`;
export const finalImage=`varying vec2 vUv;${depthAndFocus}
uniform sampler2D previous;uniform mat4 inverseViewProjection,previousViewProjection;uniform float previousReady,motionAmount,alreadyFocused,gain,iso,noiseSeed,highlights,magnify;uniform vec3 balance;
#include <tonemapping_pars_fragment>
float random(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+noiseSeed)*43758.5453);}
void main(){
 vec2 qUV=(vUv-.5)/magnify+.5;vec3 c=alreadyFocused>.5?texture2D(image,qUV).rgb:focused(qUV);
 if(previousReady>.5&&motionAmount>0.&&alreadyFocused<.5){float d=texture2D(depthImage,qUV).x;vec4 w=inverseViewProjection*vec4(qUV*2.-1.,d*2.-1.,1.);w/=w.w;vec4 p=previousViewProjection*w;vec2 old=p.xy/p.w*.5+.5;float clip=(old.x>=0.&&old.x<=1.&&old.y>=0.&&old.y<=1.)?1.:0.;vec4 hist=texture2D(previous,clamp(old,vec2(0.),vec2(1.)));float previousZ=exp2(hist.a*log2(farPlane+1.))-1.;float expectedZ=p.w;float ok=abs(previousZ-expectedZ)<max(.2,expectedZ*.03)?1.:0.;float stationary=length(old-qUV)<.003?1.:0.;vec3 previousColor=hist.rgb/max(vec3(.003),1.-hist.rgb);c=mix(c,previousColor,motionAmount*clip*max(ok,stationary*.6));}
 c*=gain*balance;float l=dot(c,vec3(.2126,.7152,.0722));float deviation=(random(vUv*resolution)-random(vUv.yx*resolution+9.));float strength=sqrt(max(l,0.)+.008)*sqrt(iso/100.)*.0018;c=max(vec3(0.),c+deviation*strength);c=ACESFilmicToneMapping(c);c=sRGBTransferOETF(vec4(c,1.)).rgb;
 if(highlights>.5&&max(c.r,max(c.g,c.b))>.985)c=mix(c,vec3(1.,.15,.08),step(.5,fract((gl_FragCoord.x+gl_FragCoord.y)*.12))*.5);gl_FragColor=vec4(c,1.);
}`;
export const previousImage=`varying vec2 vUv;uniform sampler2D image,depthImage;uniform float nearPlane,farPlane;void main(){vec3 c=texture2D(image,vUv).rgb;float d=texture2D(depthImage,vUv).x;float z=nearPlane*farPlane/(farPlane-(farPlane-nearPlane)*d);gl_FragColor=vec4(c/(1.+c),log2(z+1.)/log2(farPlane+1.));}`;
export const meterImage=`varying vec2 vUv;uniform sampler2D image;void main(){vec3 c=texture2D(image,vUv).rgb;gl_FragColor=vec4(c/(1.+c),1.);}`;
export const copyImage=`varying vec2 vUv;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,vUv);}`;
