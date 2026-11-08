import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {SharedSession} from '../src/shared-session.js';
import {applyCommand,blankShared,tokyoDay} from '../src/shared-domain.js';

function boot(){
 const nodes=new Map(),writes=[],disk=new Map();
 const el=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,style:{},dataset:{},classList:{toggle(){}},scrollLeft:0,scrollTop:0,scrollWidth:100,open:false,setAttribute(){},addEventListener(type,fn){this[type]=fn},querySelector(){return el('addkey')},scrollTo(){},focus(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)};
 const window={addEventListener(){}};
 const context=vm.createContext({console,Intl,Set,Date,window,document:{getElementById:el,querySelectorAll(){return []},querySelector(){return null},addEventListener(){}},localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>{disk.set(k,v);writes.push({key:k,value:v})}},setTimeout(){return 1},clearTimeout(){}});
 vm.runInContext(fs.readFileSync('src/app.js','utf8'),context);
 return {app:window.BudgetApp,run:code=>vm.runInContext(code,context),el,writes,disk};
}
test('calculator digits and scrolling write only a small draft and never queue full cloud saves',()=>{
 const b=boot();b.run("for(let i=0;i<1000;i++)state.cart.push({id:i+1,name:'Item '+i,yen:10,selected:true});render()");
 let cloudWrites=0;b.app.connect(()=>cloudWrites++);b.writes.length=0;
 b.run("key('1');key('2');key('3');key('4');key('5');key('6')");b.el('cart').scrollLeft=30;b.el('cart').scroll();
 assert.equal(cloudWrites,0);assert.equal(b.writes.length,7);assert.ok(b.writes.every(w=>w.key.endsWith(':draft')&&w.value.length<400));assert.equal(b.el('number').textContent,'123,456');
});
test('UI shows both rapid amounts before network completion and keeps the next draft on acknowledgement',async()=>{
 const b=boot(),requests=[],disk=new Map(),actor={uid:'mei',name:'Mei',color:174};let server=blankShared(2000,tokyoDay()),revision=1,seq=100;
 const session=new SharedSession({actor,storage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)},key:'queue',id:()=>String(++seq),recordId:()=>++seq,update:data=>b.app.applyShared(data),fail(error){throw error},commit:command=>new Promise(resolve=>requests.push(()=>{server=applyCommand(server,command,actor).data;const result={data:server,revision:++revision};session.receive(result.data,result.revision);resolve(result)}))});
 b.app.setSharedAdapter({day:tokyoDay,checkDay(){},perform:command=>session.perform(command),fail(error){throw error}});session.receive(server,revision);
 b.run("key('3');key('0');key('0');add();key('4');key('5');key('0');add();key('9')");
 assert.equal(b.el('listtitle').textContent,'Considering (2)');assert.match(b.el('cart').innerHTML,/¥300/);assert.match(b.el('cart').innerHTML,/¥450/);assert.equal(b.el('projected').textContent,'¥1,250');assert.equal(b.el('number').textContent,'9');assert.equal(b.el('addkey').disabled,false);
 requests.shift()();await new Promise(resolve=>setImmediate(resolve));requests.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(b.el('listtitle').textContent,'Considering (2)');assert.equal(b.el('number').textContent,'9');assert.deepEqual(server.state.cart.map(x=>x.yen),[300,450]);
});
