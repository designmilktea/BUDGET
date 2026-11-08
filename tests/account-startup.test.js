import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {preferredScope,setDefaultScope} from '../src/preferences.js';
import {SyncSession} from '../src/sync.js';
test('account startup delegates a shared default before reading or showing personal data',async()=>{
 const disk=new Map(),storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)},calls=[],nodes=new Map();setDefaultScope(storage,'mei','tokyo');
 const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,classList:{toggle(){}}});return nodes.get(id)};
 const app={restoring:()=>calls.push('hide'),ready:()=>calls.push('ready'),connect(){},setSharedAdapter(){},switchAccount:key=>{calls.push(key);return {state:{}}},snapshot:()=>({}),key:()=> 'daily-budget-v1'};
 const context=vm.createContext({console,preferredScope,SyncSession,localStorage:storage,window:{BudgetApp:app,addEventListener(){}},document:{getElementById:el},mockUser:{uid:'mei'},mockServices:{remoteFor(){calls.push('private-read');return {read:async()=>({revision:0,snapshot:null})}}}});
 let source=fs.readFileSync('src/account.js','utf8');source=source.slice(0,source.indexOf("try{services=await import"));vm.runInContext(source.replace(/^import .*\n/gm,'').replaceAll('export ',''),context);
 const phases=[];context.observeAccount(event=>phases.push(event));await vm.runInContext('services=mockServices;connect(mockUser)',context);
 assert.deepEqual(calls,['hide']);assert.equal(phases.at(-1).preferred,'tokyo');assert.equal(phases.at(-1).phase,'ready');
 await vm.runInContext('connect(null)',context);assert.equal(calls.at(-2),'daily-budget-v1');assert.equal(calls.at(-1),'ready');
});
