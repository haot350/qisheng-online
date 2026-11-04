export function encodePortraitMask(alpha,width,height,options={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||alpha.length!==width*height)throw Error('Invalid portrait alpha.');
 const bits=new Uint8Array(Math.ceil(alpha.length/8));for(let i=0;i<alpha.length;i++)if(alpha[i]>=128)bits[i>>>3]|=1<<(i&7);
 const payload=[],varint=value=>{do{const b=value%128;value=Math.floor(value/128);payload.push(b|(value?128:0));}while(value);};
 if(Number.isSafeInteger(options.maxRun)&&options.maxRun>0){const max=options.maxRun;for(let at=0;at<bits.length;){const value=bits[at];if(value===0||value===255){let end=at+1;while(end<bits.length&&bits[end]===value&&end-at<max)end++;varint((end-at)*4+(value===255?1:0));at=end;}else{let end=at+1;while(end<bits.length&&bits[end]!==0&&bits[end]!==255&&end-at<max)end++;varint((end-at)*4+2);for(let i=at;i<end;i++)payload.push(bits[i]);at=end;}}const header=Buffer.alloc(24);[0x31414d51,1,width,height,128,bits.length].forEach((v,i)=>header.writeUInt32LE(v,i*4));return Buffer.concat([header,Buffer.from(payload)]);}
 let at=0;
 while(at<bits.length){
  const value=bits[at];let run=1;
  if(value===0||value===255){while(at+run<bits.length&&bits[at+run]===value)run++;}
  if(run>=3){varint(run*4+(value===255?1:0));at+=run;continue;}
  const start=at;at+=run;
  while(at<bits.length){if((bits[at]===0||bits[at]===255)&&bits[at]===bits[at+1]&&bits[at]===bits[at+2])break;at++;}
  varint((at-start)*4+2);for(let i=start;i<at;i++)payload.push(bits[i]);
 }
 const header=Buffer.alloc(24);[0x31414d51,1,width,height,128,bits.length].forEach((v,i)=>header.writeUInt32LE(v,i*4));
 return Buffer.concat([header,Buffer.from(payload)]);
}
