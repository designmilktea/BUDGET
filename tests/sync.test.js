import test from 'node:test';
import assert from 'node:assert/strict';
import {SyncSession} from '../src/sync.js';
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data}}
const snapshot=n=>({version:1,state:{budget:n},history:{}});
function setup({storage=memory(),uid='alice',revision=0,value=null}={}){
 let cloud={revision,snapshot:value},writes=0;const statuses=[];
 const remote={async read(){return structuredClone(cloud)},async commit(expected,value){if(expected!==cloud.revision){const e=new Error('conflict');e.code='budget/conflict';throw e}writes++;cloud={revision:expected+1,snapshot:structuredClone(value)};return cloud.revision}};
 const session=new SyncSession({storage,uid,remote,onStatus:s=>statuses.push(s),onRemote:data=>statuses.push(data)});
 return {storage,session,statuses,remote,cloud:()=>cloud,writes:()=>writes};
}
test('new Google account can upload browser snapshot, then coalesce later saves',async()=>{
 const x=setup();await x.session.start(snapshot(1000));x.session.queue(snapshot(1000));x.session.queue(snapshot(1500));await x.session.flush();assert.equal(x.writes(),1);assert.equal(x.cloud().snapshot.state.budget,1500);assert.equal(x.storage.getItem(x.session.key),null);x.session.close();
});
test('opening an existing account does not replace cloud data with guest data',async()=>{
 const x=setup({revision:3,value:snapshot(2000)});const value=await x.session.start(snapshot(9999));assert.equal(value.state.budget,2000);x.session.queue(value);await x.session.flush();assert.equal(x.writes(),0);x.session.close();
});
test('offline pending data survives a closed browser and is retried',async()=>{
 const x=setup();await x.session.start(snapshot(1000));x.session.remote={...x.remote,commit:async()=>{throw new Error('offline')}};x.session.queue(snapshot(1400));await x.session.flush();assert.ok(x.storage.getItem(x.session.key));x.session.close();
 const restored=new SyncSession({storage:x.storage,uid:'alice',remote:x.remote,onStatus(){},onRemote(){}});const value=await restored.start(snapshot(0));assert.equal(value.state.budget,1400);restored.queue(value);await restored.flush();assert.equal(x.cloud().snapshot.state.budget,1400);restored.close();
});
test('a stale tab cannot overwrite newer cloud records, including after reload',async()=>{
 const x=setup({revision:2,value:snapshot(2000)});x.storage.setItem(x.session.key,JSON.stringify({baseRevision:1,snapshot:snapshot(1500)}));const value=await x.session.start(snapshot(0));assert.equal(value.state.budget,1500);assert.equal(x.session.conflict,true);x.session.queue(snapshot(1600));await x.session.flush();assert.equal(x.writes(),0);assert.equal(JSON.parse(x.storage.getItem(x.session.key)).baseRevision,1);x.session.close();
});
test('account A pending data is never loaded for account B',async()=>{
 const storage=memory(),a=setup({storage,uid:'alice'}),b=setup({storage,uid:'bob',revision:2,value:snapshot(5000)});await a.session.start(snapshot(100));a.session.queue(snapshot(100));const value=await b.session.start(snapshot(0));assert.equal(value.state.budget,5000);assert.notEqual(a.session.key,b.session.key);a.session.close();b.session.close();
});
test('updates made during an in-flight save are retained and uploaded next',async()=>{
 const x=setup();await x.session.start(snapshot(0));let resolve;const original=x.remote.commit;x.session.remote={...x.remote,commit:(revision,data)=>new Promise(r=>{resolve=async()=>r(await original(revision,data))})};x.session.queue(snapshot(100));const first=x.session.flush();x.session.queue(snapshot(200));x.session.remote=x.remote;await resolve();await first;await new Promise(r=>setTimeout(r,0));assert.equal(x.cloud().snapshot.state.budget,200);x.session.close();
});
test('unknown offline revision never overwrites an existing account',async()=>{
 const x=setup({revision:5,value:snapshot(5000)});x.storage.setItem(x.session.key,JSON.stringify({baseRevision:null,snapshot:snapshot(42)}));await x.session.start(snapshot(0));await x.session.flush();assert.equal(x.session.conflict,true);assert.equal(x.writes(),0);x.session.close();
});
