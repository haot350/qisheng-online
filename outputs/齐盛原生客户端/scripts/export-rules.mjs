import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {WEAPONS} from '../../校园共享模块/src/rules.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const game=fileURLToPath(new URL('../../校园逃生游戏/',import.meta.url));
const require=createRequire(path.join(game,'package.json')),ts=require('typescript');
const source=await readFile(path.join(game,'src/multiplayer/shared/combat.ts'),'utf8');
const tree=ts.createSourceFile('combat.ts',source,ts.ScriptTarget.Latest,true);
let damages;
for(const statement of tree.statements){
 if(!ts.isVariableStatement(statement))continue;
 for(const declaration of statement.declarationList.declarations){
  if(declaration.name.getText(tree)!=='PVP_DAMAGE')continue;
  if(!declaration.initializer||!ts.isObjectLiteralExpression(declaration.initializer))throw Error('PvP data must remain a literal export');
  damages={};for(const property of declaration.initializer.properties){
   if(!ts.isPropertyAssignment(property)||!ts.isNumericLiteral(property.initializer))throw Error('Unexpected PvP damage declaration');
   damages[property.name.getText(tree)]=Number(property.initializer.text);
  }
 }
}
if(!damages||Object.keys(WEAPONS).some(id=>!Number.isFinite(damages[id])))throw Error('Shared weapon damage export is incomplete');
const definitions=structuredClone(WEAPONS);for(const [id,damage]of Object.entries(damages))definitions[id].pvpDamage=damage;
const output=path.join(root,process.argv.includes('--production')?'content/combat':'content/demo');
await mkdir(output,{recursive:true});await writeFile(path.join(output,'weapons.json'),JSON.stringify(definitions,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',weapons:Object.keys(definitions).length,formalAssets:false}));
