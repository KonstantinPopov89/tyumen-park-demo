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
const person=value=>object(value)&&optional(value.id,id)&&optional(value.name,v=>text(v,240))&&optional(value.displayIndex,v=>integer(v,255));
const uses=value=>value===undefined||value===null||Number.isInteger(value)&&value>=1&&value<=1000;
const localText=value=>text(value)||object(value)&&Object.entries(value).every(([language,content])=>['ru','en'].includes(language)&&text(content));
const named=value=>object(value)&&optional(value.name,localText);
export function validOrder(order){
 if(!object(order)||!boundedValue(order)||!id(order.id)||!['commerce','session'].includes(order.kind)||!['processing','pending','unknown','paid','failed','cancelled'].includes(order.status))return false;
 if(!integer(order.total)||!list(order.items)||!list(order.rights)||!optional(order.contact,v=>text(v,254)))return false;
 if(!order.items.every(item=>optional(item.quantity,v=>integer(v,1000))&&optional(item.unitPrice,integer)&&optional(item.subtotal,integer)&&uses(item.uses)&&optional(item.name,localText)&&optionalList(item.recipients,person)&&optionalList(item.sharedRecipients,person)&&optionalList(item.includedRides,named)&&optionalList(item.rideIds,id)&&optionalList(item.seats,seat=>text(seat,40)||object(seat))&&(item.personal!==false||Array.isArray(item.sharedRecipients))))return false;
 return order.rights.every(right=>id(right.id)&&uses(right.uses)&&optional(right.name,localText)&&optional(right.detail,localText)&&optional(right.qrPayload,v=>text(v,1024))&&optional(right.ready,v=>typeof v==='boolean')&&optionalList(right.recipients,person)&&optionalList(right.includedRides,named)&&optionalList(right.rideIds,id)&&optional(right.recipient,person));
}
export function validStoredValue(key,value){
 if(!boundedValue(value))return false;
 if(key==='orders')return list(value,validOrder,512);
 if(key==='commerce-draft')return value===null||object(value)&&id(value.id)&&list(value.lines,line=>object(line)&&id(line.id)&&id(line.productId)&&integer(line.quantity,8)&&list(line.recipients,v=>v===null||id(v))&&list(line.sharedPeople,id))&&list(value.companySnapshot,person)&&text(value.contact,254);
 if(key==='quick-draft')return value===null||object(value)&&id(value.id)&&value.version===1&&list(value.people,person,8)&&list(value.items,item=>object(item)&&id(item.key)&&id(item.productId)&&integer(item.quantity,8))&&object(value.quantityInputs)&&text(value.contact,254)&&['unlimited','package','single'].includes(value.category);
 if(key==='topup-ledger')return object(value)&&value.version===1&&list(value.operations,op=>object(op)&&id(op.id)&&/^\d{6,16}$/.test(op.card)&&integer(op.amount,20000)&&op.amount>=100&&['paid','pending','unknown','failed','cancelled'].includes(op.payment)&&['pending','credited'].includes(op.credit)&&integer(op.autoChecks,3)&&integer(op.manualChecks,100000))&&object(value.balanceByCard)&&Object.values(value.balanceByCard).every(v=>integer(v))&&optional(value.activeId,id);
 if(key==='topup-draft')return object(value)&&text(value.card,32)&&text(value.amount,32)&&typeof value.dirty==='boolean';
 if(key.startsWith('session:'))return object(value)&&value.version===1&&object(value.draft)&&list(value.journal,validOrder,512);
 return true;
}
