import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore, collection, doc, onSnapshot, runTransaction} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {checkoutChanges} from './domain.js';

const app = initializeApp({apiKey:'AIzaSyBwCsRU41CFzuGIRz-bXVnTz_7uq-SyubI',authDomain:'tokyo-budget.firebaseapp.com',projectId:'tokyo-budget',storageBucket:'tokyo-budget.firebasestorage.app',messagingSenderId:'425671893709',appId:'1:425671893709:web:da3d6f374226f3441b3f84'});
const auth = getAuth(app), db = getFirestore(app);
export const observeAuth = callback => onAuthStateChanged(auth, callback);
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);
const settingsRef = uid => doc(db,'users',uid,'settings','budget');
const dayRef = (uid, day) => doc(db,'users',uid,'days',day);
const entryRef = (uid, id) => doc(db,'users',uid,'entries',id);

export function watch(uid, day, update, fail) {
  const loaded = new Set(); let settings = null, daily = null, items = [];
  const emit = type => {loaded.add(type); update({ready:loaded.size === 3, settings, daily, entries:items});};
  const entries = collection(db,'users',uid,'entries');
  const stops = [
    onSnapshot(settingsRef(uid), snap => {settings=snap.exists()?snap.data():null;emit('settings');},fail),
    onSnapshot(dayRef(uid,day), snap => {daily=snap.exists()?snap.data():null;emit('day');},fail),
    // One snapshot keeps the cart-to-purchase transition consistent in the balance.
    onSnapshot(entries, snap => {items=snap.docs.map(x=>({id:x.id,...x.data()}));emit('entries');},fail)
  ];
  return () => stops.forEach(stop=>stop());
}
export async function ensureDay(uid, day) {
  return runTransaction(db, async tx => {
    const target = dayRef(uid,day), daily = await tx.get(target), setting = await tx.get(settingsRef(uid));
    if (!daily.exists()) tx.set(target,{amount:setting.exists()?setting.data().amount:0});
  });
}
export async function saveBudget(uid,day,amount) {
  return runTransaction(db, async tx => {tx.set(settingsRef(uid),{amount});tx.set(dayRef(uid,day),{amount});});
}
export async function addEntry(uid,day,{name,amount,kind},id) {
  const ref=entryRef(uid,id);
  return runTransaction(db, async tx => {
    if ((await tx.get(ref)).exists()) throw new Error('This item has already been saved.');
    const data={name,amount,kind,selected:kind==='cart',purchaseDate:kind==='purchase'?day:'',purchasedAt:kind==='purchase'?Date.now():0,createdAt:Date.now(),version:1};
    tx.set(ref,data);return [{id,before:null,after:data}];
  });
}
// Every change checks the version read by the UI, preventing stale tabs from overwriting purchases.
export async function changeEntries(uid,items,transform) {
  return runTransaction(db, async tx => {
    const snapshots=await Promise.all(items.map(item=>tx.get(entryRef(uid,item.id))));
    const current=snapshots.map((snap,i)=>{
      if (!snap.exists() || snap.data().version!==items[i].version) throw new Error('This item changed in another tab. Please try again.');
      return {id:snap.id,...snap.data()};
    });
    const next=transform(current);
    const undo=[];
    next.forEach((item,i)=>{const {id,...after}=item;const {id:oldId,...before}=current[i];tx.set(entryRef(uid,id),after);undo.push({id,before,after});});
    return undo;
  });
}
export const selectEntry=(uid,item,selected)=>changeEntries(uid,[item],xs=>xs.map(x=>({...x,selected,version:x.version+1})));
export const removeEntry=(uid,item)=>changeEntries(uid,[item],xs=>xs.map(x=>({...x,kind:'removed',selected:false,version:x.version+1})));
export const checkout=(uid,items,day)=>changeEntries(uid,items,xs=>checkoutChanges(xs,day,Date.now()));
export async function undoChanges(uid,changes) {
  return runTransaction(db, async tx => {
    const snapshots=await Promise.all(changes.map(c=>tx.get(entryRef(uid,c.id))));
    snapshots.forEach((snap,i)=>{if(!snap.exists()||snap.data().version!==changes[i].after.version)throw new Error('This item has changed. Undo is no longer available.');});
    changes.forEach(c=>tx.set(entryRef(uid,c.id),c.before?{...c.before,version:c.after.version+1}:{...c.after,kind:'removed',selected:false,version:c.after.version+1}));
  });
}
