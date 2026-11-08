const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
export function tokyoDay(date=new Date()) {
  const parts=dayFormatter.formatToParts(date);
  return ['year','month','day'].map(k=>parts.find(x=>x.type===k).value).join('-');
}
export function conflict(message,code='budget/conflict'){const e=new Error(message);e.code=code;return e}
export function blankShared(budget=1000,day=tokyoDay()) {
  return {currentDate:day,defaultBudget:budget,budgetName:'Shared budget',state:{budget,cart:[],purchases:[],nextId:1,nextItem:1,nextPurchase:1}};
}
export function versionOf(record){return record?.version||1}
export function targetFor(data,command){
  const s=data.state;
  if(command.target==='cart')return s.cart.find(x=>x.id===command.id);
  const purchase=s.purchases.find(x=>x.id===command.id);
  return command.target==='purchaseItem'?purchase?.items[command.index]:purchase;
}
export function applyCommand(input,command,actor,day=tokyoDay()) {
  const data=structuredClone(input),s=data.state;let archive=null,message='',kind=command.type;
  if(day<data.currentDate)throw conflict('This device’s date is earlier than the shared budget date. Check your clock.','budget/date');
  if(data.currentDate!==day){archive={day:data.currentDate,state:structuredClone(s)};s.budget=data.defaultBudget;s.cart=s.cart.map(x=>({...x,selected:false,version:versionOf(x)+1}));s.purchases=[];s.nextPurchase=1;data.currentDate=day}
  const author={uid:actor.uid,name:actor.name,color:actor.color};
  function currentCart(id){const record=s.cart.find(x=>x.id===id);if(!record)throw conflict('This item is no longer in the cart.');return record}
  function check(record,expected){if(!record||versionOf(record)!==expected)throw conflict('This record changed before your update was saved.');return record}
  switch(command.type){
    case 'day':break;
    case 'add':{
      if(!Number.isSafeInteger(command.yen)||command.yen<=0||command.yen>=1e9)throw new Error('Enter a positive whole-yen amount.');
      const itemId=command.itemId||s.nextId;
      if(!Number.isSafeInteger(itemId)||itemId<=0||s.cart.some(x=>x.id===itemId)||s.purchases.some(p=>p.id===itemId||p.items.some(x=>x.id===itemId)))throw new Error('This item ID is already in use.');
      const item={id:itemId,name:'Item '+s.nextItem++,yen:command.yen,selected:true,author,version:1};
      s.nextId++;
      if(command.destination==='spent'){s.purchases.push({id:command.purchaseId||s.nextId,name:'Purchase '+s.nextPurchase++,items:[item],author,version:1});s.nextId++;message='recorded '+item.name+' · ¥'+command.yen.toLocaleString('ja-JP')}
      else{s.cart.push(item);message='added '+item.name+' · ¥'+command.yen.toLocaleString('ja-JP')}
      break;
    }
    case 'select':{const item=check(currentCart(command.id),command.expectedVersion);item.selected=!!command.selected;item.version++;message=(item.selected?'selected ':'deselected ')+item.name;break}
    case 'remove':{const item=check(currentCart(command.id),command.expectedVersion);s.cart=s.cart.filter(x=>x.id!==item.id);message='removed '+item.name;break}
    case 'checkout':{
      if(!command.items?.length)throw new Error('Select items before checkout.');
      const chosen=command.items.map(x=>check(currentCart(x.id),x.version));
      if(chosen.some(x=>!x.selected))throw conflict('The selected items changed. Review the cart before checkout.','budget/checkout-stale');
      const ids=new Set(chosen.map(x=>x.id));if(ids.size!==chosen.length)throw new Error('Duplicate checkout item.');
      const purchaseId=command.purchaseId||s.nextId++;
      if(!Number.isSafeInteger(purchaseId)||purchaseId<=0||s.purchases.some(p=>p.id===purchaseId)||s.cart.some(x=>x.id===purchaseId))throw new Error('This purchase ID is already in use.');
      const purchase={id:purchaseId,name:'Purchase '+s.nextPurchase++,items:chosen.map(x=>({...x,selected:false})),author,version:1};
      s.purchases.push(purchase);s.cart=s.cart.filter(x=>!ids.has(x.id));message='checked out '+chosen.length+' '+(chosen.length===1?'item':'items')+' · ¥'+chosen.reduce((n,x)=>n+x.yen,0).toLocaleString('ja-JP');break;
    }
    case 'rename':{
      const container=command.target==='cart'?s.cart.find(x=>x.id===command.id):s.purchases.find(x=>x.id===command.id);
      check(container,command.expectedVersion);const target=targetFor(data,command);if(!target)throw conflict('This item no longer exists.');
      const name=String(command.name||'').trim();if(!name||name.length>80)throw new Error('Use a name of 1–80 characters.');
      const before=target.name;target.name=name;target.lastEditedBy=author;container.lastEditedBy=author;container.version=versionOf(container)+1;message='renamed '+before+' to '+name;break;
    }
    case 'deletePurchase':{const purchase=check(s.purchases.find(x=>x.id===command.id),command.expectedVersion);s.purchases=s.purchases.filter(x=>x.id!==purchase.id);message='deleted '+purchase.name;break}
    case 'budget':{if(!Number.isSafeInteger(command.yen)||command.yen<0||command.yen>=1e8)throw new Error('Enter a daily budget in whole yen.');if(command.expectedBudget!==s.budget)throw conflict('The daily budget changed. Review the new amount before saving.');const name=command.name?.trim();if(command.name!==undefined&&(!name||name.length>60))throw new Error('Use a budget name of 1–60 characters.');if(name&&command.expectedName!==(data.budgetName||'Shared budget'))throw conflict('The budget name changed. Review the latest name before saving.');const renamed=name&&name!==(data.budgetName||'Shared budget');s.budget=command.yen;data.defaultBudget=command.yen;if(name)data.budgetName=name;message=(renamed?'renamed the budget to '+name+' and ':'')+'changed the daily budget to ¥'+command.yen.toLocaleString('ja-JP');break}
    default:throw new Error('Unknown shared-budget action.');
  }
  return {data,archive,event:message?{kind,message,day,actorUid:actor.uid,actorName:actor.name}:null};
}
