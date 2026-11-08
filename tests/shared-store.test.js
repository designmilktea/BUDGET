import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyCommand,blankShared,tokyoDay,targetFor} from '../src/shared-domain.js';

test('retrying the exact shared transaction after reopening saves one item and one grouped purchase',async()=>{
 const records=new Map([['budgets/test',{payload:JSON.stringify(blankShared(2000)),revision:1}]]);
 const context=vm.createContext({db:{},navigator:{onLine:true},applyCommand,tokyoDay,targetFor,TextEncoder,
  rootRef:id=>'budgets/'+id,doc:(_db,...path)=>path.join('/'),collection:(_db,...path)=>path.join('/'),serverTimestamp:()=>123,
  runTransaction:async(_db,callback)=>{const writes=[];const result=await callback({get:async path=>({exists:()=>records.has(path),data:()=>records.get(path)}),update:(path,value)=>writes.push(()=>records.set(path,{...records.get(path),...value})),set:(path,value)=>writes.push(()=>records.set(path,value))});writes.forEach(write=>write());return result}
 });
 const source=fs.readFileSync('src/shared-store.js','utf8'),start=source.indexOf('export async function command'),end=source.indexOf('export async function budgetNameFor');vm.runInContext(source.slice(start,end).replace('export ',''),context);
 const actor={uid:'mei',name:'Mei',color:174},add={type:'add',yen:300,destination:'cart',itemId:1234,operationId:'add-once',day:tokyoDay()};
 await context.command('test',actor,add);await context.command('test',actor,add);
 const checkout={type:'checkout',items:[{id:1234,version:1}],purchaseId:5678,operationId:'checkout-once',day:tokyoDay()};
 await context.command('test',actor,checkout);const repeat=await context.command('test',actor,checkout);
 assert.equal(repeat.revision,3);assert.equal(repeat.data.state.cart.length,0);assert.equal(repeat.data.state.purchases.length,1);assert.equal(repeat.data.state.purchases[0].items[0].yen,300);assert.equal(records.size,3);
});
