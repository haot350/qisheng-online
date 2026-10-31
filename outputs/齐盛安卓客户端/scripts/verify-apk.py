import argparse,hashlib,json,re,zipfile,pathlib

parser=argparse.ArgumentParser()
parser.add_argument('apk')
parser.add_argument('--report',required=True)
args=parser.parse_args()
apk=pathlib.Path(args.apk)
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None,'APK ZIP integrity failed'
    names=archive.namelist()
    assert len(names)==len(set(names)),'duplicate APK paths'
    assert all('..' not in name.split('/') and not name.startswith('/') for name in names),'unsafe APK paths'
    raw=archive.read('assets/android/asset-manifest.json')
    manifest=json.loads(raw)
    assert manifest['internalOnly'] is True and manifest['productId']=='qisheng-online-android'
    files=manifest['files']
    for row in files:
        data=archive.read('assets/'+row['path'])
        assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],row['path']
    asset_names={name[len('assets/'):] for name in names if name.startswith('assets/') and not name.endswith('/')}
    expected={row['path'] for row in files}|{'android/asset-manifest.json'}
    generated_profiles={'dexopt/baseline.prof','dexopt/baseline.profm'}
    generated_assets=asset_names-expected
    assert generated_assets<=generated_profiles and expected<=asset_names,repr({'extra':sorted(generated_assets-generated_profiles),'missing':sorted(expected-asset_names)})
    profile_hashes={name:hashlib.sha256(archive.read('assets/'+name)).hexdigest() for name in sorted(generated_assets)}
    assert not any(re.search(r'(^|/)(private|node_modules|\.git|qa)(/|$)|\.(jks|keystore|pem|sqlite|db|log)$|production\.json',name,re.I) for name in asset_names),'private data entered APK'
    for row in files:
        if row.get('url') in ('/index.html','/account/index.html','/credits/index.html','/copyright/index.html'):
            html=archive.read('assets/'+row['path']).decode()
            assert 'data-qisheng-entry=' in html and '/android/runtime/android-entry-' in html
            assert 'Content-Security-Policy' in html and "'wasm-unsafe-eval'" in html and "'unsafe-eval'" not in html
    info=json.loads(archive.read('assets/android/bundle-info.json'))
    assert info['available'] is False and info['internalOnly'] is True
    assert info['applicationId']=='com.liuframe.qishengonline'
    assert 'AndroidManifest.xml' in names and 'classes.dex' in names
result={'passed':True,'apk':apk.name,'bytes':apk.stat().st_size,'sha256':hashlib.file_digest(apk.open('rb'),'sha256').hexdigest(),'assetUrls':len(files),'physicalAssetFiles':len(expected),'androidGeneratedProfiles':profile_hashes,'allAssetHashesVerified':True,'manifestSha256':hashlib.sha256(raw).hexdigest(),'productId':manifest['productId'],'webVersion':manifest['webVersion'],'mapManifestSha256':manifest['mapManifestSha256'],'privateConfigurationOrSigningIncluded':False,'formalGameAssetsBundled':True,'deviceVerified':False,'publicDownloadEnabled':False}
pathlib.Path(args.report).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
