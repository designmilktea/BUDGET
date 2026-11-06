import {parseAmount,money,dayKey,totals} from './domain.js';
const $=id=>document.getElementById(id);
let store,user=null,stopWatching=()=>{},entries=[],budget=0,ready=false,busy=false,mode='cart',undo=null;
let today=dayKey(), generation=0, initDay=false;
const trash='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg>';
function status(text='',error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function showError(error){
  const messages={'permission-denied':'Your budget could not be opened. Database access needs to be enabled for this app.','auth/popup-closed-by-user':'Sign-in was closed. You can try again.','auth/popup-blocked':'Allow pop-ups for this site, then try Google sign-in again.','auth/unauthorized-domain':'Google sign-in is not enabled for this website yet.','unavailable':'Could not reach your budget. Check your connection and try again.'};
  status(messages[error.code]||error.message||'Something went wrong. Please try again.',true);
}
function notify(text,changes){undo=changes||null;$('toast-text').textContent=text;$('undo').hidden=!undo;$('toast').hidden=false;}
function resetToast(){undo=null;$('toast').hidden=true;}
function render(){
  const active=!!user&&ready;const sum=totals(budget,entries,today);
  $('projected').textContent=active?money(sum.projected):'—';$('projected').classList.toggle('negative',active&&sum.projected<0);
  $('actual').textContent=active?money(sum.actual):'—';$('selected-total').textContent=active?'−'+money(sum.selected):'—';$('budget-value').textContent=active?money(budget):'—';
  $('spent-total').textContent=active?money(sum.spent):'—';
  const cart=entries.filter(x=>x.kind==='cart').sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
  const purchases=entries.filter(x=>x.kind==='purchase'&&x.purchaseDate===today).sort((a,b)=>b.purchasedAt-a.purchasedAt);
  $('cart-count').textContent=cart.length;$('purchase-count').textContent=purchases.length;
  $('selection-count').textContent=`${cart.filter(x=>x.selected).length} selected`;
  $('checkout-total').textContent=money(sum.selected)+' ↗';
  ['budget-button','item-name','item-amount','add-button','cart-tab','purchase-tab'].forEach(id=>$(id).disabled=!active||busy);
  $('checkout').disabled=!active||busy||!cart.some(x=>x.selected);
  $('sign-in-panel').hidden=!!user;$('account').hidden=!user;$('account-name').textContent=user?.email||'';$('sign-out').disabled=busy;
  $('cart').replaceChildren(...cart.map((item,i)=>itemRow(item,i,false)));
  $('purchases').replaceChildren(...purchases.map((item,i)=>itemRow(item,i,true)));
  if(!cart.length) empty($('cart'),active?'Your consideration cart is empty.':'Your consideration cart will appear here.');
  if(!purchases.length) empty($('purchases'),'No purchases recorded today.');
}
function empty(container,text){const p=document.createElement('p');p.className='empty';p.textContent=text;container.append(p);}
function itemRow(item,index,purchased){
  const row=document.createElement('div');row.className='item'+(!purchased&&!item.selected?' unselected':'');
  const label=item.name||`Item ${index+1}`;
  if(!purchased){const check=document.createElement('input');check.type='checkbox';check.checked=item.selected;check.disabled=busy||!ready;check.setAttribute('aria-label',`Select ${label}, ${money(item.amount)}`);check.addEventListener('change',()=>act(()=>store.selectEntry(user.uid,item,check.checked)));row.append(check);}
  const name=document.createElement('div');name.className='item-name';name.textContent=label;
  if(purchased){const time=document.createElement('time');time.dateTime=new Date(item.purchasedAt).toISOString();time.textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(item.purchasedAt);name.append(time);}
  const amount=document.createElement('span');amount.className='item-price';amount.textContent=money(item.amount);
  const remove=document.createElement('button');remove.className='icon-button';remove.setAttribute('aria-label',`Remove ${label}`);remove.innerHTML=trash;remove.disabled=busy||!ready;
  remove.addEventListener('click',()=>act(async()=>{const changes=await store.removeEntry(user.uid,item);notify(purchased?'Purchase removed':'Item removed',changes);}));
  row.append(name,amount,remove);return row;
}
async function act(action){if(!user||!ready||busy)return;busy=true;const token=generation;status();render();try{await action();}catch(error){if(token===generation)showError(error);}finally{if(token===generation){busy=false;render();}}}
function setMode(next){mode=next;$('cart-tab').setAttribute('aria-selected',next==='cart');$('purchase-tab').setAttribute('aria-selected',next==='purchase');$('entry-form').setAttribute('aria-labelledby',next==='cart'?'cart-tab':'purchase-tab');$('add-button').setAttribute('aria-label',next==='cart'?'Add to cart':'Record purchase');}
$('cart-tab').addEventListener('click',()=>setMode('cart'));
$('purchase-tab').addEventListener('click',()=>setMode('purchase'));
// Accessible keyboard navigation for the two entry tabs.
for(const id of ['cart-tab','purchase-tab'])$(id).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setMode(event.key==='Home'?'cart':event.key==='End'?'purchase':mode==='cart'?'purchase':'cart');$(mode==='cart'?'cart-tab':'purchase-tab').focus();}});
$('entry-form').addEventListener('submit',event=>{event.preventDefault();let amount;try{amount=parseAmount($('item-amount').value);}catch(error){showError(error);$('item-amount').focus();return;}
  const name=$('item-name').value.trim(),kind=mode,id=crypto.randomUUID();
  act(async()=>{const changes=await store.addEntry(user.uid,today,{name,amount,kind},id);$('item-name').value='';$('item-amount').value='';notify(kind==='cart'?'Added to cart':'Purchase recorded',changes);}).then(()=>{if(user&&ready)$('item-amount').focus();});
});
$('checkout').addEventListener('click',()=>{const chosen=entries.filter(x=>x.kind==='cart'&&x.selected);act(async()=>{const changes=await store.checkout(user.uid,chosen,today);notify(`${chosen.length} ${chosen.length===1?'purchase':'purchases'} recorded`,changes);});});
$('budget-button').addEventListener('click',()=>{$('budget-input').value=(budget/100).toFixed(2);$('budget-dialog').showModal();$('budget-input').select();});
$('close-budget').addEventListener('click',()=>$('budget-dialog').close());
$('budget-form').addEventListener('submit',event=>{event.preventDefault();let amount;try{amount=parseAmount($('budget-input').value,true);$('budget-input').setCustomValidity('');}catch(error){$('budget-input').setCustomValidity(error.message);$('budget-input').reportValidity();return;}
  $('budget-dialog').close();act(async()=>{await store.saveBudget(user.uid,today,amount);notify('Daily budget saved');});
});
$('budget-input').addEventListener('input',()=>$('budget-input').setCustomValidity(''));
$('undo').addEventListener('click',()=>{const changes=undo;if(changes)act(async()=>{await store.undoChanges(user.uid,changes);resetToast();});});
$('dismiss-toast').addEventListener('click',resetToast);
$('sign-in').addEventListener('click',async()=>{if(!store)return;$('sign-in').disabled=true;status('Opening Google sign-in…');try{await store.login();}catch(error){showError(error);}finally{$('sign-in').disabled=false;}});
$('sign-out').addEventListener('click',async()=>{if(!busy)try{await store.logout();}catch(error){showError(error);}});
function subscribe(){
  stopWatching();const token=++generation;ready=false;busy=false;entries=[];budget=0;initDay=false;resetToast();render();
  if(!user){status();return;}status('Loading your budget…');const uid=user.uid;
  stopWatching=store.watch(uid,today,state=>{
    if(token!==generation)return;
    ready=state.ready;entries=state.entries;budget=state.daily?.amount??state.settings?.amount??0;
    if(ready){status();if(!state.daily&&!initDay){initDay=true;store.ensureDay(uid,today).catch(error=>{if(token===generation){ready=false;showError(error);render();}});}}
    render();
  },error=>{if(token===generation){ready=false;showError(error);render();}});
}
function checkDay(){const day=dayKey();if(day!==today){today=day;subscribe();}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDay();});setInterval(checkDay,15000);
window.addEventListener('offline',()=>status('You are offline. Reconnect before saving a change.',true));
window.addEventListener('online',()=>{if(user)subscribe();});
render();
try{store=await import('./store.js');store.observeAuth(next=>{user=next;subscribe();});}catch(error){status('Could not connect. Check your internet connection and reload.',true);$('sign-in').disabled=true;}
