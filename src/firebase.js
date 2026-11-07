import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore, doc, collection, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
// Firebase web configuration is public. Firestore rules enforce user isolation.
const app=initializeApp({apiKey:'AIzaSyBwCsRU41CFzuGIRz-bXVnTz_7uq-SyubI',authDomain:'tokyo-budget.firebaseapp.com',projectId:'tokyo-budget',storageBucket:'tokyo-budget.firebasestorage.app',messagingSenderId:'425671893709',appId:'1:425671893709:web:da3d6f374226f3441b3f84'});
const auth=getAuth(app),db=getFirestore(app);
const persistence=setPersistence(auth,browserLocalPersistence);
export const observeAuth=callback=>onAuthStateChanged(auth,callback);
export const login=async()=>{await persistence;const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});return signInWithPopup(auth,provider)};
export const logout=()=>signOut(auth);
export function remoteFor(uid) {
  const profile=doc(db,'users',uid,'budgetApps','daily');
  const days=collection(db,'users',uid,'budgetHistory');
  let savedHistory=new Map();
  return {
    async read(){
      const current=await getDocFromServer(profile);
      if(!current.exists()){savedHistory=new Map();return {revision:0,snapshot:null}}
      const historical=await getDocsFromServer(days),history={};
      savedHistory=new Map();
      historical.forEach(d=>{history[d.id]=JSON.parse(d.data().payload);savedHistory.set(d.id,d.data().payload)});
      const data=current.data();
      return {revision:data.revision,snapshot:{...JSON.parse(data.payload),history}};
    },
    async commit(expected,snapshot){
      const {history,...current}=snapshot,payload=JSON.stringify(current);
      if(new TextEncoder().encode(payload).length>900000)throw new Error('Today’s data is too large to sync. Your browser copy is retained.');
      const changed=Object.entries(history).map(([day,state])=>[day,JSON.stringify(state)]).filter(([day,payload])=>savedHistory.get(day)!==payload);
      if(changed.length>450)throw new Error('Too many historical days to upload in one sync. Your browser copy is retained.');
      const revision=await runTransaction(db,async tx=>{
        const latest=await tx.get(profile),actual=latest.exists()?latest.data().revision:0;
        if(actual!==expected){const error=new Error('Budget changed on another device.');error.code='budget/conflict';throw error}
        tx.set(profile,{revision:actual+1,payload,updatedAt:serverTimestamp()});
        changed.forEach(([day,payload])=>tx.set(doc(days,day),{payload}));
        return actual+1;
      });
      changed.forEach(([day,payload])=>savedHistory.set(day,payload));
      return revision;
    }
  };
}
