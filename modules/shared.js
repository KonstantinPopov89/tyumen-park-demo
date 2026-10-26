const PREFIX='tmn-open-sky-v1:';
const cache=new Map();
let durableStorage=true;try{localStorage.setItem(PREFIX+'probe','1');localStorage.removeItem(PREFIX+'probe');}catch{durableStorage=false;}
export const storageAvailable=()=>durableStorage;
export const lang=()=>new URLSearchParams(location.search).get('lang')==='en'?'en':'ru';
export const t=(ru,en)=>lang()==='en'?en:ru;
export const loc=value=>typeof value==='string'?value:value?.[lang()]||'';
export const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=n=>new Intl.NumberFormat(lang()==='en'?'en-GB':'ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(n);
export function read(key,fallback){if(!durableStorage)return cache.has(key)?structuredClone(cache.get(key)):structuredClone(fallback);try{const v=localStorage.getItem(PREFIX+key);if(v!==null)return JSON.parse(v);}catch{}return cache.has(key)?structuredClone(cache.get(key)):structuredClone(fallback);}
export function write(key,value){cache.set(key,structuredClone(value));try{localStorage.setItem(PREFIX+key,JSON.stringify(value));}catch{durableStorage=false;}window.dispatchEvent(new CustomEvent('tmn:change',{detail:{key,external:false}}));return value;}
function durableCommit(key,value){try{localStorage.setItem(PREFIX+key,JSON.stringify(value));}catch(error){durableStorage=false;window.dispatchEvent(new CustomEvent('tmn:change',{detail:{key:'storage',external:false}}));throw new Error('STORAGE_UNAVAILABLE',{cause:error});}cache.set(key,structuredClone(value));window.dispatchEvent(new CustomEvent('tmn:change',{detail:{key,external:false}}));return value;}
let database;
function db(){return database||(database=new Promise((resolve,reject)=>{const r=indexedDB.open(PREFIX+'atomic',1);r.onupgradeneeded=()=>r.result.createObjectStore('values');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));}
export async function atomic(key,update,fallback){
 if(!durableStorage)throw new Error('STORAGE_UNAVAILABLE');
 if(navigator.locks)return navigator.locks.request(PREFIX+key,()=>{const next=update(read(key,fallback));durableCommit(key,next);return structuredClone(next);});
 const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('values','readwrite');const table=tx.objectStore('values');let next;const request=table.get(key);request.onsuccess=()=>{try{next=update(request.result??read(key,fallback));table.put(next,key);}catch(e){tx.abort();reject(e);}};tx.oncomplete=()=>{try{durableCommit(key,next);resolve(structuredClone(next));}catch(error){reject(error);}};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage unavailable'));});
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
window.addEventListener('storage',e=>{if(e.key?.startsWith(PREFIX))window.dispatchEvent(new CustomEvent('tmn:change',{detail:{key:e.key.slice(PREFIX.length),external:true}}));});
