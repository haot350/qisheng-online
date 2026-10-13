import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {injectHtmlRelease} from '../scripts/html-cache-policy.mjs';
const source=await readFile(new URL('../shared/fresh-entry-bootstrap.js',import.meta.url),'utf8');
const id='20261007T120000Z-0.6.3';
const bootstrap='/assets/bootstrap/'+createHash('sha256').update(source).digest('hex')+'.js';
function boot(url,site='campus',marker=id){const location=new URL(url),calls=[];const context={URL,location,document:{currentScript:{getAttribute:key=>key==='data-qisheng-fresh'?site:null},querySelector:()=>marker?{content:marker}:null},history:{state:{selection:'keep'},replaceState(...args){calls.push(args);}}};vm.runInNewContext(source,context);return calls;}
test('release marker and blocking same-origin bootstrap precede application/router scripts',()=>{const html=injectHtmlRelease('<html><head><script type="module" src="/assets/app-123.js"></script></head></html>',id,{site:'campus',bootstrap});const marker=html.indexOf('qisheng-release'),loader=html.indexOf('data-qisheng-fresh'),app=html.indexOf('type="module"');assert.ok(marker<loader&&loader<app);assert.match(html,/<script data-qisheng-fresh="campus" src="\/assets\/bootstrap\/[a-f0-9]{64}\.js"><\/script>/);assert.equal(injectHtmlRelease(html,id,{site:'campus',bootstrap}),html);assert.throws(()=>injectHtmlRelease(html,id,{site:'campus',bootstrap:'https://other.test/script.js'}));});
test('blocking bootstrap keeps mode, panel, issue and fragment before router startup',()=>{for(const [site,path,canonical]of[['campus','/__fresh/feedback','/feedback'],['game','/__fresh/','/']]){const calls=boot('https://test.example'+path+'?mode=tdm&panel=progress&issue=42&_release='+id+'#answer',site);assert.equal(calls.length,1);assert.equal(calls[0][0].selection,'keep');assert.equal(calls[0][2],canonical+'?mode=tdm&panel=progress&issue=42#answer');}});
test('wrong release and non-public aliases never hide the mismatch or navigate automatically',()=>{assert.equal(boot('https://test.example/__fresh/feedback?_release=20261007T110000Z-0.6.2').length,0);assert.equal(boot('https://test.example/__fresh/admin').length,0);assert.equal(boot('https://test.example/__fresh/feedback','game').length,0);assert.equal(boot('https://test.example/feedback').length,0);});
test('manual uncached entry canonicalizes without requiring a manifest query',()=>{assert.equal(boot('https://test.example/__fresh/explore?view=floor2')[0][2],'/explore?view=floor2');assert.equal(boot('https://test.example/__fresh','game')[0][2],'/');});
