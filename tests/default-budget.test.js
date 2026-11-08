import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {preferredScope,lastScopeKey,setDefaultScope,clearUnavailableDefault} from '../src/preferences.js';
import {SharedSession} from '../src/shared-session.js';
import {blankShared,tokyoDay,targetFor,versionOf} from '../src/shared-domain.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('explicit default survives budget switching and remains scoped to the signed-in user',()=>{
 const disk=new Map(),storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
 storage.setItem(lastScopeKey('mei'),'tokyo');assert.equal(preferredScope(storage,'mei'),'tokyo');
 setDefaultScope(storage,'mei','home');storage.setItem(lastScopeKey('mei'),'personal');assert.equal(preferredScope(storage,'mei'),'home');assert.equal(preferredScope(storage,'alex'),'personal');
 clearUnavailableDefault(storage,'mei','other');assert.equal(preferredScope(storage,'mei'),'home');clearUnavailableDefault(storage,'mei','home');assert.equal(preferredScope(storage,'mei'),'personal');
});
function sharingBoot({offline=false,disk=new Map()}={}){
 const nodes=new Map(),events={},screens=[],calls=[],member={uid:'mei',name:'Mei',email:'mei@example.com',color:174};let accountListener,rootListener,memberListener,name='Personal budget';
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:true,open:false,addEventListener(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)};
 const storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
 const app={restoring(){calls.push('hide')},ready(){screens.push(name)},name:()=>name,setSharedAdapter(){},connect(){},switchAccount:key=>{calls.push(key)},applyShared:data=>{name=data.budgetName||'Shared budget'},snapshot:()=>({defaultBudget:2000}),editShared(){}};
 const empty=()=>()=>{};
 const store={readMember:async()=>{calls.push('readMember');return member},watchMember:(id,uid,fn)=>{memberListener=fn;return()=>{}},watchBudget:(id,fn)=>{rootListener=fn;return()=>{}},watchMembers:empty,watchEvents:empty,watchSentInvites:empty,watchScopes:empty,watchInvitations:empty,command:async()=>{},budgetNameFor:async()=> 'Tokyo home'};
 const context=vm.createContext({console,Intl,Date,Map,Set,JSON,URLSearchParams,URL,SharedSession,tokyoDay,targetFor,versionOf,preferredScope,lastScopeKey,setDefaultScope,clearUnavailableDefault,
  localStorage:storage,navigator:{onLine:!offline},location:{search:'',href:'https://example.com/'},crypto:{randomUUID:()=> 'id'},setTimeout(){return 1},clearTimeout(){},
  window:{BudgetApp:app,BudgetNotifications:{context(){},setReviewHandler(){},checkDay(){},push(){},pushMany(){}},addEventListener:(name,fn)=>events[name]=fn},document:{getElementById:el,activeElement:null},
  observeAccount:fn=>accountListener=fn,getAccount(){},suspendPrivate(){},returnToPrivate:async()=>{name='Personal budget';screens.push(name)},privateHistory:async()=>({}),store});
 vm.runInContext(fs.readFileSync('src/sharing.js','utf8').replace(/^import .*\n/gm,''),context);
 const emit=phase=>accountListener({user:member,phase,preferred:'tokyo'});
 return {el,screens,calls,storage,emit,events,context,root:data=>rootListener({id:'tokyo',ownerUid:'mei',revision:1,data}),remove:()=>memberListener(null)};
}
test('default shared budget is opened directly without rendering personal budget first',async()=>{
 const b=sharingBoot();await b.emit('loading');await b.emit('ready');await tick();assert.deepEqual(b.screens,[]);assert.ok(b.calls.includes('daily-budget-v1:mei:shared:tokyo'));assert.ok(!b.calls.includes('daily-budget-v1:mei'));
 b.root({...blankShared(2000),budgetName:'Tokyo home'});assert.deepEqual(b.screens,['Tokyo home']);assert.match(b.el('defaultbudget').innerHTML,/Tokyo home/);
});
test('known membership and confirmed data restore the default shared view offline',async()=>{
 const disk=new Map([['budget-member:mei:tokyo',JSON.stringify({uid:'mei',name:'Mei',color:174})],['budget-outbox:mei:tokyo:confirmed',JSON.stringify({data:{...blankShared(2000),budgetName:'Tokyo home'},revision:1})]]);
 const b=sharingBoot({offline:true,disk});await b.emit('loading');await b.emit('ready');await tick();assert.ok(b.screens.includes('Tokyo home'));assert.ok(!b.screens.includes('Personal budget'));assert.ok(!b.calls.includes('readMember'));assert.match(b.el('cloudstatus').textContent,/Offline/);
});
test('revoked membership clears an unavailable default and returns to personal',async()=>{
 const b=sharingBoot();setDefaultScope(b.storage,'mei','tokyo');await b.emit('loading');await b.emit('ready');await tick();b.root({...blankShared(2000),budgetName:'Tokyo home'});b.remove();await tick();assert.equal(preferredScope(b.storage,'mei'),'personal');assert.equal(b.screens.at(-1),'Personal budget');
});
