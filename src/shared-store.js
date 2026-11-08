import {db} from './firebase.js';
import {collection,doc,onSnapshot,query,where,getDocFromServer,getDocsFromServer,runTransaction,writeBatch,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {applyCommand,blankShared,tokyoDay,targetFor} from './shared-domain.js';
const rootRef=id=>doc(db,'budgets',id),memberRef=(id,uid)=>doc(db,'budgets',id,'members',uid),indexRef=(uid,id)=>doc(db,'users',uid,'sharedBudgets',id),inviteRef=id=>doc(db,'budgetInvites',id);
export const identity=user=>({uid:user.uid,email:user.email?.toLowerCase()||'',name:user.displayName||user.email||'Google user'});
export function watchScopes(user,callback,fail){return onSnapshot(collection(db,'users',user.uid,'sharedBudgets'),snapshot=>callback(snapshot.docs.map(d=>({id:d.id,...d.data()})),{fromCache:snapshot.metadata.fromCache}),fail)}
export function watchInvitations(user,callback,fail){return onSnapshot(query(collection(db,'budgetInvites'),where('email','==',user.email.toLowerCase()),where('status','==','pending')),snapshot=>callback(snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.expiresAt.toMillis()>Date.now())),fail)}
export async function createBudget(user,amount){
 const id=doc(collection(db,'budgets')).id,actor=identity(user),batch=writeBatch(db);
 batch.set(rootRef(id),{ownerUid:user.uid,title:'Shared budget',timezone:'Asia/Tokyo',revision:1,nextColor:1,payload:JSON.stringify(blankShared(amount)),updatedAt:serverTimestamp()});
 batch.set(memberRef(id,user.uid),{...actor,color:36,inviteId:'',joinedAt:serverTimestamp()});
 batch.set(indexRef(user.uid,id),{title:'Shared budget · '+actor.name,ownerUid:user.uid});
 await batch.commit();return id;
}
export function watchBudget(id,update,fail){return onSnapshot(rootRef(id),snap=>{if(snap.exists())update({...snap.data(),id,data:JSON.parse(snap.data().payload)});else fail(new Error('This budget no longer exists.'))},fail)}
export function watchMembers(id,update,fail){return onSnapshot(collection(db,'budgets',id,'members'),snap=>update(snap.docs.map(d=>({uid:d.id,...d.data()}))),fail)}
export function watchMember(id,uid,update,fail){return onSnapshot(memberRef(id,uid),snap=>update(snap.exists()?snap.data():null),fail)}
export function watchEvents(id,day,update,fail){return onSnapshot(query(collection(db,'budgets',id,'events'),where('day','==',day)),{includeMetadataChanges:true},snap=>update(snap.docChanges({includeMetadataChanges:true}).filter(change=>change.type!=='removed'&&!change.doc.metadata.hasPendingWrites).map(change=>change.doc).map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.createdAt?.toMillis()||0)-(b.createdAt?.toMillis()||0))),fail)}
export function watchSentInvites(id,uid,update,fail){return onSnapshot(query(collection(db,'budgetInvites'),where('budgetId','==',id),where('ownerUid','==',uid),where('status','==','pending')),snap=>update(snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.expiresAt.toMillis()>Date.now())),fail)}
export async function command(id,member,input){
 if(!navigator.onLine)throw new Error('Connect to the internet to change this shared budget.');
 const eventRef=input.operationId?doc(db,'budgets',id,'events',input.operationId):doc(collection(db,'budgets',id,'events'));
 return runTransaction(db,async tx=>{
  const [existing,latest]=await Promise.all([input.operationId?tx.get(eventRef):null,tx.get(rootRef(id))]);if(!latest.exists())throw new Error('Budget unavailable.');
  const data=JSON.parse(latest.data().payload);
  if(existing?.exists())return {data,revision:latest.data().revision};
  if(input.day&&input.day!==tokyoDay())throw new Error('This change was entered on a previous day and was not added to today.');
  let result;try{result=applyCommand(data,input,member,tokyoDay())}catch(error){error.current=targetFor(data,input)||null;throw error}
  if(input.type==='day'&&!result.archive)return {...result,revision:latest.data().revision};
  const payload=JSON.stringify(result.data);if(new TextEncoder().encode(payload).length>900000)throw new Error('This day has too many records to save.');
  tx.update(rootRef(id),{payload,revision:latest.data().revision+1,updatedAt:serverTimestamp()});
  if(result.archive)tx.set(doc(db,'budgets',id,'days',result.archive.day),{payload:JSON.stringify(result.archive.state)});
  if(result.event)tx.set(eventRef,{...result.event,createdAt:serverTimestamp()});return {...result,revision:latest.data().revision+1};
 });
}
export async function historyFor(id){const result=await getDocsFromServer(collection(db,'budgets',id,'days'));return Object.fromEntries(result.docs.map(d=>[d.id,JSON.parse(d.data().payload)]))}
export async function invite(id,user,email){
 email=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid Google email address.');
 const invitation=doc(collection(db,'budgetInvites'));
 await runTransaction(db,async tx=>{
  const current=await tx.get(rootRef(id));if(current.data()?.ownerUid!==user.uid)throw new Error('Only the owner can invite people.');
  const color=Math.round((36+current.data().nextColor*137.508)%360);
  tx.update(rootRef(id),{nextColor:current.data().nextColor+1});
  tx.set(invitation,{budgetId:id,title:current.data().title,ownerUid:user.uid,ownerName:identity(user).name,email,color,status:'pending',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+13*86400000)});
  tx.set(doc(collection(db,'budgets',id,'events')),{day:tokyoDay(),actorUid:user.uid,actorName:identity(user).name,kind:'invite',message:'invited '+email+' as an Editor',createdAt:serverTimestamp()});
 });return invitation.id;
}
export async function acceptInvitation(id,user){
 const result=await getDocFromServer(inviteRef(id));if(!result.exists())throw new Error('Invitation not found.');const invitation=result.data();
 if(invitation.email!==user.email.toLowerCase()||!user.emailVerified)throw new Error('Sign in with the invited Google email address.');
 if(invitation.status!=='pending'||invitation.expiresAt.toMillis()<=Date.now())throw new Error('This invitation is no longer available.');
 const batch=writeBatch(db),actor=identity(user);
 batch.set(memberRef(invitation.budgetId,user.uid),{...actor,color:invitation.color,inviteId:id,joinedAt:serverTimestamp()});
 batch.set(indexRef(user.uid,invitation.budgetId),{title:invitation.title+' · '+invitation.ownerName,ownerUid:invitation.ownerUid});
 batch.update(inviteRef(id),{status:'accepted',acceptedBy:user.uid,acceptedAt:serverTimestamp()});
 batch.set(doc(collection(db,'budgets',invitation.budgetId,'events')),{day:tokyoDay(),actorUid:user.uid,actorName:actor.name,kind:'membership',message:'accepted the invitation',createdAt:serverTimestamp()});
 await batch.commit();return invitation.budgetId;
}
export async function cancelInvitation(id,user){const result=await getDocFromServer(inviteRef(id));if(!result.exists())throw new Error('Invitation unavailable.');const invitation=result.data();const batch=writeBatch(db);batch.update(inviteRef(id),{status:'cancelled'});batch.set(doc(collection(db,'budgets',invitation.budgetId,'events')),{day:tokyoDay(),actorUid:user.uid,actorName:identity(user).name,kind:'invite',message:'cancelled the invitation for '+invitation.email,createdAt:serverTimestamp()});await batch.commit()}
export async function removeMember(id,user,member){const batch=writeBatch(db);batch.delete(memberRef(id,member.uid));batch.delete(indexRef(member.uid,id));batch.set(doc(collection(db,'budgets',id,'events')),{day:tokyoDay(),actorUid:user.uid,actorName:identity(user).name,kind:'membership',message:member.uid===user.uid?'left the shared budget':'removed '+member.name+' from the shared budget',createdAt:serverTimestamp()});await batch.commit()}
export async function readMember(id,uid){const snap=await getDocFromServer(memberRef(id,uid));if(!snap.exists())throw new Error('You do not have access to this budget.');return snap.data()}
