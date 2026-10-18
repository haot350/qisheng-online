"""Audit an internal Android package. This is not real-device acceptance."""
import argparse,hashlib,json,re,struct,zipfile
from pathlib import Path
PHYSICS_NOTICES=['Android-NDK-runtime-NOTICE.txt','godot-rust-MPL-2.0.txt','nalgebra-BSD-3-Clause.txt','Rapier-Apache-2.0.txt','Rust-Apache-2.0.txt','Rust-GCC-exception-3.1.txt','Rust-GPL-3.0-or-later.txt','Rust-library-COPYRIGHT.html','Rust-LLVM-exception.txt','Rust-MIT.txt','Rust-NCSA.txt','Rust-Unicode-3.0.txt','SOURCE-NOTICE.txt']
ANDROID_LIBRARIES=set('libandroid.so liblog.so libdl.so libm.so libc.so libEGL.so libGLESv1_CM.so libGLESv2.so libGLESv3.so libOpenSLES.so libvulkan.so libjnigraphics.so libz.so libmediandk.so libaaudio.so libnativewindow.so libneuralnetworks.so libcamera2ndk.so'.split())
def inspect_elf(data):
 if len(data)<64 or data[:6]!=b'\x7fELF\x02\x01' or struct.unpack_from('<H',data,18)[0]!=183:raise ValueError('Expected little-endian Android arm64 ELF64 library')
 offset=struct.unpack_from('<Q',data,32)[0];stride,count=struct.unpack_from('<HH',data,54)
 if stride<56 or count<1 or offset+stride*count>len(data):raise ValueError('Invalid ELF program headers')
 loads=[];dynamic=None
 for index in range(count):
  row=struct.unpack_from('<IIQQQQQQ',data,offset+index*stride)
  kind,flags,file_offset,address,physical,file_size,memory_size,alignment=row
  if file_offset+file_size>len(data):raise ValueError('Invalid ELF segment bounds')
  if kind==1:
   if alignment<16384 or file_offset%alignment!=address%alignment:raise ValueError('ELF LOAD segment lacks 16 KiB page alignment')
   loads.append(row)
  if kind==2:dynamic=row
 if not loads:raise ValueError('ELF lacks load segments')
 needed=[];string_table=None
 if dynamic:
  needed_offsets=[]
  for cursor in range(dynamic[2],dynamic[2]+dynamic[5],16):
   tag,value=struct.unpack_from('<QQ',data,cursor)
   if tag==0:break
   if tag==1:needed_offsets.append(value)
   if tag==5:string_table=value
  if needed_offsets:
   if string_table is None:raise ValueError('ELF dynamic strings missing')
   table=next((segment[2]+string_table-segment[3] for segment in loads if segment[3]<=string_table<segment[3]+segment[5]),None)
   if table is None:raise ValueError('ELF dynamic strings outside file')
   for value in needed_offsets:
    start=table+value;end=data.find(b'\0',start)
    if start<0 or end<start or end-start>256:raise ValueError('Invalid ELF dependency')
    needed.append(data[start:end].decode('ascii'))
 return{'elfLoadAlignments':[row[7] for row in loads],'dependencies':needed,'sha256':hashlib.sha256(data).hexdigest()}

