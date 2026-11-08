const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let userKey='guest',scope='personal',dayFn=()=>new Date().toLocaleDateString('en-CA'),day='',records=[],recordIds=new Set(),floating=true,timer,reviewHandler=()=>{};
function key(){return `budget-notifications:${userKey}:${scope}`}
function save(){try{localStorage.setItem(key(),JSON.stringify({day,records}));localStorage.setItem('budget-floating:'+userKey,String(floating))}catch{}}
function checkDay(){const now=dayFn();if(day===now)return;day=now;records=[];recordIds.clear();clearTimeout(timer);$('toast').hidden=true;save();render()}
function render(){checkDay();$('notificationsdate').textContent=day;$('notificationdot').hidden=!records.length;$('notificationslist').innerHTML=records.length?records.slice().reverse().map(r=>`<div class="notification-record"><span>${esc(r.message)}</span>${r.review?`<button class="notification-review" data-review="${esc(r.id)}">Review</button>`:''}</div>`).join(''):'<div class="notification-empty">No notifications today</div>';$('floatingnotify').checked=floating}
function pushMany(events,{float=true}={}){checkDay();let last=null;for(const event of events){const id=String(event.id||crypto.randomUUID());if(recordIds.has(id))continue;recordIds.add(id);last={...event,id};records.push(last)}if(!last)return;save();render();if(float&&floating){clearTimeout(timer);$('toastmessage').textContent=last.message;$('toastreview').hidden=!last.review;$('toastreview').dataset.review=last.id;$('toast').hidden=false;timer=setTimeout(()=>$('toast').hidden=true,4000)}}
function push(event,options){pushMany([event],options)}
$('notificationsbtn').onclick=()=>{render();$('notificationsdialog').showModal()};$('closenotifications').onclick=()=>$('notificationsdialog').close();$('toastclose').onclick=()=>$('toast').hidden=true;
function review(id){$('toast').hidden=true;$('notificationsdialog').close();reviewHandler(records.find(r=>r.id===id))}
$('toastreview').onclick=()=>review($('toastreview').dataset.review);$('notificationslist').onclick=e=>{const b=e.target.closest('[data-review]');if(b)review(b.dataset.review)};
$('floatingnotify').onchange=()=>{floating=$('floatingnotify').checked;if(!floating){clearTimeout(timer);$('toast').hidden=true}save()};
window.BudgetNotifications={
 push,pushMany,checkDay,setReviewHandler(fn){reviewHandler=fn},
 context(uid,nextScope,dateFn){clearTimeout(timer);$('toast').hidden=true;userKey=uid||'guest';scope=nextScope||'personal';dayFn=dateFn;day=dayFn();try{const cached=JSON.parse(localStorage.getItem(key())||'null');records=cached?.day===day?cached.records:[];floating=localStorage.getItem('budget-floating:'+userKey)!=='false'}catch{records=[];floating=true}recordIds=new Set(records.map(r=>r.id));render();if(window.BudgetPendingNotices?.length){const pending=window.BudgetPendingNotices.splice(0);pushMany(pending)}},
 clearReview(id){const record=records.find(r=>r.id===id);if(record){delete record.review;save();render()}},
};
window.addEventListener('focus',checkDay);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkDay()});
