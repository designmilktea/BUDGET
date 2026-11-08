import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedSession} from '../src/shared-session.js';
import {applyCommand,blankShared} from '../src/shared-domain.js';

const day=()=> '2026-11-08',actor={uid:'mei',name:'Mei',color:174};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(disk=new Map()){
 let server=blankShared(2000,day()),revision=1,view,seq=1000;
 const requests=[],errors=[],views=[];
 const storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
 const session=new SharedSession({actor,storage,key:'mei:budget',day,id:()=>String(++seq),recordId:()=>++seq,
  update:data=>{view=data;views.push(data)},fail:(e,c)=>errors.push({e,c}),
  commit:command=>new Promise((resolve,reject)=>requests.push({command,reject,finish(){server=applyCommand(server,command,actor,day()).data;revision++;return {data:server,revision}},resolve}))});
 session.receive(server,revision);
 return {session,disk,requests,errors,views,get view(){return view},get server(){return server},remote(command){server=applyCommand(server,command,{uid:'alex',name:'Alex',color:300},day()).data;session.receive(server,++revision)},async finish(){const request=requests.shift(),result=request.finish();request.resolve(result);await tick()}};
}
test('rapid additions and checkout update immediately while commits remain in order',async()=>{
 const b=setup(),first=b.session.perform({type:'add',yen:300,destination:'cart'}),second=b.session.perform({type:'add',yen:450,destination:'cart'});
 assert.deepEqual(b.view.state.cart.map(x=>x.yen),[300,450]);assert.equal(b.requests.length,1);
 const ids=b.view.state.cart.map(x=>x.id);
 const checkout=b.session.perform({type:'checkout',items:b.view.state.cart.map(x=>({id:x.id,version:x.version}))});
 assert.equal(b.view.state.cart.length,0);assert.equal(b.view.state.purchases.length,1);assert.deepEqual(b.view.state.purchases[0].items.map(x=>x.id),ids);
 await b.finish();await b.finish();await b.finish();await Promise.all([first,second,checkout]);
 assert.deepEqual(b.server.state.purchases[0].items.map(x=>x.yen),[300,450]);assert.equal(b.server.state.purchases.length,1);assert.equal(b.disk.get('mei:budget'),'[]');
});
test('own snapshot before acknowledgement does not duplicate an optimistic add',async()=>{
 const b=setup(),done=b.session.perform({type:'add',yen:200,destination:'cart'});
 const request=b.requests.shift(),result=request.finish();b.session.receive(result.data,result.revision);
 assert.equal(b.view.state.cart.length,1);request.resolve(result);await done;
 assert.equal(b.view.state.cart.length,1);assert.equal(b.view.state.cart[0].yen,200);
 b.session.receive(blankShared(2000,day()),1);assert.equal(b.view.state.cart.length,1);
});
test('remote changes rebase queued additions without changing their IDs',async()=>{
 const b=setup(),done=b.session.perform({type:'add',yen:200,destination:'cart'}),id=b.view.state.cart[0].id;
 b.remote({type:'add',yen:100,destination:'cart'});await b.finish();await done;
 assert.deepEqual(b.view.state.cart.map(x=>x.yen),[100,200]);assert.equal(b.view.state.cart[1].id,id);
});
test('failed save rolls back only that command and preserves following input',async()=>{
 const b=setup(),first=b.session.perform({type:'add',yen:200,destination:'cart'}).catch(e=>e),second=b.session.perform({type:'add',yen:350,destination:'cart'});
 b.requests.shift().reject(new Error('permission denied'));await tick();
 assert.deepEqual(b.view.state.cart.map(x=>x.yen),[350]);await b.finish();await second;assert.match((await first).message,/permission/);
});
test('unfinished requests are stored by budget and reopen with the same operation IDs',async()=>{
 const b=setup();b.session.perform({type:'add',yen:250,destination:'cart'});const original=JSON.parse(b.disk.get('mei:budget'))[0];b.session.close();
 const reopened=setup(b.disk);assert.equal(reopened.view.state.cart[0].yen,250);assert.equal(reopened.requests[0].command.operationId,original.operationId);assert.equal(reopened.view.state.cart[0].id,original.itemId);await reopened.finish();
});
