import {preferredScope} from './preferences.js';
import {SyncSession} from './sync.js';
const $=id=>document.getElementById(id),app=window.BudgetApp;
let lastNotice='',services,session=null,generation=0,currentUser=null;
const accountListeners=new Set();let accountPhase='loading',accountPreferred='personal';
function emitAccount(phase){accountPhase=phase;accountListeners.forEach(fn=>fn({user:currentUser,phase,preferred:accountPreferred}))}
export function observeAccount(fn){accountListeners.add(fn);fn({user:currentUser,phase:accountPhase,preferred:accountPreferred});return()=>accountListeners.delete(fn)}
export function getAccount(){return currentUser}
export function suspendPrivate(){generation++;session?.close();session=null;app.connect(null)}
export async function returnToPrivate(){return connect(currentUser,true)}
export async function privateHistory(){if(!currentUser)return app.snapshot().history;const cached=JSON.parse(localStorage.getItem(cacheKey(currentUser.uid))||'null');try{return (await services.remoteFor(currentUser.uid).read()).snapshot?.history||cached?.history||{}}catch{return cached?.history||{}}}
const cacheKey=uid=>`daily-budget-v1:${uid}`;
function status(kind,error){
  const messages={saved:'Saved to Firebase',pending:'Changes saved on this browser · Waiting to sync',saving:'Saving to Firebase…',conflict:'Another device has newer data. This device’s changes are kept locally; cloud data has not been overwritten.',error:'Cloud sync unavailable. Changes are saved on this browser. Retry when connected.','storage-error':'Browser storage is unavailable. Keep this page open until cloud sync completes.'};
  $('cloudstatus').textContent=messages[kind]||kind;
  $('cloudstatus').classList.toggle('error',['conflict','error','storage-error'].includes(kind));
  $('cloudretry').hidden=!['error','conflict'].includes(kind);
  $('cloudretry').disabled=kind==='conflict';
  if(error?.code==='permission-denied')$('cloudstatus').textContent='Firebase has not granted this app access. Publish the repository’s firestore.rules for tokyo-budget.';
  if(['conflict','error','storage-error'].includes(kind)){const message=$('cloudstatus').textContent;if(message!==lastNotice)window.BudgetNotifications?.push({message});lastNotice=message}else lastNotice='';
}
async function connect(user,personal=false){
  app.restoring();
  accountPreferred=personal?'personal':preferredScope(localStorage,user?.uid);
  const token=++generation;session?.close();session=null;app.connect(null);app.setSharedAdapter(null);currentUser=user;emitAccount('loading');
  $('googlelogin').hidden=!!user;$('googlelogout').hidden=!user;
  $('accountname').textContent=user?(user.email||user.displayName||'Google account'):'Not signed in';
  $('cloudretry').hidden=true;
  if(!user){app.switchAccount('daily-budget-v1');status('Saved on this browser');emitAccount('ready');app.ready();return}
  if(!personal&&preferredScope(localStorage,user.uid)!=='personal'){status('Opening default budget…');emitAccount('ready');return}
  const guest=app.key()==='daily-budget-v1'?app.snapshot():null,key=cacheKey(user.uid);
  let cache=null;try{cache=JSON.parse(localStorage.getItem(key)||'null')}catch{}
  // Never expose the previously signed-in account to a different account.
  const fallback=app.switchAccount(key,cache);
  status('Connecting to Firebase…');
  const candidate=new SyncSession({storage:localStorage,uid:user.uid,remote:services.remoteFor(user.uid),onStatus:(...args)=>{if(token===generation)status(...args)},onRemote:data=>{if(token!==generation)return;const updated=app.switchAccount(key,data);app.connect(snapshot=>candidate.queue(snapshot));if(JSON.stringify(updated)!==JSON.stringify(data))candidate.queue(updated)}});
  session=candidate;
  try{
    const cloud=await candidate.start(cache||guest||fallback);
    if(token!==generation||!cloud)return;
    const updated=app.switchAccount(key,cloud);
    app.connect(snapshot=>candidate.queue(snapshot));
    // Includes new-account import and any midnight rollover performed on load.
    candidate.queue(updated);emitAccount('ready');app.ready();
  }catch(error){
    if(token!==generation)return;
    status('error',error);
    // Preserve offline edits without guessing the server revision. Unknown revisions
    // must never overwrite an existing cloud profile on reconnect.
    const known=localStorage.getItem(`daily-budget-cloud-revision:${user.uid}`);
    candidate.revision=known===null?null:Number(known);
    app.connect(snapshot=>candidate.queue(snapshot));emitAccount('ready');app.ready();
  }
}
$('googlelogin').onclick=async()=>{
  $('googlelogin').disabled=true;
  try{if(!services)throw new Error('Sign-in is still loading. Please retry.');await services.login()}
  catch(error){$('cloudstatus').textContent=error.code==='auth/popup-closed-by-user'?'Sign-in cancelled. Your browser data is unchanged.':error.code==='auth/unauthorized-domain'?'Authorize designmilktea.github.io in Firebase Authentication settings.':error.code==='auth/operation-not-allowed'?'Enable Google sign-in in Firebase Authentication.':error.message||'Google sign-in failed. Please try again.';$('cloudstatus').classList.add('error')}
  finally{$('googlelogin').disabled=false}
};
$('googlelogout').onclick=async()=>{try{await services.logout()}catch{status('error')}};
$('cloudretry').onclick=()=>{if(session?.hydrated&&session.pending)session.flush();else connect(currentUser)};
window.addEventListener('online',()=>{if(session?.hydrated&&session.pending)session.flush();else if(currentUser&&session&&!session.hydrated)connect(currentUser,true);else session?.refresh()});
window.addEventListener('focus',()=>session?.refresh());
window.addEventListener('pagehide',()=>session?.flush());
try{services=await import('./firebase.js');services.observeAuth(connect)}catch{status('Google sign-in is unavailable. Data remains saved on this browser.');app.ready()}
