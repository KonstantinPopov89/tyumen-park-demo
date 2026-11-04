// Browser data is untrusted. Keep legacy valid snapshots; never coerce rights.
export const MAX_STORED_CHARS=2*1024*1024;
export const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=8192)=>typeof value==='string'&&value.length<=max;
const id=value=>text(value,240)&&value.length>0;
const integer=(value,max=1000000000)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const list=(value,test=object,max=256)=>Array.isArray(value)&&value.length<=max&&value.every(test);
const optionalList=(value,test=object)=>value===undefined||list(value,test);
const optional=(value,test)=>value===undefined||value===null||test(value);
export function boundedValue(value,depth=0){
 if(depth>14)return false;
 if(value===null||typeof value==='boolean')return true;
 if(typeof value==='string')return text(value);
 if(typeof value==='number')return Number.isFinite(value);
 if(Array.isArray(value))return value.length<=1024&&value.every(item=>boundedValue(item,depth+1));
 return object(value)&&Object.keys(value).length<=1024&&Object.entries(value).every(([key,item])=>key.length<=240&&!['__proto__','prototype','constructor'].includes(key)&&boundedValue(item,depth+1));
}
const onlyKeys=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const companyPersonFields=['id','name','band','height'];
export const validCompanyPerson=value=>object(value)&&id(value.id)&&text(value.name,240)&&['unknown','under3','age3_4','age5_9','age10_17','adult'].includes(value.band)&&(value.height===null||Number.isInteger(value.height)&&value.height>=40&&value.height<=250);
export function validPreference(key,value){
 if(!boundedValue(value))return false;
 if(key==='saved')return list(value,id,256)&&new Set(value).size===value.length;
 return key==='company'&&onlyKeys(value,['version','people'])&&integer(value.version,Number.MAX_SAFE_INTEGER)&&list(value.people,p=>validCompanyPerson(p)&&onlyKeys(p,companyPersonFields),8)&&new Set(value.people.map(p=>p.id)).size===value.people.length;
}
const isoDate=value=>text(value,10)&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(new Date(value+'T00:00:00Z').getTime())&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const phases=['select','review','processing','pending','unknown','paid','failed','cancelled'];
const scenarios=['normal','soldout','shortage','separated','closed','price-change','pending','unknown','failed','cancelled','partial','issuance-pending'];
export function validSessionSnapshot(value){
 return object(value)&&boundedValue(value)&&id(value.eventId)&&isoDate(value.date)&&text(value.time,5)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)&&integer(value.qty,8)&&value.qty>=1&&list(value.seats,seat=>text(seat,40)&&seat.length>0,8)&&new Set(value.seats).size===value.seats.length&&optional(value.contact,v=>text(v,254))&&optional(value.autoSeats,v=>typeof v==='boolean')&&optional(value.phase,v=>phases.includes(v))&&optional(value.orderId,id)&&optional(value.step,v=>integer(v,3))&&optional(value.scenario,v=>scenarios.includes(v))&&optional(value.error,v=>text(v,80))&&optional(value.quantityInput,v=>text(v,24))&&optional(value.review,v=>object(v)&&text(v.signature)&&integer(v.unitPrice)&&integer(v.total));
}
const person=value=>object(value)&&optional(value.id,id)&&optional(value.name,v=>text(v,240))&&optional(value.displayIndex,v=>integer(v,255));
const uses=value=>value===undefined||value===null||Number.isInteger(value)&&value>=1&&value<=1000;
const localText=value=>text(value)||object(value)&&Object.entries(value).every(([language,content])=>['ru','en'].includes(language)&&text(content));
const named=value=>object(value)&&optional(value.name,localText);
export function validOrder(order){
 if(!object(order)||!boundedValue(order)||!id(order.id)||!['commerce','session'].includes(order.kind)||!['processing','pending','unknown','paid','failed','cancelled'].includes(order.status))return false;
 if(order.kind==='session'&&!validSessionSnapshot(order.sessionSnapshot))return false;
 if(!integer(order.total)||!list(order.items)||!list(order.rights)||!optional(order.contact,v=>text(v,254)))return false;
 if(!order.items.every(item=>optional(item.quantity,v=>integer(v,1000))&&optional(item.unitPrice,integer)&&optional(item.subtotal,integer)&&uses(item.uses)&&optional(item.name,localText)&&optionalList(item.recipients,person)&&optionalList(item.sharedRecipients,person)&&optionalList(item.includedRides,named)&&optionalList(item.rideIds,id)&&optionalList(item.seats,seat=>text(seat,40)||object(seat))&&(item.personal!==false||Array.isArray(item.sharedRecipients))))return false;
 return order.rights.every(right=>id(right.id)&&uses(right.uses)&&optional(right.name,localText)&&optional(right.detail,localText)&&optional(right.qrPayload,v=>text(v,1024))&&optional(right.ready,v=>typeof v==='boolean')&&optionalList(right.recipients,person)&&optionalList(right.includedRides,named)&&optionalList(right.rideIds,id)&&optional(right.recipient,person));
}
export const isNonCriticalPreference=key=>['discovery-tutorial-v2','discovery-filter','discovery-saved-intent-v1','discovery-progress-v3','discovery-progress-v2','receipt-current-v1'].includes(key);
const idMap=(value,max)=>object(value)&&Object.keys(value).length<=max&&Object.entries(value).every(([key,entry])=>id(key)&&id(entry));
const discoveryAction=value=>onlyKeys(value,['id','added','decision','token'])&&id(value.id)&&['yes','skip'].includes(value.decision)&&optional(value.added,v=>typeof v==='boolean')&&optional(value.token,id);
const discoveryView=value=>object(value)&&optional(value.index,v=>integer(v,1024))&&optional(value.rideId,id)&&optional(value.atEnd,v=>typeof v==='boolean')&&optional(value.undo,v=>list(v,discoveryAction,100));
const discoveryViews=value=>object(value)&&Object.keys(value).length<=32&&Object.entries(value).every(([key,view])=>id(key)&&discoveryView(view));
export function validStoredValue(key,value){
 if(!boundedValue(value)||JSON.stringify(value).length>MAX_STORED_CHARS)return false;
 if(key==='discovery-tutorial-v2')return onlyKeys(value,['version','seen'])&&value.version===2&&typeof value.seen==='boolean';
 if(key==='discovery-filter')return typeof value==='boolean';
 if(key==='discovery-saved-intent-v1')return idMap(value,256);
 if(key==='receipt-current-v1')return idMap(value,32);
 if(key==='discovery-progress-v3')return value===null||onlyKeys(value,['version','views','active','migratedFrom'])&&value.version===3&&discoveryViews(value.views)&&id(value.active)&&optional(value.migratedFrom,id);
 if(key==='discovery-progress-v2')return value===null||object(value)&&optional(value.version,v=>v===2)&&discoveryViews(value.views)&&optional(value.active,v=>object(v)&&Object.entries(v).every(([key,entry])=>['feed','swipe'].includes(key)&&id(entry)));
 if(key==='company'||key==='saved')return validPreference(key,value);
 if(key==='orders')return list(value,validOrder,512);
 if(key==='commerce-draft')return value===null||object(value)&&id(value.id)&&list(value.lines,line=>object(line)&&id(line.id)&&id(line.productId)&&integer(line.quantity,8)&&list(line.recipients,v=>v===null||id(v))&&list(line.sharedPeople,id))&&list(value.companySnapshot,person)&&text(value.contact,254);
 if(key==='quick-draft')return value===null||object(value)&&id(value.id)&&value.version===1&&list(value.people,person,8)&&list(value.items,item=>object(item)&&id(item.key)&&id(item.productId)&&integer(item.quantity,8))&&object(value.quantityInputs)&&text(value.contact,254)&&['unlimited','package','single'].includes(value.category);
 if(key==='topup-ledger')return object(value)&&value.version===1&&list(value.operations,op=>object(op)&&id(op.id)&&/^\d{6,16}$/.test(op.card)&&integer(op.amount,20000)&&op.amount>=100&&['paid','pending','unknown','failed','cancelled'].includes(op.payment)&&['pending','credited'].includes(op.credit)&&integer(op.autoChecks,3)&&integer(op.manualChecks,100000))&&object(value.balanceByCard)&&Object.values(value.balanceByCard).every(v=>integer(v))&&optional(value.activeId,id);
 if(key==='topup-draft')return object(value)&&text(value.card,32)&&text(value.amount,32)&&typeof value.dirty==='boolean';
 if(key.startsWith('session:'))return object(value)&&value.version===1&&validSessionSnapshot(value.draft)&&list(value.journal,validOrder,512)&&optional(value.savedDraft,validSessionSnapshot)&&optional(value.blocked,v=>typeof v==='boolean')&&optional(value.revision,v=>integer(v,Number.MAX_SAFE_INTEGER));
 return false;
}
