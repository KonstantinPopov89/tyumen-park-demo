// Pure state for quick demo purchase. No payment, network or browser storage.
import {clone,makeLine,validateDraft,createOrder} from './commerce-model.js?v=r10';

export const QUICK_MAX=8;
export const QUICK_CATEGORIES=['unlimited','package','single'];
export const quantityValue=value=>/^\d+$/.test(String(value??'').trim())&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=QUICK_MAX?Number(value):null;
export const itemKey=(productId,rideId)=>productId==='single'?`single:${rideId}`:productId;
export const categoryFor=productId=>['package10','package'].includes(productId)?'package':['single','venue-entry'].includes(productId)?'single':'unlimited';
export const activeQuickOrder=rows=>(rows||[]).filter(o=>['commerce','session'].includes(o.kind)&&['processing','pending','unknown'].includes(o.status)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;

function snapshotPeople(group){
  const seen=new Set();return (group?.people||[]).slice(0,QUICK_MAX).filter(p=>p&&typeof p.id==='string'&&!seen.has(p.id)&&seen.add(p.id)).map(p=>({...clone(p),name:typeof p.name==='string'?p.name:''}));
}
export function newQuickDraft(id,group=null,category='unlimited',rideId='ferris-wheel',now=new Date().toISOString()){
  const people=snapshotPeople(group),count=people.length||3;
  category=QUICK_CATEGORIES.includes(category)?category:categoryFor(category);
  const productId=category==='package'?'package10':category==='single'?'single':'mini-pass3';
  return {version:1,id,createdAt:now,category,displayRide:rideId,people,companyVersion:group?.version??null,items:[{key:itemKey(productId,rideId),productId,rideId:productId==='single'?rideId:null,quantity:category==='package'?1:count}],quantityInputs:{},contact:'',edited:false};
}
export function reconcileQuickCompany(draft,group){
  const next=clone(draft),people=snapshotPeople(group);
  next.people=people;next.companyVersion=group?.version??null;
  if(!next.edited)next.items=next.items.map(item=>item.productId==='package10'?item:{...item,quantity:people.length||3});
  return next;
}
export function quickItems(draft,catalog,rides){
  return (draft?.items||[]).filter(x=>x.quantity>0).map(x=>{
    const product=catalog.find(p=>p.id===x.productId),ride=rides.find(r=>r.id===x.rideId);
    return product?{...clone(x),name:clone(product.id==='single'&&ride?ride.name:product.name),price:product.price,total:product.price*x.quantity,personal:product.personal}:null;
  }).filter(Boolean);
}
export const quickTotal=(draft,catalog,rides)=>quickItems(draft,catalog,rides).reduce((sum,item)=>sum+item.total,0);
export const quickQuantity=(draft,key)=>draft.items.find(x=>x.key===key)?.quantity||0;
export function changeQuickQuantity(draft,productId,rideId,value,catalog,rides){
  const next=clone(draft),key=itemKey(productId,rideId),count=quantityValue(value);
  if(!catalog.some(p=>p.id===productId)||(productId==='single'&&!rides.some(r=>r.id===rideId)))return {draft:next,error:'product'};
  next.quantityInputs={...(next.quantityInputs||{}),[key]:String(value)};
  if(count===null)return {draft:next,error:'quantity'};
  // The untouched suggestion is replaced by the first explicit choice of another product.
  // Once a quantity was edited, further products extend the existing cart.
  if(count>0&&!next.edited&&!next.items.some(item=>item.key===key))next.items=[];
  next.items=next.items.filter(x=>x.key!==key);
  if(count>0)next.items.push({key,productId,rideId:productId==='single'?rideId:null,quantity:count});
  delete next.quantityInputs[key];next.edited=true;
  return {draft:next,error:null};
}
export function changeQuickCategory(draft,category){
  return QUICK_CATEGORIES.includes(category)?{...clone(draft),category}:clone(draft);
}
export function changeQuickRide(draft,rideId,rides){
  return rides.some(r=>r.id===rideId)?{...clone(draft),displayRide:rideId}:clone(draft);
}
// A contextual ride is consumed once. A genuine subsequent click can restore it,
// while refresh, history traversal and quantity edits cannot restore a removed item.
export function enterQuickRide(draft,rideId,catalog,rides,intentEntry=false){
  if(!rides.some(ride=>ride.id===rideId))return clone(draft);
  const intent='ride:'+rideId;
  if(!intentEntry&&(draft.handledIntents||[]).includes(intent))return clone(draft);
  let next=clone(draft);
  const key=itemKey('single',rideId),existing=next.items.find(item=>item.key===key);
  if(!existing||existing.quantity===0){
    next=changeQuickQuantity(next,'single',rideId,Math.max(1,next.people.length||3),catalog,rides).draft;
  }
  next.category='single';next.displayRide=rideId;
  next.handledIntents=[...new Set([...(next.handledIntents||[]),intent])];
  return next;
}
export function quickReturn(value){
  return typeof value==='string'&&value.length<=2000&&/^\/availability(?:\?[^#\r\n]*)?$/.test(value)?value:'';
}
export function quickCommerceDraft(draft,catalog,rides){
  const items=(draft.items||[]).filter(x=>x.quantity>0);
  const count=Math.min(QUICK_MAX,Math.max(1,draft.people.length,...items.filter(x=>catalog.find(p=>p.id===x.productId)?.personal).map(x=>quantityValue(x.quantity)||0)));
  const people=Array.from({length:count},(_,index)=>draft.people[index]?clone(draft.people[index]):{id:`${draft.id}-guest-${index+1}`,name:'',band:'unknown',height:null,deferred:true});
  const lines=items.map(x=>makeLine(`${draft.id}-${x.key}`,x.productId,catalog,people,x.rideId,x.quantity));
  return {id:draft.id,createdAt:draft.createdAt,companyVersion:draft.companyVersion,companySnapshot:people,lines,contact:draft.contact||'',delivery:'ticket',cardNumber:''};
}
export function quickIssues(draft,catalog,rides){
  const result=[];
  if(Object.values(draft.quantityInputs||{}).some(value=>quantityValue(value)===null))result.push('quantity');
  const keys=(draft.items||[]).map(x=>x.key);
  if(new Set(keys).size!==keys.length||draft.items.some(x=>x.key!==itemKey(x.productId,x.rideId)))result.push('product');
  if(draft.items.some(x=>!catalog.some(p=>p.id===x.productId)))result.push('product');
  if(draft.items.some(x=>quantityValue(x.quantity)===null))result.push('quantity');
  if(draft.items.some(x=>x.productId==='single'&&!rides.some(ride=>ride.id===x.rideId)))result.push('ride');
  const issues=validateDraft(quickCommerceDraft(draft,catalog,rides),catalog,rides);
  return [...new Set([...result,...issues])];
}
export function createQuickOrder(draft,catalog,rides,outcome='success',now){
  const issues=quickIssues(draft,catalog,rides);if(issues.length)throw new Error(issues.join(','));
  const order=createOrder(quickCommerceDraft(draft,catalog,rides),catalog,rides,outcome,now);
  order.origin={route:'/quick'};return order;
}
export function quickSignature(draft){
  return JSON.stringify(draft?{id:draft.id,items:draft.items,people:draft.people,quantityInputs:draft.quantityInputs||{}}:null);
}
export function newQuickAttempt(draft,id,now=new Date().toISOString()){
  const next=clone(draft);next.id=id;next.createdAt=now;delete next.orderId;return next;
}
