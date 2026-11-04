import {MAX_STORED_CHARS,object,boundedValue,validOrder,validStoredValue} from './storage-schema.js?v=r23';
const PREFIX='tmn-open-sky-v1:';
const clearingKey=PREFIX+'privacy:clearing';
function privacyActive(){if(clearing)return true;try{if(localStorage.getItem(clearingKey)){stopForPrivacy();return true;}}catch{}return false;}
const cache=new Map();
let clearing=false,invalidStorage=false;
let durableStorage=true;try{localStorage.setItem(PREFIX+'probe','1');localStorage.removeItem(PREFIX+'probe');}catch{durableStorage=false;}
export const storageAvailable=()=>durableStorage&&!clearing&&!invalidStorage;
export const storageIssue=()=>invalidStorage?'invalid':!durableStorage?'unavailable':null;
export const lang=()=>new URLSearchParams(location.search).get('lang')==='en'?'en':'ru';
export const t=(ru,en)=>lang()==='en'?en:ru;
export const loc=value=>typeof value==='string'?value:value?.[lang()]||'';
export const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=n=>new Intl.NumberFormat(lang()==='en'?'en-GB':'ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(n);
function decodedOrders(raw){
 try{if(typeof raw!=='string'||raw.length>MAX_STORED_CHARS)throw new Error('Oversized history');const value=JSON.parse(raw);return {rows:Array.isArray(value)?value.slice(0,512).filter(validOrder):[],valid:Array.isArray(value)&&value.length<=512&&value.every(validOrder)};}catch{return {rows:[],valid:false};}
}
const backupKey=PREFIX+'orders:backup';
const recoveryKey=PREFIX+'orders:recovery';
function savedRecoveryNotice(){try{const notice=JSON.parse(localStorage.getItem(recoveryKey)||'null');return object(notice)&&['recovered','retained','fromBackup'].every(key=>Number.isSafeInteger(notice[key])&&notice[key]>=0)?notice:null;}catch{return null;}}
let recoveryNotice=savedRecoveryNotice();
function rememberOrders(rows){
 const serialized=JSON.stringify(rows);cache.set('orders',structuredClone(rows));
 // A backup failure must not turn an otherwise saved order into a failed purchase.
 try{if(localStorage.getItem(backupKey)!==serialized)localStorage.setItem(backupKey,serialized);}catch{}
 return rows;
}
function readOrders(){
 if(privacyActive())return [];
 if(!durableStorage&&cache.has('orders'))return structuredClone(cache.get('orders'));
 let raw;try{raw=localStorage.getItem(PREFIX+'orders');}catch{durableStorage=false;return structuredClone(cache.get('orders')||[]);}
 if(raw===null)return [];
 const current=decodedOrders(raw);if(current.valid)return rememberOrders(current.rows);
 let backup=[];try{backup=decodedOrders(localStorage.getItem(backupKey)).rows;}catch{}
 const rows=current.rows.slice(),ids=new Set(rows.map(order=>order.id));
 for(const order of backup)if(!ids.has(order.id)){rows.push(order);ids.add(order.id);}
 recoveryNotice={recovered:rows.length,retained:current.rows.length,fromBackup:rows.length-current.rows.length,at:new Date().toISOString()};
 cache.set('orders',structuredClone(rows));
 try{
  // Archive the exact damaged value before replacing it. If archiving or saving fails,
  // leave the source untouched and keep surviving records available in this tab.
  const archive=PREFIX+'orders:damaged:'+Date.now()+':'+Math.random().toString(36).slice(2,8);
  localStorage.setItem(archive,raw);
  localStorage.setItem(recoveryKey,JSON.stringify(recoveryNotice));
  localStorage.setItem(PREFIX+'orders',JSON.stringify(rows));
  rememberOrders(rows);
 }catch{durableStorage=false;}
 return structuredClone(rows);
}
export function historyRecovery(){readOrders();return recoveryNotice?{...recoveryNotice}:null;}
export function acknowledgeHistoryRecovery(){recoveryNotice=null;try{localStorage.removeItem(recoveryKey);}catch{}refresh();}
const preferencesRecoveryKey=PREFIX+'preferences:recovery';
function savedPreferencesRecovery(){try{const keys=JSON.parse(localStorage.getItem(preferencesRecoveryKey)||'[]');return new Set(Array.isArray(keys)?keys.filter(key=>key==='saved'||key==='company'):[]);}catch{return new Set();}}
let preferencesNotices=savedPreferencesRecovery();
const validSaved=id=>typeof id==='string'&&id.length>0&&id.length<=240;
const validPerson=person=>object(person)&&typeof person.id==='string'&&person.id.length>0&&person.id.length<=240&&typeof person.name==='string'&&person.name.length<=240&&['unknown','under3','age3_4','age5_9','age10_17','adult'].includes(person.band)&&(person.height===null||Number.isInteger(person.height)&&person.height>=40&&person.height<=250);
function decodedPreference(key,raw){
 let value;try{if(typeof raw==='string'&&raw.length<=MAX_STORED_CHARS)value=JSON.parse(raw);}catch{}
 if(key==='saved')return {value:Array.isArray(value)?value.slice(0,256).filter(validSaved):[],valid:Array.isArray(value)&&value.length<=256&&value.every(validSaved)};
 const people=Array.isArray(value?.people)?value.people.slice(0,8).filter(validPerson):[];
 const version=Number.isSafeInteger(value?.version)&&value.version>=0?value.version:1;
 return {value:{...(object(value)?value:{}),version,people},valid:object(value)&&Array.isArray(value.people)&&value.people.length<=8&&value.people.every(validPerson)&&Number.isSafeInteger(value.version)&&value.version>=0};
}
function rememberPreference(key,value){cache.set(key,structuredClone(value));try{const raw=JSON.stringify(value);if(localStorage.getItem(PREFIX+key+':backup')!==raw)localStorage.setItem(PREFIX+key+':backup',raw);}catch{}return value;}
function readPreference(key,fallback){
 if(privacyActive())return structuredClone(fallback);
 if(!durableStorage&&cache.has(key))return structuredClone(cache.get(key));
 let raw;try{raw=localStorage.getItem(PREFIX+key);}catch{return cache.has(key)?structuredClone(cache.get(key)):structuredClone(fallback);}
 if(raw===null)return cache.has(key)?structuredClone(cache.get(key)):structuredClone(fallback);
 const current=decodedPreference(key,raw);if(current.valid)return rememberPreference(key,current.value);
 let backup;try{backup=decodedPreference(key,localStorage.getItem(PREFIX+key+':backup')).value;}catch{backup=decodedPreference(key,null).value;}
 let value;if(key==='saved')value=[...new Set([...current.value,...backup])];else{const people=current.value.people.slice(),ids=new Set(people.map(person=>person.id));for(const person of backup.people)if(!ids.has(person.id)){people.push(person);ids.add(person.id);}value={...current.value,version:Math.max(current.value.version,backup.version),people};}
 cache.set(key,structuredClone(value));preferencesNotices.add(key);
 try{localStorage.setItem(PREFIX+key+':damaged:'+Date.now()+':'+Math.random().toString(36).slice(2,8),raw);localStorage.setItem(preferencesRecoveryKey,JSON.stringify([...preferencesNotices]));localStorage.setItem(PREFIX+key,JSON.stringify(value));rememberPreference(key,value);}catch{durableStorage=false;}
 return structuredClone(value);
}
export function preferencesRecovery(){readPreference('saved',[]);readPreference('company',null);return [...preferencesNotices];}
export function acknowledgePreferencesRecovery(){preferencesNotices.clear();try{localStorage.removeItem(preferencesRecoveryKey);}catch{}refresh();}
export function read(key,fallback){
 if(privacyActive())return structuredClone(fallback);
 if(key==='orders')return readOrders();
 if(key==='saved'||key==='company')return readPreference(key,fallback);
 if(!durableStorage&&cache.has(key))return structuredClone(cache.get(key));
 try{const v=localStorage.getItem(PREFIX+key);if(v!==null){if(v.length<=MAX_STORED_CHARS){const parsed=JSON.parse(v);if(validStoredValue(key,parsed))return parsed;}invalidStorage=true;}}catch{if(durableStorage)invalidStorage=true;}
 return cache.has(key)?structuredClone(cache.get(key)):structuredClone(fallback);
}
export function write(key,value){if(privacyActive())throw new Error('DATA_CLEARING');if(!validStoredValue(key,value))throw new Error('INVALID_STORED_DATA');cache.set(key,structuredClone(value));try{localStorage.setItem(PREFIX+key,JSON.stringify(value));}catch{durableStorage=false;}window.dispatchEvent(new CustomEvent('tmn:change',{detail:{key,external:false}}));return value;}
function durableCommit(key,value){if(privacyActive()||invalidStorage)throw new Error('STORAGE_UNAVAILABLE');if(!validStoredValue(key,value))throw new Error('INVALID_STORED_DATA');try{localStorage.setItem(PREFIX+key,JSON.stringify(value));}catch(error){durableStorage=false;window.dispatchEvent(new CustomEvent('tmn:change',{detail:{key:'storage',external:false}}));throw new Error('STORAGE_UNAVAILABLE',{cause:error});}cache.set(key,structuredClone(value));if(key==='orders')rememberOrders(value);window.dispatchEvent(new CustomEvent('tmn:change',{detail:{key,external:false}}));return value;}
let database;
const privacyChannel=typeof BroadcastChannel==='function'?new BroadcastChannel(PREFIX+'privacy'):null;
function stopForPrivacy(){
 clearing=true;cache.clear();recoveryNotice=null;preferencesNotices.clear();
 try{for(const key of Object.keys(sessionStorage))if(key.startsWith(PREFIX))sessionStorage.removeItem(key);}catch{}
 database?.then(connection=>connection.close()).catch(()=>{});database=null;
 window.dispatchEvent(new CustomEvent('tmn:privacy-stop'));
}
privacyChannel?.addEventListener('message',event=>{
 if(event.data==='clearing')stopForPrivacy();
 if(event.data==='cleared'){stopForPrivacy();location.reload();}
});
function deleteAtomicDatabase(){
 return new Promise((resolve,reject)=>{
  let request;const timer=setTimeout(()=>reject(new Error('CLOSE_OTHER_TABS')),4000);
  try{request=indexedDB.deleteDatabase(PREFIX+'atomic');}catch(error){clearTimeout(timer);reject(error);return;}
  request.onsuccess=()=>{clearTimeout(timer);resolve();};
  request.onerror=()=>{clearTimeout(timer);reject(request.error);};
 });
}
export async function clearAppData(){
 const clear=async()=>{
  localStorage.setItem(clearingKey,'1');
  stopForPrivacy();privacyChannel?.postMessage('clearing');
  try{
  // Remove only this application's records, including backup/damaged keys.
  // The shared GitHub origin may contain unrelated applications.
  for(const storage of [localStorage,sessionStorage]){
   const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(key=>key?.startsWith(PREFIX)&&key!==clearingKey);
   for(const key of keys)storage.removeItem(key);
   if(Array.from({length:storage.length},(_,i)=>storage.key(i)).some(key=>key?.startsWith(PREFIX)&&key!==clearingKey))throw new Error('CLEAR_INCOMPLETE');
  }
  await deleteAtomicDatabase();
  cache.clear();recoveryNotice=null;preferencesNotices.clear();invalidStorage=false;
  return true;
  }finally{localStorage.removeItem(clearingKey);}
 };
 const result=await (navigator.locks?navigator.locks.request(PREFIX+'privacy',clear):clear());privacyChannel?.postMessage('cleared');return result;
}
function db(){return database||(database=new Promise((resolve,reject)=>{const r=indexedDB.open(PREFIX+'atomic',1);r.onupgradeneeded=()=>r.result.createObjectStore('values');r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();database=null;};resolve(r.result);};r.onerror=()=>reject(r.error);}));}
export async function atomic(key,update,fallback){
 if(!storageAvailable())throw new Error('STORAGE_UNAVAILABLE');
 if(navigator.locks)return navigator.locks.request(PREFIX+'privacy',{mode:'shared'},()=>navigator.locks.request(PREFIX+key,()=>{if(!storageAvailable())throw new Error('STORAGE_UNAVAILABLE');const next=update(read(key,fallback));durableCommit(key,next);return structuredClone(next);}));
 const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('values','readwrite');const table=tx.objectStore('values');let next;const request=table.get(key);request.onsuccess=()=>{try{const stored=read(key,fallback);let previous=request.result!==undefined&&validStoredValue(key,request.result)?request.result:stored;if(key==='orders'){previous=Array.isArray(previous)?previous.filter(validOrder):[];for(const order of stored){const i=previous.findIndex(row=>row.id===order.id);if(i<0)previous.push(order);else if(String(order.updatedAt||'')>String(previous[i].updatedAt||''))previous[i]=order;}}next=update(previous);table.put(next,key);}catch(e){tx.abort();reject(e);}};tx.oncomplete=()=>{try{durableCommit(key,next);resolve(structuredClone(next));}catch(error){reject(error);}};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage unavailable'));});
}
export function company(){return read('company',{version:1,people:[1,2,3].map(n=>({id:'person-'+n,name:'',band:'unknown',height:null}))});}
export const personName=(p,i=0)=>p.name||t('Участник ','Guest ')+(i+1);
export const orders=()=>read('orders',[]);
export const putOrder=order=>atomic('orders',rows=>{const i=rows.findIndex(x=>x.id===order.id);if(i<0)rows.unshift(structuredClone(order));else rows[i]=structuredClone(order);return rows;},[]);
export const uid=prefix=>prefix+'-'+crypto.randomUUID();
export function navigate(path){location.hash='#'+(path.startsWith('/')?path:'/'+path);}
export function refresh(options={}){window.dispatchEvent(new CustomEvent('tmn:render',{detail:options}));}
export function notify(message){const el=document.querySelector('#toast');if(el){el.textContent=message;el.classList.add('visible');clearTimeout(window.__tmnToast);window.__tmnToast=setTimeout(()=>el.classList.remove('visible'),3500);}}
export function contactValid(v){v=String(v||'').trim();return !v||(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))||(/^[+\d\s()-]+$/.test(v)&&v.replace(/\D/g,'').length>=10&&v.replace(/\D/g,'').length<=15);}
export const demoNote=()=>`<p class="demo-note">${t('Демонстрация: цены условные, деньги не списываются.','Demo: sample prices, no money is charged.')}</p>`;
const paths={arrow:'M4 12h15m-6-6 6 6-6 6',back:'M20 12H5m6-6-6 6 6 6',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',close:'m6 6 12 12M18 6 6 18',check:'m5 12 4 4L19 6',menu:'M4 6h16M4 12h16M4 18h16',chevron:'m6 9 6 6 6-6',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',play:'m9 5 11 7-11 7Z',plus:'M12 4v16M4 12h16',minus:'M4 12h16',clock:'M12 7v5l4 2M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0'};
export const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.arrow}"/></svg>`;
export const bands=[['unknown','Не знаю','Not sure'],['under3','До 3 лет','Under 3'],['age3_4','3-4 года','3-4 years'],['age5_9','5-9 лет','5-9 years'],['age10_17','10-17 лет','10-17 years'],['adult','18+','18+']];
window.addEventListener('storage',e=>{if(e.key===clearingKey){if(e.newValue)stopForPrivacy();else location.reload();return;}if(clearing)return;if(e.key===recoveryKey)recoveryNotice=savedRecoveryNotice();if(e.key===preferencesRecoveryKey)preferencesNotices=savedPreferencesRecovery();if(e.key?.startsWith(PREFIX))window.dispatchEvent(new CustomEvent('tmn:change',{detail:{key:e.key.slice(PREFIX.length),external:true}}));});
