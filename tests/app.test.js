import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
process.env.TZ='Asia/Tokyo';
test('budget persistence, rollover, grouped purchases, history and deletion',()=>{
const source=fs.readFileSync('src/app.js','utf8');
const disk=new Map();let clock='2026-11-07T22:30:00+09:00';
function boot(storage=disk){const nodes=new Map(),events={},timers=new Map();let tid=0;const node=id=>{if(!nodes.has(id))nodes.set(id,{id,dataset:{},style:{},classList:{toggle(){}},innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,scrollLeft:0,scrollTop:0,scrollWidth:1000,open:false,listeners:{},attributes:{},setAttribute(k,v){this.attributes[k]=v},addEventListener(k,fn){this.listeners[k]=fn},querySelector(){return node('addkey')},focus(){},select(){},blur(){this.onblur?.()},scrollTo({left}){this.scrollLeft=left;this.listeners.scroll?.()},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)};
 const RealDate=Date;class TestDate extends RealDate{constructor(...args){super(...(args.length?args:[clock]))}static now(){return new RealDate(clock).getTime()}}
 const context=vm.createContext({console,Intl,Set,Date:TestDate,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},setTimeout(fn,ms){timers.set(++tid,{fn,ms});return tid},clearTimeout(id){timers.delete(id)},window:{addEventListener(k,fn){events['window:'+k]=fn}},document:{visibilityState:'visible',getElementById:node,querySelectorAll(){return []},querySelector(){return null},createElement(){return node('edit'+(++tid))},addEventListener(k,fn,capture){events['document:'+k+':'+!!capture]=fn}}});
 vm.runInContext(source,context);return {run:s=>vm.runInContext(s,context),node,context,events,timers};}
const snapshot=b=>JSON.parse(b.run('JSON.stringify({state,entry,tokens,fresh,solved,calcError,ui,expanded:[...expanded]})'));
let b=boot();assert.equal(b.node('projected').textContent,'¥1,000');assert.equal(b.run('state.purchases.length'),0);assert.equal(b.run('state.cart.length'),0);assert.equal(disk.size,2);
b.node('budgetname').value='My Tokyo budget';b.node('budgetinput').value='1500';b.node('savebudget').onclick();assert.equal(b.run('defaultBudget'),1500);assert.equal(b.run('state.budget'),1500);
b.run("key('2');key('0');key('0');add();key('5');key('0');add()");assert.equal(b.node('projected').textContent,'¥1,250');b.node('checkout').onclick();assert.equal(b.run('state.purchases.length'),1);assert.equal(b.run('state.purchases[0].items.length'),2);assert.equal(b.node('projected').textContent,'¥1,250');
b.node('destinationbtn').onclick();assert.equal(b.run('state.mode'),'spent');
b.run("state.type='full';key('1');key('0');key('0');key('×');key('3');expanded.add(state.purchases[0].id);render()");
b.node('cart').scrollLeft=70;b.node('cart').listeners.scroll();b.node('middle').scrollTop=130;b.node('middle').listeners.scroll();const expected=snapshot(b);
b=boot();assert.equal(b.node('budgettitle').textContent,'My Tokyo budget');assert.deepEqual(snapshot(b),expected);assert.equal(b.node('cart').scrollLeft,70);assert.equal(b.node('middle').scrollTop,130);assert.equal(b.run('amount()'),300);
// Rename purchases and constituent items persists, without changing spending.
b.context.button={isConnected:true,dataset:{purchaseName:String(b.run('state.purchases[0].id'))},replaceWith(input){b.context.edit=input}};b.run('renamePurchase(button)');b.context.edit.value='Groceries';b.context.edit.onkeydown({key:'Enter',preventDefault(){}});
b.context.button={isConnected:true,dataset:{purchase:String(b.run('state.purchases[0].id')),purchaseItem:'0'},replaceWith(input){b.context.edit=input}};b.run('renamePurchase(button)');b.context.edit.value='Lunch';b.context.edit.onblur();b=boot();assert.equal(b.run('state.purchases[0].name'),'Groceries');assert.equal(b.run('state.purchases[0].items[0].name'),'Lunch');
// An unpurchased cart item carries forward, unselected.
b.run("clearCalc();state.mode='cart';key('4');key('0');key('0');add()");const oldDate=b.run('currentDate');assert.equal(b.node('projected').textContent,'¥850');
clock='2026-11-08T00:00:01+09:00';b.events['window:focus']();assert.equal(b.run('currentDate'),'2026-11-08');assert.equal(b.run('state.budget'),1500);assert.equal(b.run('state.purchases.length'),0);assert.equal(b.run('state.cart.length'),1);assert.equal(b.run('state.cart[0].selected'),false);assert.equal(b.node('projected').textContent,'¥1,500');assert.equal(b.run('entry'),'0');assert.equal(b.run("history['2026-11-07'].budget"),1500);assert.equal(b.run("history['2026-11-07'].purchases[0].name"),'Groceries');assert.equal(b.run("history['2026-11-07'].cart[0].selected"),true);
// New budget affects today/future only, not archived budgets.
b.node('budgetinput').value='2000';b.node('savebudget').onclick();assert.equal(b.run("history['2026-11-07'].budget"),1500);
b.node('previousdays').onclick();assert.equal(b.node('historydialog').open,true);assert.match(b.node('historycontent').innerHTML,/Groceries/);assert.match(b.node('historycontent').innerHTML,/Lunch/);assert.ok(!b.node('historycontent').innerHTML.includes('data-delete'));assert.ok(!b.node('historycontent').innerHTML.includes('data-purchase-name'));b.node('backtoday').onclick();assert.equal(b.node('historydialog').open,false);
// Reopening after several days still starts fresh with latest budget.
clock='2026-11-11T09:00:00+09:00';b=boot();assert.equal(b.run('state.budget'),2000);assert.equal(b.run('defaultBudget'),2000);assert.equal(b.node('projected').textContent,'¥2,000');assert.equal(b.run("history['2026-11-07'].budget"),1500);assert.equal(b.run("history['2026-11-08'].budget"),2000);assert.equal(b.run('Object.keys(history).length'),2);
// Scheduled midnight timer and visibility checks.
assert.ok([...b.timers.values()].some(t=>t.ms>0&&t.ms<=86400050));clock='2026-11-12T00:00:01+09:00';[...b.timers.values()].find(t=>t.ms>1000).fn();assert.equal(b.run('currentDate'),'2026-11-12');
// Whole-yen input and arithmetic regressions.
b.node('budgetinput').value='2000.5';b.node('savebudget').onclick();assert.equal(b.run('state.budget'),2000);assert.match(b.node('budgeterror').textContent,/whole yen/);assert.equal(b.run("calculate(['2','+','3','×','4'])"),14);assert.equal(b.run("calculate(['10','÷','0'])"),null);
// Cancellation retains purchase data; confirmed deletion is saved on reload.
b.run("state.mode='spent';clearCalc();key('5');key('0');add()");const pid=b.run('state.purchases[0].id');
function askDelete(){b.node('purchases').onclick({target:{closest(selector){return selector==='[data-delete]'?{dataset:{delete:String(pid)}}:null}}})}
askDelete();b.node('canceldelete').onclick();b=boot();assert.equal(b.run('state.purchases.length'),1);
askDelete();b.node('confirmdelete').onclick();b=boot();assert.equal(b.run('state.purchases.length'),0);
// Cart selection/removal and budget persist on repeated reopening.
b.node('destinationbtn').onclick();b.run("clearCalc();key('1');key('0');add()");b.node('cart').onchange({target:{dataset:{select:String(b.run('state.cart.at(-1).id'))},checked:false}});b=boot();assert.equal(b.run('state.cart.at(-1).selected'),false);
const cartId=b.run('state.cart.at(-1).id');b.node('cart').onclick({target:{closest(){return {dataset:{remove:String(cartId)}}}}});b=boot();assert.ok(!b.run('state.cart.some(x=>x.id==='+cartId+')'));
// Storage failures are visible rather than silently claiming success.
const broken={get(){throw new Error('disabled')},set(){throw new Error('disabled')}};const bad=boot(broken);assert.ok(bad.context.window.BudgetPendingNotices.length>0);assert.equal(bad.run('storageReady'),false);
// Corrupt saved data is not overwritten.
const corrupt=new Map([['daily-budget-v1','broken']]);const corruptApp=boot(corrupt);assert.equal(corrupt.get('daily-budget-v1'),'broken');assert.ok(corruptApp.context.window.BudgetPendingNotices.length>0);
console.log('Passed: same-day reload, calculator draft/settings/expansion/scroll restoration, saved renames, grouped checkout, local midnight rollover, multi-day reopen, carried deselected cart, updated future budgets, immutable historical budgets, read-only history, JPY validation, storage failure handling.');

});