def audit(apk,project):
 with zipfile.ZipFile(apk) as archive:
  names=archive.namelist();name_set=set(names)
  if len(names)!=len(name_set) or any(name.startswith('/') or '\\' in name or any(part in ('.','..') for part in name.split('/')) for name in names):raise ValueError('Unsafe or duplicate APK paths')
  forbidden=[name for name in names if re.search(r'^assets/(private|work|docs|tests|scripts|dist|physics-rs|[.]git)/|(^|/)[.]env($|[.])|[.](pem|key|keystore|jks|sqlite|log)$|android-internal-signing|account-.*[.]bin$',name,re.I)]
  if forbidden:raise ValueError('Private or development files entered APK')
  abis={name.split('/')[1] for name in names if name.startswith('lib/') and name.endswith('.so')}
  if abis!={'arm64-v8a'}:raise ValueError('Unexpected APK native architecture')
  libraries={name:inspect_elf(archive.read(name)) for name in names if name.startswith('lib/') and name.endswith('.so')}
  for marker in ['colyseus','qs_native_physics']:
   if sum(marker in name for name in libraries)!=1:raise ValueError('Expected exactly one native extension: '+marker)
  bundled={Path(name).name for name in libraries}
  for name,library in libraries.items():
   missing=set(library['dependencies'])-ANDROID_LIBRARIES-bundled
   if missing:raise ValueError('Android native dependency missing: '+', '.join(sorted(missing)))
  for name in ['Godot-MIT.txt','Colyseus-MIT.txt']:
   if 'assets/third_party_licenses/'+name not in name_set:raise ValueError('Native dependency notice missing: '+name)
  for name in PHYSICS_NOTICES:
   key='assets/runtime_licenses/physics/'+name
   if key not in name_set or len(archive.read(key))<30:raise ValueError('Native bridge runtime notice missing: '+name)
  if 'assets/LICENSES.txt' not in name_set:raise ValueError('Native asset/license boundary declaration missing')
  key='assets/content/production/map.json'
  if key not in name_set:raise ValueError('Full formal campus manifest missing')
  manifest=json.loads(archive.read(key));identity=manifest.get('mapIdentity',{})
  if manifest.get('profile')!='production' or len(manifest.get('chunks',[]))!=209:raise ValueError('Incomplete formal campus')
  def resource(name):
   name=name.removeprefix('res://');key='assets/'+name
   if key in name_set:return
   remap=key+'.remap' if key+'.remap' in name_set else key+'.import'
   if remap not in name_set:raise ValueError('Packed Android resource missing: '+name)
   match=re.search(r'^path="res://([^"\r\n]+)"',archive.read(remap).decode(),re.M)
   if not match or 'assets/'+match.group(1) not in name_set:raise ValueError('Packed Android resource remap missing: '+name)
  for chunk in manifest['chunks']:
   if not isinstance(chunk.get('path'),str) or not chunk['path'].startswith('res://content/production/'):raise ValueError('Invalid formal campus resource')
   resource(chunk['path'])
  combat=json.loads(archive.read('assets/content/combat/manifest.json'))
  if combat.get('profile')!='production' or not isinstance(combat.get('assets'),list):raise ValueError('Formal combat index missing')
  for asset in combat['assets']:
   target=asset.get('target','')
   if not target or '..' in target or '\\' in target:raise ValueError('Unsafe formal combat resource')
   resource('content/combat/'+target)
  for file,key in [('collision.bin','collisionHash'),('navigation.bin','navigationHash'),('vision.bin','visionHash')]:
   if hashlib.sha256(archive.read('assets/content/production/'+file)).hexdigest()!=identity.get(key):raise ValueError('Packed raw map identity mismatch: '+file)
  for name in ['content/production/map.json','content/combat/manifest.json','content/combat/weapons.json']:
   if archive.read('assets/'+name)!=(project/name).read_bytes():raise ValueError('Stale formal metadata in APK')
  for marker,file in [('qs_native_physics','bin/libqs_native_physics.arm64.so'),('colyseus','addons/colyseus/bin/libcolyseus_godot.android.arm64.debug.so')]:
   actual=next(row['sha256'] for name,row in libraries.items() if marker in name)
   if hashlib.sha256((project/file).read_bytes()).hexdigest()!=actual:raise ValueError('APK extension differs from the verified platform source: '+marker)
  return{'passed':True,'kind':'internal-native-apk','version':'0.1.0','stage':'internal','published':False,'entries':len(names),'architectures':sorted(abis),'nativeLibraries':libraries,'physicsRuntimeNotices':len(PHYSICS_NOTICES),'privateOrDevelopmentEntries':0,'campusChunks':209,'mapIdentity':identity,'deviceVerified':False}
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('apk',type=Path);parser.add_argument('--report',type=Path,required=True);parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1]);args=parser.parse_args()
 report=audit(args.apk,args.project);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({key:value for key,value in report.items() if key not in ['mapIdentity','nativeLibraries']},ensure_ascii=False))
