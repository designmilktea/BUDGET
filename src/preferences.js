export const lastScopeKey=uid=>`daily-budget-scope:${uid||'guest'}`;
export const defaultScopeKey=uid=>`daily-budget-default:${uid||'guest'}`;
export function preferredScope(storage,uid){return storage.getItem(defaultScopeKey(uid))||storage.getItem(lastScopeKey(uid))||'personal'}
export function setDefaultScope(storage,uid,id){storage.setItem(defaultScopeKey(uid),id)}
export function clearUnavailableDefault(storage,uid,id){if(preferredScope(storage,uid)===id)setDefaultScope(storage,uid,'personal')}
