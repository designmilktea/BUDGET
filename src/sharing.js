import {observeAccount,getAccount,suspendPrivate,returnToPrivate,privateHistory} from './account.js';
import * as store from './shared-store.js';
import {tokyoDay,targetFor,versionOf} from './shared-domain.js';
const $=id=>document.getElementById(id),app=window.BudgetApp,notices=window.BudgetNotifications,esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null,scope='personal',scopes=[],invitations=[],members=[],sent=[],latest=null,me=null,stops=[],accountStops=[],eventStop=null,generation=0,eventsDay='',checking=false,midnightTimer,confirmation=null,conflicts=[],reviewed=null,lastInvite='',inviteEmail='',operationBusy=false,sentWatching=false;
const personalDay=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const selectedKey=()=>`daily-budget-scope:${user?.uid||'guest'}`,cacheKey=id=>`daily-budget-v1:${user.uid}:shared:${id}`,conflictKey=()=>`daily-budget-conflicts:${user?.uid}:${scope}`;
function notice(message,options={}){notices?.push({message,...options})}
function fail(error){const message=error?.code==='permission-denied'?'Shared budget access is unavailable. Check membership and the published Firebase rules.':error.message||'This change could not be saved.';notice('You could not save this change. '+message);$('shareerror').textContent=message}
function closeGroup(){generation++;stops.forEach(stop=>stop());stops=[];eventStop?.();eventStop=null;clearTimeout(midnightTimer);latest=null;me=null;members=[];sent=[];eventsDay='';checking=false;sentWatching=false;app.setSharedAdapter(null);$('unsavedreview').hidden=true}
function setContext(){notices?.context(user?.uid,scope,scope==='personal'?personalDay:tokyoDay);notices?.setReviewHandler(event=>{const conflict=conflicts.find(x=>x.id===event?.id);if(conflict)showConflict(conflict)})}
function showError(text){$('shareerror').textContent=text}
function updateScopes(){const options='<option value="personal">Personal budget · Private</option>'+scopes.map(b=>`<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('');$('budgetscope').innerHTML=options;$('budgetscope').value=scope;$('historybudget').innerHTML=options;$('historybudget').value=scope}
function persistConflicts(){try{localStorage.setItem(conflictKey(),JSON.stringify(conflicts))}catch{}$('unsavedreview').hidden=!conflicts.length}
function recordConflict(error,command){if(command.type!=='rename'){notice('You could not save this change. '+(command.type==='checkout'?'The items changed or were already checked out. No duplicate purchase was saved.':error.message));return}const current=error.current||targetFor(latest.data,command);const editor=current?.lastEditedBy?.name||'another member';const conflict={id:crypto.randomUUID(),command,day:tokyoDay(),savedName:current?.name};conflicts.push(conflict);persistConflicts();notice('You could not save this rename because '+editor+' changed the record. Your draft is kept.',{id:conflict.id,review:true})}
function showConflict(conflict){reviewed=conflict;const current=latest?targetFor(latest.data,conflict.command):null;$('conflictcurrent').textContent=current?.name||conflict.savedName||'This record no longer exists.';$('conflictdraft').textContent=conflict.command.name;$('conflictedit').disabled=!current;$('conflictdialog').showModal()}
function clearConflict(){if(!reviewed)return;conflicts=conflicts.filter(x=>x.id!==reviewed.id);notices?.clearReview(reviewed.id);persistConflicts();$('conflictdialog').close()}
$('conflictlatest').onclick=clearConflict;$('closeconflict').onclick=()=>$('conflictdialog').close();$('conflictedit').onclick=()=>{const command=reviewed?.command;if(!command)return;clearConflict();if(!app.editShared(command))notice('You could not reopen this record. It may have been removed.')};$('unsavedreview').onclick=()=>{if(conflicts[0])showConflict(conflicts[0])};
function bindEvents(id){const day=tokyoDay();if(eventsDay===day)return;eventsDay=day;eventStop?.();setContext();conflicts=conflicts.filter(x=>x.day===day);persistConflicts();let initial=true;eventStop=store.watchEvents(id,day,events=>{for(const event of events){notices?.push({...event,message:(event.actorUid===user?.uid?'You':event.actorName)+' '+event.message},{float:!initial})}initial=false},error=>{if(scope===id)fail(error)})}
function scheduleDay(){clearTimeout(midnightTimer);const now=Date.now(),next=Date.parse(tokyoDay()+'T00:00:00+09:00')+86400000;midnightTimer=setTimeout(()=>{checkDay();scheduleDay()},Math.max(1,next-now+100))}
async function checkDay(){notices?.checkDay();if(scope==='personal'||!latest||checking)return;bindEvents(scope);if(latest.data.currentDate===tokyoDay())return;checking=true;try{await store.command(scope,me,{type:'day'})}catch(error){fail(error)}finally{checking=false}}
async function accessEnded(){const id=scope;if(id==='personal')return;closeGroup();try{localStorage.removeItem(cacheKey(id))}catch{}scope='personal';localStorage.setItem(selectedKey(),'personal');setContext();await returnToPrivate();notice('Your access to the shared budget ended. Your personal budget is unchanged.');updateScopes()}
async function openBudget(id){
 if(!user)throw new Error('Sign in with Google to share a budget.');
 if(id==='personal'){closeGroup();scope='personal';localStorage.setItem(selectedKey(),scope);setContext();await returnToPrivate();return}
 const expectedUser=user.uid;closeGroup();const token=generation;scope=id;suspendPrivate();app.connect(null);updateScopes();setContext();
 try{
  const member=await store.readMember(id,user.uid);if(token!==generation||user?.uid!==expectedUser)return;me=member;
  app.setSharedAdapter({day:tokyoDay,checkDay,perform:async command=>{if(!latest||!me)throw new Error('The shared budget is still loading.');await store.command(id,me,command)},fail:(error,command)=>{if(error.code==='budget/conflict'||error.code==='budget/checkout-stale')recordConflict(error,command);else fail(error)}});
  app.switchAccount(cacheKey(id));
  try{conflicts=JSON.parse(localStorage.getItem(conflictKey())||'[]').filter(x=>x.day===tokyoDay())}catch{conflicts=[]}persistConflicts();
  stops.push(store.watchMember(id,user.uid,member=>{if(token!==generation)return;if(!member)accessEnded();else me=member},()=>{if(token===generation)accessEnded()}));
  stops.push(store.watchBudget(id,budget=>{if(token!==generation)return;latest=budget;if(budget.ownerUid===user.uid&&!sentWatching){sentWatching=true;stops.push(store.watchSentInvites(id,user.uid,list=>{sent=list;if($('sharedialog').open)renderSharing()},fail))}app.applyShared(budget.data);bindEvents(id);checkDay();if($('sharedialog').open&&document.activeElement?.id!=='inviteemail')renderSharing()},error=>{if(token===generation){if(error.code==='permission-denied')accessEnded();else fail(error)}}));
  stops.push(store.watchMembers(id,list=>{if(token!==generation)return;members=list;if($('sharedialog').open)renderSharing()},error=>{if(token===generation)fail(error)}));
  localStorage.setItem(selectedKey(),id);scheduleDay();
 }catch(error){if(token!==generation)return;closeGroup();scope='personal';localStorage.setItem(selectedKey(),'personal');setContext();await returnToPrivate();throw error}
}
function memberMarkup(member,owner){const active=members.some(x=>x.uid===member.uid);return `<div class="member-row"><span class="member-dot" style="--member-hue:${Number(member.color)||0}" aria-hidden="true"></span><span class="member-copy">${esc(member.name)}${member.uid===user?.uid?' (you)':''}<small>${esc(member.email||'')}</small></span><span class="member-role">${active?(member.uid===latest?.ownerUid?'Owner':'Editor'):'Past contributor'}</span>${owner&&active&&member.uid!==user?.uid?`<button class="member-action" data-remove-member="${esc(member.uid)}">Remove</button>`:''}</div>`}
function renderSharing(){
 updateScopes();$('shareerror').textContent='';if(!user){$('sharecontent').innerHTML='<p class="share-note">Sign in with Google in Settings to create or join a shared budget. Your personal browser data stays private.</p>';return}
 let html='';
 if(scope==='personal'){
  html='<p class="share-note">Only you can access your personal budget.</p><button class="share-row-button" data-create-shared>Create shared budget</button><p class="share-note">Starts with your current daily limit and no purchases. Your personal records stay private.</p>';
 }else{
  const owner=(latest?.ownerUid||scopes.find(x=>x.id===scope)?.ownerUid)===user.uid;
  html='<p class="share-note">Only invited Google accounts can access this budget. Shared days use Asia/Tokyo.</p><div class="fieldlabel">Members · Item colors</div>'+members.map(member=>memberMarkup(member,owner)).join('');
  const past=new Map();for(const item of [...(latest?.data.state.cart||[]),...(latest?.data.state.purchases||[]).flatMap(p=>p.items)])if(item.author&&!members.some(m=>m.uid===item.author.uid))past.set(item.author.uid,item.author);
  if(past.size)html+=[...past.values()].map(member=>memberMarkup(member,false)).join('');
  if(owner){
   if(sent.length)html+='<div class="fieldlabel">Pending invitations</div>'+sent.map(invitation=>`<div class="member-row"><span class="member-copy">${esc(invitation.email)}<small>Editor · Waiting for acceptance</small></span><button class="member-action" data-copy-invite="${esc(invitation.id)}">Copy link</button><button class="member-action" data-cancel-invite="${esc(invitation.id)}">Cancel</button></div>`).join('');
   html+=`<label class="fieldlabel" for="inviteemail">Invite by Google email</label><div class="invite-form"><input type="email" id="inviteemail" value="${esc(inviteEmail)}" placeholder="name@example.com" autocomplete="off"><button data-invite-review>Invite</button></div><p class="share-note">Editors can change the budget, cart and purchases, and view previous days. Only you manage members.</p><p class="share-note">Invitations appear in the app after Google sign-in. Copy the invitation link to share it directly; no email is sent automatically.</p>`;
  }else html+='<p class="share-note">You are an Editor. The owner manages invitations and member access.</p><button class="share-row-button danger-share" data-leave-shared>Leave shared budget</button>';
 }
 if(invitations.length)html+='<div class="fieldlabel">Invitations for you</div>'+invitations.map(invitation=>`<div class="member-row"><span class="member-copy">${esc(invitation.title)}<small>From ${esc(invitation.ownerName)} · Editor</small></span><button class="member-action" data-accept-invite="${esc(invitation.id)}">Accept</button></div>`).join('');
 if(lastInvite)html+=`<label class="fieldlabel" for="lastinvitelink">Invitation ready</label><input class="invite-link" id="lastinvitelink" readonly value="${esc(invitationURL(lastInvite))}"><button class="share-row-button" data-copy-invite="${esc(lastInvite)}">Copy invitation link</button>`;
 $('sharecontent').innerHTML=html;
}
function invitationURL(id){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('invite',id);return url.href}
function confirm(title,text,action){confirmation=action;$('shareconfirmtitle').textContent=title;$('shareconfirmtext').textContent=text;$('shareconfirmdialog').showModal()}
$('shareconfirmcancel').onclick=()=>$('shareconfirmdialog').close();$('shareconfirmok').onclick=async()=>{if(operationBusy)return;operationBusy=true;$('shareconfirmok').disabled=true;try{await confirmation?.();$('shareconfirmdialog').close();if(scope!=='personal')$('sharedialog').showModal();renderSharing()}catch(error){$('shareconfirmdialog').close();fail(error)}finally{operationBusy=false;$('shareconfirmok').disabled=false}};
$('sharebudgetbtn').onclick=()=>{$('settingsdialog').close();renderSharing();$('sharedialog').showModal()};$('sharedindicator').onclick=()=>{renderSharing();$('sharedialog').showModal()};$('closeshare').onclick=()=>$('sharedialog').close();
$('budgetscope').onchange=async()=>{try{await openBudget($('budgetscope').value);renderSharing();$('sharedialog').showModal()}catch(error){fail(error)}};
$('sharecontent').addEventListener('input',e=>{if(e.target.id==='inviteemail')inviteEmail=e.target.value});
$('sharecontent').onclick=async e=>{
 const b=e.target.closest('button');if(!b)return;
 try{
 if(b.hasAttribute('data-create-shared'))confirm('Create shared budget?','This creates a separate budget with your current daily limit. Your personal purchases and previous days remain private.',async()=>{const id=await store.createBudget(user,app.snapshot().defaultBudget);await openBudget(id)});
 if(b.hasAttribute('data-invite-review')){const email=$('inviteemail').value.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid Google email address.');if(members.some(m=>m.email===email)||sent.some(i=>i.email===email))throw new Error('This email already has access or a pending invitation.');confirm('Invite as Editor?',email+' can change this shared budget and view all its previous days after accepting with the invited Google account.',async()=>{lastInvite=await store.invite(scope,user,email);inviteEmail=''})}
 if(b.dataset.copyInvite){await navigator.clipboard.writeText(invitationURL(b.dataset.copyInvite));notice('You copied an invitation link.');}
 if(b.dataset.cancelInvite)confirm('Cancel invitation?','This invitation will no longer grant access.',()=>store.cancelInvitation(b.dataset.cancelInvite,user));
 if(b.dataset.acceptInvite){const invitation=invitations.find(i=>i.id===b.dataset.acceptInvite);confirm('Join shared budget?',`Accept ${invitation?.ownerName||'the owner'}’s invitation as an Editor? You will be able to change this budget and view its previous days.`,async()=>{const id=await store.acceptInvitation(b.dataset.acceptInvite,user);await openBudget(id);window.history.replaceState(null,'',location.pathname+location.hash)})}
 if(b.dataset.removeMember){const member=members.find(m=>m.uid===b.dataset.removeMember);confirm('Remove access?',`Remove ${member?.name} from this budget? They will lose access to the budget and previous days. Existing items and purchases will stay.`,()=>store.removeMember(scope,user,member))}
 if(b.hasAttribute('data-leave-shared'))confirm('Leave shared budget?','You will lose access to this budget and its previous days. Your existing items and purchases will remain.',()=>store.removeMember(scope,user,me));
 }catch(error){fail(error)}
};
async function showHistoryFor(id){const token=generation,requestedUid=user?.uid;$('historycontent').textContent='Loading previous days…';try{const records=id==='personal'?await privateHistory():await store.historyFor(id);if(token!==generation||user?.uid!==requestedUid||$('historybudget').value!==id)return;app.showHistoryData(records);$('historyaccess').textContent=id==='personal'?'🔒 Only you':'Shared budget · Asia/Tokyo'}catch(error){$('historycontent').textContent=error.message||'Previous days could not be loaded.'}}
$('previousdays').onclick=()=>{$('settingsdialog').close();updateScopes();$('historydialog').showModal();showHistoryFor(scope)};$('historybudget').onchange=()=>showHistoryFor($('historybudget').value);
observeAccount(async({user:nextUser,phase})=>{
 if(phase==='loading'){closeGroup();accountStops.forEach(stop=>stop());accountStops=[];scope='personal';user=nextUser;scopes=[];invitations=[];lastInvite='';inviteEmail='';setContext();updateScopes();return}
 user=nextUser;setContext();if(!user)return;
 let restored=false;const uid=user.uid;
 accountStops.push(store.watchScopes(user,(list,metadata)=>{if(user?.uid!==uid)return;scopes=list;updateScopes();const selected=localStorage.getItem(selectedKey());if(!restored&&(!metadata.fromCache||list.some(b=>b.id===selected))){restored=true;if(selected&&selected!=='personal'&&list.some(b=>b.id===selected))openBudget(selected).catch(fail)}if($('sharedialog').open)renderSharing()},fail));
 accountStops.push(store.watchInvitations(user,list=>{if(user?.uid!==uid)return;invitations=list;if($('sharedialog').open)renderSharing();const requested=new URLSearchParams(location.search).get('invite');if(requested&&list.some(i=>i.id===requested)){renderSharing();$('sharedialog').showModal()}},fail));
});
setContext();window.addEventListener('focus',checkDay);window.addEventListener('online',checkDay);
