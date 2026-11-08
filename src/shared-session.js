import {applyCommand,tokyoDay} from './shared-domain.js';

// Keep the interactive view ahead of network latency. Each command has stable
// record/event IDs so replaying an interrupted request cannot duplicate a purchase.
export class SharedSession {
 constructor({actor,commit,update,fail,storage,key,day=tokyoDay,id=()=>crypto.randomUUID(),recordId=()=>{const words=new Uint32Array(2);crypto.getRandomValues(words);return 1+words[0]*1048576+(words[1]>>>12)}}){
  Object.assign(this,{actor,commit,update,fail,storage,key,day,id,recordId});
  this.base=null;this.revision=0;this.running=false;this.closed=false;this.pending=[];
  try{this.pending=JSON.parse(storage.getItem(key)||'[]').map(command=>({command}))}catch{}
 }
 persist(){this.storage.setItem(this.key,JSON.stringify(this.pending.map(x=>x.command)))}
 persistResult(command){try{this.persist()}catch{this.fail(new Error('The latest save could not be cached on this browser. Keep this page open.'),command)}}
 receive(data,revision){
  if(this.closed||revision<this.revision)return;
  // A listener can see our transaction before its promise resolves. Do not
  // project the still-pending command a second time over that server result.
  if(this.running){if(!this.buffer||revision>=this.buffer.revision)this.buffer={data,revision};return}
  this.base=data;this.revision=revision;this.project();this.flush();
 }
 acceptBuffer(){if(this.buffer?.revision>=this.revision){this.base=this.buffer.data;this.revision=this.buffer.revision}this.buffer=null}
 project(){
  if(this.closed||!this.base)return;
  let view=this.base;
  for(const entry of this.pending){try{view=applyCommand(view,entry.command,this.actor,entry.command.day).data}catch{/* The transaction reports authoritative conflicts. */}}
  const encoded=JSON.stringify(view);if(encoded!==this.lastView){this.lastView=encoded;this.update(view)}
 }
 perform(input){
  if(this.closed||!this.base)return Promise.reject(new Error('The shared budget is still loading.'));
  const command={...input,operationId:this.id(),day:this.day()};
  if(input.type==='add'){command.itemId=this.recordId();if(input.destination==='spent')command.purchaseId=this.recordId()}
  if(input.type==='checkout')command.purchaseId=this.recordId();
  // Validate against the current projected view before accepting input.
  let view=this.base;for(const entry of this.pending)view=applyCommand(view,entry.command,this.actor,entry.command.day).data;
  applyCommand(view,command,this.actor,command.day);
  return new Promise((resolve,reject)=>{
   const entry={command,resolve,reject};this.pending.push(entry);
   try{this.persist()}catch(error){this.pending.pop();reject(error);return}
   this.project();this.flush();
  });
 }
 async flush(){
  if(this.closed||this.running||!this.base||!this.pending.length)return;
  this.running=true;
  while(!this.closed&&this.pending.length){
   const entry=this.pending[0];
   try{
    const result=await this.commit(entry.command);
    if(this.closed)break;
    this.pending.shift();
    if(result.revision>=this.revision){this.base=result.data;this.revision=result.revision}
    this.acceptBuffer();this.persistResult(entry.command);this.project();entry.resolve?.();
   }catch(error){
    if(this.closed)break;
    this.pending.shift();this.acceptBuffer();this.persistResult(entry.command);this.project();
    if(entry.reject)entry.reject(error);else this.fail(error,entry.command);
   }
  }
  this.running=false;
 }
 close(){this.closed=true}
}
