import ts from 'typescript';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {privateContourSource} from '../../校园逃生游戏/scripts/private-npc-profile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let common=path.resolve(root,'..');let sourceRoot=root;try{await readFile(path.join(common,'校园逃生游戏/src/rules.ts'));}catch{common=path.join(root,'sources');sourceRoot=path.join(common,'校园联机服务');}
const out=path.join(root,'dist','modules');
const seen=new Set();
const profile=process.env.OPENQS_PROFILE??'demo';if(!['demo','production'].includes(profile))throw Error('OPENQS_PROFILE must be demo or production.');
async function visit(file){if(seen.has(file))return;seen.add(file);const source=profile==='production'&&path.basename(file)==='npc-contours.ts'?await privateContourSource():await readFile(file,'utf8');let text=ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true,experimentalDecorators:true}}).outputText;const imports=[...text.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)];for(const match of imports){let target=path.resolve(path.dirname(file),match[2]);if(!path.extname(target)){try{await readFile(target+'.ts');target+='.ts';}catch{target=path.join(target,'index.ts');}} await visit(target);const relative=path.relative(path.dirname(file),target).split(path.sep).join('/').replace(/\.ts$/,'.js');const rel=relative.startsWith('.')?relative:'./'+relative;text=text.replace(match[0],match[0].replace(match[2],rel));}const result=ts.transpileModule(text,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true,sourceMap:true,experimentalDecorators:true}});const dest=path.join(out,path.relative(common,file)).replace(/\.ts$/,'.js');await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,result.outputText);}
await visit(path.join(sourceRoot,'src/server.ts'));await writeFile(path.join(root,'dist/server.mjs'),"import './modules/校园联机服务/src/server.js';\n");console.log('compiled',seen.size,'modules');

await writeFile(path.join(root,'dist/openqs-profile.json'),JSON.stringify({profile,application:'realtime',privateNpcCalibration:profile==='production'})+'\n');
