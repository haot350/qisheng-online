import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
const cwd=join(dirname(fileURLToPath(import.meta.url)),'..');
test('retention CLI defaults to true read-only inspection and requires a verified new backup before apply',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'qisheng-retention-cli-')),database=join(directory,'live.sqlite'),config=join(directory,'config.json'),backup=join(directory,'before.sqlite');
 const db=new Database(database),old=Date.now()-40*86400000;
 db.exec('CREATE TABLE runs(id TEXT,status TEXT,created INTEGER,expires INTEGER,submitted INTEGER,summary TEXT,reason TEXT);CREATE TABLE events(run_id TEXT,seq INTEGER,event TEXT);');
 db.prepare('INSERT INTO runs(id,status,created,expires,submitted,summary) VALUES(?,?,?,?,?,?)').run('old','pending',old,old+86400000,null,null);db.exec("INSERT INTO events VALUES('old',1,'{}')");db.close();
 await writeFile(config,JSON.stringify({dbPath:database}));
 const run=(...args)=>spawnSync(process.execPath,['scripts/cleanup-ranking.mjs','--config',config,...args],{cwd,encoding:'utf8'});
 try{
  const before=await readFile(database),preview=run();assert.equal(preview.status,0,preview.stderr);const selected=JSON.parse(preview.stdout);assert.equal(selected.dryRun,true);assert.equal(selected.expirePending,1);assert.equal(selected.unsubmittedEvents,1);assert.equal(selected.changed,0);assert.deepEqual(await readFile(database),before);
  const rejected=run('--apply');assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/requires --backup/);assert.deepEqual(await readFile(database),before);
  const applied=run('--apply','--backup',backup);assert.equal(applied.status,0,applied.stderr);const result=JSON.parse(applied.stdout);assert.equal(result.backup.verified,true);assert.equal(result.changes.unsubmitted,1);
  const copy=new Database(backup,{readonly:true});try{assert.equal(copy.pragma('quick_check',{simple:true}),'ok');assert.equal(copy.prepare('SELECT count(*) n FROM events').get().n,1);assert.equal(copy.prepare('SELECT status FROM runs').get().status,'pending');}finally{copy.close();}
  const live=new Database(database,{readonly:true});try{assert.equal(live.prepare('SELECT count(*) n FROM events').get().n,0);assert.equal(live.prepare('SELECT count(*) n FROM runs').get().n,1);}finally{live.close();}
  const unchanged=await readFile(database),duplicate=run('--apply','--backup',backup);assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/EEXIST/);assert.deepEqual(await readFile(database),unchanged);
  assert.notEqual(run('--unknown').status,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
