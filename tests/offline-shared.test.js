import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedSession} from '../src/shared-session.js';
import {blankShared,applyCommand} from '../src/shared-domain.js';
const day=()=> '2026-11-08',actor={uid:'mei',name:'Mei',color:174};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('yesterday’s offline draft is kept for review instead of becoming today’s spending',async()=>{
 let today='2026-11-08',online=false,view;const failed=[],disk=new Map(),storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
 const session=new SharedSession({actor,storage,key:'queue',day:()=>today,online:()=>online,id:()=> 'old-add',recordId:()=>123,update:data=>view=data,fail:(error,command)=>failed.push(command),commit:async command=>{if(command.day!==today)throw new Error('This change belongs to a previous day.')}});
 session.receive(blankShared(2000,today),1);await session.perform({type:'add',yen:300,destination:'spent'});
 today='2026-11-09';session.project();assert.equal(view.currentDate,today);assert.equal(view.state.purchases.length,0);assert.equal(session.pending.length,1);
 online=true;await session.flush();assert.equal(failed[0].day,'2026-11-08');assert.equal(failed[0].yen,300);assert.equal(view.state.purchases.length,0);
});
test('offline edits survive reopening and reconcile with another member’s additions on reconnect',async()=>{
 const disk=new Map(),storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
 let online=false,server=blankShared(2000,day()),revision=1,seq=100,view,commits=0;
 const make=()=>new SharedSession({actor,storage,key:'mei:tokyo',day,online:()=>online,id:()=>String(++seq),recordId:()=>++seq,update:data=>view=data,fail(error){throw error},commit:async command=>{commits++;server=applyCommand(server,command,actor,day()).data;return {data:server,revision:++revision}}});
 let session=make();session.receive(server,revision);
 await session.perform({type:'add',yen:300,destination:'cart'});await session.perform({type:'budget',yen:2500,expectedBudget:2000,name:'Tokyo home',expectedName:'Shared budget'});
 assert.equal(commits,0);assert.equal(view.state.cart[0].yen,300);assert.equal(view.budgetName,'Tokyo home');assert.equal(session.pending.length,2);session.close();
 session=make();session.restore();assert.equal(view.budgetName,'Tokyo home');assert.equal(view.state.cart.length,1);
 server=applyCommand(server,{type:'add',yen:150,destination:'cart'},{uid:'alex',name:'Alex',color:36},day()).data;revision++;
 online=true;await session.flush();
 assert.deepEqual(server.state.cart.map(x=>x.yen),[150,300]);assert.equal(server.budgetName,'Tokyo home');assert.equal(server.defaultBudget,2500);assert.equal(session.pending.length,0);assert.equal(commits,2);
});
test('connection loss during a save retains the command instead of rolling back input',async()=>{
 let online=true,rejectRequest,view;
 const disk=new Map(),storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
 const session=new SharedSession({actor,storage,key:'queue',day,online:()=>online,id:()=> 'op',recordId:()=>123,update:data=>view=data,fail(error){throw error},commit:()=>new Promise((resolve,reject)=>rejectRequest=reject)});
 session.receive(blankShared(2000,day()),1);const done=session.perform({type:'add',yen:400,destination:'cart'});
 online=false;rejectRequest(Object.assign(new Error('Network lost'),{code:'unavailable'}));await done;await tick();
 assert.equal(view.state.cart[0].yen,400);assert.equal(session.pending.length,1);assert.equal(JSON.parse(disk.get('queue'))[0].yen,400);session.close();
});
test('a stale offline rename is reported for review and does not overwrite the other member',async()=>{
 let online=false,view;const failed=[],disk=new Map(),storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
 let server=applyCommand(blankShared(2000,day()),{type:'add',yen:200,destination:'cart'},actor,day()).data;
 const session=new SharedSession({actor,storage,key:'queue',day,online:()=>online,id:()=> 'rename-op',update:data=>view=data,fail:(error,command)=>failed.push({error,command}),commit:async command=>({data:applyCommand(server,command,actor,day()).data,revision:3})});
 session.receive(server,2);await session.perform({type:'rename',target:'cart',id:1,name:'My draft',expectedVersion:1});
 server=applyCommand(server,{type:'rename',target:'cart',id:1,name:'Alex’s name',expectedVersion:1},{uid:'alex',name:'Alex',color:36},day()).data;
 online=true;session.receive(server,3);await session.flush();await tick();
 assert.equal(view.state.cart[0].name,'Alex’s name');assert.equal(failed.length,1);assert.equal(failed[0].command.name,'My draft');assert.equal(failed[0].error.code,'budget/conflict');
});
