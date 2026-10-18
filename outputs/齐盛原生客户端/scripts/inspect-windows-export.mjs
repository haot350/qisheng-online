import fs from 'node:fs/promises';
import path from 'node:path';
export async function peImports(file){
 const bytes=await fs.readFile(file);const fail=()=>{throw Error('Invalid Windows x64 PE image: '+path.basename(file));};
 if(bytes.length<256||bytes.toString('ascii',0,2)!=='MZ')fail();const at=bytes.readUInt32LE(60);
 if(at+256>bytes.length||bytes.readUInt32LE(at)!==0x4550||bytes.readUInt16LE(at+4)!==0x8664)fail();
 const sections=bytes.readUInt16LE(at+6),optionalSize=bytes.readUInt16LE(at+20),optional=at+24;if(bytes.readUInt16LE(optional)!==0x20b||sections>96)fail();
 const sectionOffset=optional+optionalSize;const rva=address=>{for(let i=0;i<sections;i++){const pos=sectionOffset+i*40;if(pos+40>bytes.length)fail();const virtualSize=bytes.readUInt32LE(pos+8),virtualAddress=bytes.readUInt32LE(pos+12),rawSize=bytes.readUInt32LE(pos+16),raw=bytes.readUInt32LE(pos+20);if(address>=virtualAddress&&address<virtualAddress+Math.max(virtualSize,rawSize)){const result=raw+address-virtualAddress;if(result<0||result>=bytes.length)fail();return result;}}fail();};
 const address=bytes.readUInt32LE(optional+120),size=bytes.readUInt32LE(optional+124),imports=[];if(!address)return imports;
 const table=rva(address);for(let i=0;i<Math.min(4096,Math.ceil(size/20)+1);i++){const pos=table+i*20;if(pos+20>bytes.length)fail();const nameRva=bytes.readUInt32LE(pos+12);if(!nameRva)break;const start=rva(nameRva),end=bytes.indexOf(0,start);if(end<start||end-start>256)fail();const name=bytes.toString('ascii',start,end).toLowerCase();if(!/^[a-z0-9_.-]+[.](dll|drv)$/.test(name))fail();imports.push(name);}
 return [...new Set(imports)];
}
const system=new Set('kernel32.dll uiautomationcore.dll shcore.dll wsock32.dll user32.dll gdi32.dll opengl32.dll winmm.dll advapi32.dll shell32.dll ole32.dll oleaut32.dll ws2_32.dll crypt32.dll bcrypt.dll bcryptprimitives.dll ntdll.dll version.dll winhttp.dll wininet.dll imm32.dll shlwapi.dll comdlg32.dll setupapi.dll secur32.dll iphlpapi.dll dbghelp.dll dwmapi.dll psapi.dll uxtheme.dll normaliz.dll d3d11.dll d3d12.dll dxgi.dll dxguid.dll d3dcompiler_47.dll xinput1_4.dll xinput9_1_0.dll propsys.dll gdiplus.dll msvcrt.dll ucrtbase.dll cfgmgr32.dll userenv.dll cabinet.dll wintrust.dll combase.dll avrt.dll hid.dll winspool.drv rpcrt4.dll netapi32.dll wtsapi32.dll dwrite.dll dnsapi.dll winmmbase.dll powrprof.dll winrnr.dll'.split(' '));
export async function inspectWindowsDependencies(directory,files){
 const binaries=files.filter(row=>/[.](exe|dll)$/i.test(row.path)),bundled=new Set(binaries.map(row=>path.basename(row.path).toLowerCase())),rows=[];
 for(const row of binaries){const dependencies=await peImports(path.join(directory,row.path));const missing=dependencies.filter(name=>!system.has(name)&&!bundled.has(name)&&!name.startsWith('api-ms-win-')&&!name.startsWith('ext-ms-win-'));if(missing.length)throw Error('Windows runtime dependencies must be bundled with their licenses: '+missing.join(', '));rows.push({path:row.path,dependencies});}
 if(!binaries.some(row=>row.path.endsWith('qs_native_physics.dll'))||!binaries.some(row=>/colyseus.*[.]dll$/i.test(row.path)))throw Error('Native Windows physics or Colyseus library missing');
 return{passed:true,architecture:'x86_64',binaries:rows};
}
