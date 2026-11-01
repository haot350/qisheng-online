export const AVATAR_INPUT_BYTES=5*1024*1024;
export const AVATAR_INPUT_PIXELS=20_000_000;
export function inspectAvatarInput(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0,format='';
 const text=(offset:number,length:number)=>String.fromCharCode(...bytes.subarray(offset,offset+length));
 if(bytes.length>AVATAR_INPUT_BYTES)throw new Error('图片不能超过5 MiB。');
 if(bytes.length>=24&&view.getUint32(0)===0x89504e47&&text(12,4)==='IHDR'){
  format='png';width=view.getUint32(16);height=view.getUint32(20);
  for(let offset=8;offset+12<=bytes.length;){const length=view.getUint32(offset);if(length>bytes.length-offset-12)break;if(text(offset+4,4)==='acTL')throw new Error('请选择静态图片。');offset+=length+12;}
 }else if(bytes.length>=30&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'){
  format='webp';const kind=text(12,4);
  if(kind==='VP8X'){if(bytes[20]&2)throw new Error('请选择静态图片。');width=1+bytes[24]+bytes[25]*256+bytes[26]*65536;height=1+bytes[27]+bytes[28]*256+bytes[29]*65536;}
  else if(kind==='VP8L'&&bytes[20]===0x2f){const bits=view.getUint32(21,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
  else if(kind==='VP8 '&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a){width=view.getUint16(26,true)&0x3fff;height=view.getUint16(28,true)&0x3fff;}
 }else if(bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8){
  format='jpeg';for(let offset=2;offset+3<bytes.length;){if(bytes[offset++]!==0xff)continue;while(bytes[offset]===0xff)offset++;const marker=bytes[offset++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||marker>=0xd0&&marker<=0xd8)continue;if(offset+2>bytes.length)break;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7){height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;}offset+=length;}
 }
 if(!width||!height||!format)throw new Error('请选择JPEG、PNG或WebP图片。');
 if(width*height>AVATAR_INPUT_PIXELS)throw new Error('图片尺寸不能超过2000万像素。');
 return {width,height,format};
}
