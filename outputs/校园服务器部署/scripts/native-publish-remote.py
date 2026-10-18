#!/usr/bin/env python3
"""Called through the guarded deployment target, never directly as root."""
import base64,fcntl,hashlib,json,os,pathlib,re,secrets,sys,time
p=json.loads(base64.b64decode(sys.argv[1]));base=pathlib.Path(p['base']);releases=base/'releases';manifests=base/'manifests';incoming=base/'.incoming'
if not base.is_absolute() or base.name!='native' or '..' in base.parts:raise ValueError('Unsafe native base')
if p['action'] in ['verify','install','activate']:
 entry=p.get('entry',{})
 if not re.fullmatch(r'[a-f0-9]{64}',entry.get('sha256','')) or not isinstance(entry.get('bytes'),int) or entry['bytes']<=0:raise ValueError('Unsafe native entry')
 if p['action'] in ['verify','install'] and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]*[.](zip|apk)',p.get('name','')):raise ValueError('Unsafe native filename')
 if p['action']=='activate' and p.get('platform') not in ['windows','android']:raise ValueError('Unsafe native platform')
def safe_dir(folder,mode=0o755):
 if folder.is_symlink():raise ValueError('Native release directory must not be a symlink')
 folder.mkdir(parents=True,exist_ok=True)
 if not folder.is_dir():raise ValueError('Native release directory is not a directory')
 os.chmod(folder,mode)
def regular(file):
 if file.is_symlink() or not file.is_file():raise ValueError('Expected a regular native release file')
def digest(file):
 regular(file);h=hashlib.sha256()
 with file.open('rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def atomic(file,data,mode=0o644):
 if file.is_symlink():raise ValueError('Native manifest must not be a symlink')
 temporary=file.with_name('.'+file.name+'.'+secrets.token_hex(8)+'.tmp')
 try:
  with temporary.open('xb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
  os.chmod(temporary,mode);os.replace(temporary,file)
  fd=os.open(file.parent,os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
 finally:
  if temporary.exists():temporary.unlink()
for folder in [base,releases]:safe_dir(folder)
for folder in [manifests,incoming]:safe_dir(folder,0o700)
lock=base/'.publish.lock'
if lock.is_symlink():raise ValueError('Unsafe native publication lock')
with lock.open('a+b') as lease:
 fcntl.flock(lease,fcntl.LOCK_EX)
 action=p['action'];manifest=base/'updates.json'
 if action=='verify':
  folder=releases/p['entry']['sha256']
  if folder.is_symlink():raise ValueError('Native release directory must not be a symlink')
  file=folder/p['name']
  if not file.exists():print(json.dumps({'installed':False}))
  else:
   if file.stat().st_size!=p['entry']['bytes'] or digest(file)!=p['entry']['sha256']:raise ValueError('Existing immutable native archive differs')
   print(json.dumps({'installed':True,'bytes':file.stat().st_size,'sha256':p['entry']['sha256']}))
 elif action=='stage':
  folder=incoming/secrets.token_hex(16);folder.mkdir(mode=0o700);print(json.dumps({'folder':str(folder),'file':str(folder/'archive')}))
 elif action=='install':
  source=pathlib.Path(p['source']);regular(source)
  if source.parent.parent!=incoming or source.name!='archive':raise ValueError('Unsafe staged native path')
  if source.stat().st_size!=p['entry']['bytes'] or digest(source)!=p['entry']['sha256']:raise ValueError('Uploaded native artifact failed hash verification')
  folder=releases/p['entry']['sha256'];safe_dir(folder);destination=folder/p['name']
  if destination.exists():
   if destination.stat().st_size!=p['entry']['bytes'] or digest(destination)!=p['entry']['sha256']:raise ValueError('Existing immutable native archive differs')
  else:os.chmod(source,0o644);os.link(source,destination)
  print(json.dumps({'installed':True,'bytes':destination.stat().st_size,'sha256':digest(destination)}))
 elif action=='activate':
  current={'windows':{'available':False},'android':{'available':False}};before=None
  if manifest.exists():
   regular(manifest);before=manifest.read_bytes()
   if len(before)>16000:raise ValueError('Existing native manifest is too large')
   current=json.loads(before)
   if not isinstance(current,dict) or set(current)-{'windows','android'}:raise ValueError('Unexpected native manifest structure')
  current[p['platform']]=p['entry']
  for platform in ['windows','android']:current.setdefault(platform,{'available':False})
  data=(json.dumps(current,ensure_ascii=False,separators=(',',':'))+'\n').encode()
  if len(data)>16000:raise ValueError('Native manifest is too large')
  revision=time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+secrets.token_hex(8)
  previous=manifests/(revision+'.previous.json')
  if before is not None:atomic(previous,before,0o600)
  atomic(manifests/(revision+'.accepted.json'),json.dumps({'acceptanceSha256':p['acceptanceSha256'],'platform':p['platform'],'entry':p['entry']},ensure_ascii=False).encode(),0o600)
  atomic(manifest,data)
  print(json.dumps({'activated':True,'manifestSha256':hashlib.sha256(data).hexdigest(),'previous':str(previous) if before is not None else None}))
 elif action=='rollback':
  if not manifest.exists() or digest(manifest)!=p['manifestSha256']:raise ValueError('Native manifest changed concurrently; refusing rollback')
  if p['previous'] is None:manifest.unlink()
  else:
   previous=pathlib.Path(p['previous'])
   if previous.parent!=manifests:raise ValueError('Unsafe native rollback path')
   regular(previous);atomic(manifest,previous.read_bytes())
  print(json.dumps({'rolledBack':True,'archivesRetained':True}))
 elif action=='cleanup':
  folder=pathlib.Path(p['folder'])
  if folder.parent!=incoming or len(folder.name)!=32 or not all(c in '0123456789abcdef' for c in folder.name):raise ValueError('Unsafe native staging cleanup')
  file=folder/'archive'
  if file.exists():regular(file);file.unlink()
  folder.rmdir();print(json.dumps({'cleaned':True}))
 else:raise ValueError('Unknown native publication action')
