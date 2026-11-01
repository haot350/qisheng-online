import {readFile} from 'node:fs/promises';
export async function readReleaseConfig(file=new URL('../release-config.json',import.meta.url)){
 const value=JSON.parse(await readFile(file,'utf8'));
 if(value.schema!==1||value.productId!=='qisheng-online-android'||value.applicationId!=='com.liuframe.qishengonline'||!/^\d+\.\d+\.\d+$/.test(value.version)||!Number.isSafeInteger(value.versionCode)||value.versionCode<1||!['internal','public-preview'].includes(value.channel)||value.internalOnly!==(value.channel==='internal')||typeof value.minimumOS!=='string'||!value.minimumOS.trim()||value.minimumOS.length>80||value.protocolVersion!=='campus-mp-0.9.4'||!/^[a-f0-9]{64}$/.test(value.signingCertificateSha256))throw Error('Invalid Android release configuration');
 return Object.freeze(value);
}
