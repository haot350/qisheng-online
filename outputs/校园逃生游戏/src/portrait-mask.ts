export type PortraitMask={width:number;height:number;bits:Uint8Array};
export type PortraitAlpha=PortraitMask|{width:number;height:number;data:Uint8Array};
/** The exact alpha>=128 predicate, packed little-bit-first in row-major order. */
export function portraitPixelOpaque(alpha:PortraitAlpha,x:number,y:number){
 const index=y*alpha.width+x;
 return 'bits' in alpha?!!(alpha.bits[index>>>3]&(1<<(index&7))):alpha.data[index]>=128;
}
export function decodePortraitMask(input:ArrayBuffer|Uint8Array):PortraitMask{
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<24)throw Error('Incomplete portrait mask.');
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=header.getUint32(8,true),height=header.getUint32(12,true);
 const size=header.getUint32(20,true);
 if(header.getUint32(0,true)!==0x31414d51||header.getUint32(4,true)!==1||header.getUint32(16,true)!==128||!width||!height||width>4096||height>4096||size!==Math.ceil(width*height/8))throw Error('Invalid portrait mask.');
 const bits=new Uint8Array(size);let at=24,out=0;
 while(out<size){
  let value=0,multiplier=1,count=0,byte=0;
  do{if(at>=bytes.length||count++>=5)throw Error('Incomplete portrait mask run.');byte=bytes[at++];value+=(byte&127)*multiplier;multiplier*=128;}while(byte&128);
  if(!Number.isSafeInteger(value)||value>0x7fffffff||count>1&&byte===0)throw Error('Invalid portrait mask run.');
  const length=Math.floor(value/4),kind=value%4;
  if(!length||kind===3||out+length>size)throw Error('Portrait mask run exceeds bounds.');
  if(kind===1)bits.fill(255,out,out+length);
  else if(kind===2){if(at+length>bytes.length)throw Error('Incomplete portrait mask bytes.');bits.set(bytes.subarray(at,at+length),out);at+=length;}
  out+=length;
 }
 if(at!==bytes.length)throw Error('Unexpected portrait mask bytes.');
 return{width,height,bits};
}
