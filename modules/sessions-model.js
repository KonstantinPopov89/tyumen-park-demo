// Pure local demonstration model. No remote reservation or payment is made.
export const MAX_QTY = 8;
export const LOCKED = ['processing', 'pending', 'unknown'];
export const SCENARIOS = ['normal', 'soldout', 'shortage', 'separated', 'closed', 'price-change', 'pending', 'unknown', 'failed', 'cancelled', 'partial', 'issuance-pending'];
const clone = value => JSON.parse(JSON.stringify(value));
const phases = ['select', 'review', ...LOCKED, 'paid', 'failed', 'cancelled'];
export const seated = event => event.mode === 'seated';
export const allSeats = event => Array.from({length:event.rows || 4},(_,r)=>Array.from({length:event.columns || 6},(_,c)=>`${String.fromCharCode(65+r)}${c+1}`)).flat();
export const validContact = value => typeof value === 'string' && value.length <= 254 && (!value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) || /^\+?[\d\s()-]+$/.test(value.trim()) && /^\d{10,15}$/.test(value.replace(/\D/g,'')));
export const sessionKey = draft => `${draft.eventId}:${draft.date}:${draft.time}`;
export const draftSignature = draft => JSON.stringify([draft.eventId,draft.date,draft.time,draft.qty,[...draft.seats].sort(),draft.contact.trim()]);

export function defaultDraft(event) {
  return {eventId:event.id,date:event.dates[0] || '',time:event.times[0] || '',qty:2,seats:[],autoSeats:true,contact:'',phase:'select',step:0,orderId:null,review:null,scenario:'normal',error:null};
}
export function emptyRecord(event) {
  const record={version:1,revision:0,draft:defaultDraft(event),journal:[],blocked:false};
  record.draft.seats=inventory(event,record).adjacent;
  return record;
}
export function normalizeRecord(raw,event) {
  if(!raw || typeof raw !== 'object' || raw.version!==1)return emptyRecord(event);
  const record=clone(raw),source=record.draft;
  record.journal=Array.isArray(record.journal)?record.journal.filter(o=>o && typeof o.id==='string' && o.kind==='session' && o.sessionSnapshot?.eventId===event.id):[];
  record.revision=Number.isSafeInteger(record.revision)?record.revision:0;
  record.blocked=record.blocked===true;
  if(!source || typeof source!=='object'){
    if(record.journal.some(o=>LOCKED.includes(o.status))){record.draft=defaultDraft(event);record.draft.phase='unknown';record.blocked=true;return record;}
    record.draft=defaultDraft(event);return record;
  }
  const active=record.journal.find(o=>o.id===source.orderId);
  if(source.orderId && !active || LOCKED.includes(source.phase) && !active){record.draft={...defaultDraft(event),orderId:typeof source.orderId==='string'?source.orderId:null,phase:'unknown'};record.blocked=true;return record;}
  const fact=active && (LOCKED.includes(active.status) || active.status==='paid')?active.sessionSnapshot:source;
  record.draft={...defaultDraft(event),...fact,eventId:event.id,phase:active && (LOCKED.includes(active.status)||active.status==='paid')?active.status:phases.includes(source.phase)?source.phase:'select',orderId:source.orderId || null};
  const d=record.draft;
  d.contact=typeof d.contact==='string'?d.contact.slice(0,254):'';
  d.quantityInput=typeof d.quantityInput==='string'?d.quantityInput.slice(0,24):null;
  d.scenario=SCENARIOS.includes(source.scenario)?source.scenario:'normal';
  d.step=Number.isInteger(source.step)?Math.min(3,Math.max(0,source.step)):0;
  d.review=source.review && typeof source.review==='object'?source.review:null;
  d.error=typeof source.error==='string'?source.error:null;
  d.seats=Array.isArray(d.seats)?d.seats.filter(s=>allSeats(event).includes(s)):[];
  if(!Number.isInteger(d.qty)||d.qty<1||d.qty>MAX_QTY){if(active){record.blocked=true;d.phase='unknown';}else d.qty=2;}
  if(!seated(event))d.seats=[];
  return record;
}
export function inventory(event,record,draft=record.draft) {
  const scenario=draft.date===event.dates[0]&&draft.time===event.times[0]?draft.scenario || 'normal':'normal',seats=allSeats(event);
  const taken=new Set(seated(event)?['A1','A2','C4'].filter(s=>seats.includes(s)):[]);
  let used=0;
  for(const order of record.journal || []){
    if(order.id===draft.orderId || !['paid',...LOCKED].includes(order.status))continue;
    const s=order.sessionSnapshot;
    if(!s || sessionKey(s)!==sessionKey(draft))continue;
    if(seated(event))s.seats.forEach(seat=>taken.add(seat));else used+=s.qty;
  }
  let remaining=seated(event)?seats.length-taken.size:Math.max(0,(event.capacity || 24)-used);
  if(scenario==='separated' && seated(event))seats.filter(s=>Number(s.slice(1))%2===0).forEach(s=>taken.add(s));
  if(scenario==='shortage'){
    const only=seats.find(s=>!taken.has(s));if(seated(event))seats.filter(s=>s!==only).forEach(s=>taken.add(s));
    remaining=Math.min(1,remaining);
  }
  if(scenario==='soldout'||scenario==='closed'){seats.forEach(s=>taken.add(s));remaining=0;}
  if(seated(event))remaining=seats.length-taken.size;
  const adjacent=[];
  if(seated(event))for(let row=0;row<(event.rows||4);row++){
    for(let start=1;start<=(event.columns||6)-draft.qty+1;start++){
      const group=Array.from({length:draft.qty},(_,n)=>`${String.fromCharCode(65+row)}${start+n}`);
      if(group.every(s=>!taken.has(s))){adjacent.push(...group);break;}
    }
    if(adjacent.length)break;
  }
  return {remaining,taken:[...taken],adjacent,closed:scenario==='closed',price:Number(event.price)+(scenario==='price-change'?100:0)};
}
export function selectionError(event,record,{contact=true}={}) {
  const d=record.draft,stock=inventory(event,record);
  if(record.blocked)return 'recovery';
  if(d.error==='quantity'||d.quantityInput!=null)return 'quantity';
  if(!event.dates.includes(d.date) || !event.times.includes(d.time))return 'session';
  if(!Number.isInteger(d.qty)||d.qty<1||d.qty>MAX_QTY)return 'quantity';
  if(stock.closed)return 'closed';
  if(stock.remaining<d.qty)return 'shortage';
  if(seated(event)&&(d.seats.length!==d.qty || new Set(d.seats).size!==d.qty || d.seats.some(s=>!allSeats(event).includes(s)||stock.taken.includes(s))))return 'seats';
  if(contact&&!validContact(d.contact))return 'contact';
  if(!Number.isFinite(stock.price)||stock.price<=0)return 'price';
  return null;
}
function chooseSeats(record,event) {
  const d=record.draft;
  if(!seated(event)){d.seats=[];return;}
  const stock=inventory(event,record);
  d.seats=d.autoSeats?stock.adjacent:d.seats.filter(s=>!stock.taken.includes(s)).slice(0,d.qty);
}
export function change(record,event,action) {
  const next=clone(record),d=next.draft;
  if(next.blocked || LOCKED.includes(d.phase) || d.phase==='paid')return next;
  if(action.type==='step'){d.step=Math.max(0,Math.min(3,Number(action.value)||0));return next;}
  if(action.type==='review'){
    d.error=selectionError(event,next);
    if(!d.error){const stock=inventory(event,next);d.phase='review';d.step=3;d.review={signature:draftSignature(d),unitPrice:stock.price,total:stock.price*d.qty};}
    return next;
  }
  if(action.type==='edit'){d.phase='select';d.review=null;d.error=null;return next;}
  const before=draftSignature(d);
  if(action.type==='contact'){d.contact=String(action.value).slice(0,254);}
  if(action.type==='date'&&event.dates.includes(action.value)){d.date=action.value;chooseSeats(next,event);}
  if(action.type==='time'&&event.times.includes(action.value)){d.time=action.value;chooseSeats(next,event);}
  if(action.type==='quantity'){
    const q=Number(action.value);
    if(!Number.isInteger(q)||q<1||q>MAX_QTY){d.quantityInput=String(action.value).slice(0,24);d.error='quantity';d.phase='select';d.review=null;return next;}
    d.quantityInput=null;d.qty=q;d.error=null;chooseSeats(next,event);
  }
  if(action.type==='seat'&&seated(event)&&allSeats(event).includes(action.value)&&!inventory(event,next).taken.includes(action.value)){
    d.autoSeats=false;
    if(d.seats.includes(action.value))d.seats=d.seats.filter(s=>s!==action.value);
    else if(d.seats.length<d.qty)d.seats.push(action.value);
    else{d.error='seat-limit';return next;}
  }
  if(action.type==='auto'){d.autoSeats=true;chooseSeats(next,event);}
  if(action.type==='clear-seats'){d.autoSeats=false;d.seats=[];}
  if(action.type==='scenario'&&SCENARIOS.includes(action.value)){
    d.scenario=action.value;d.error=null;
    // Do not silently reconfirm an already reviewed price or inventory.
    if(d.phase!=='review')chooseSeats(next,event);
    return next;
  }
  if(before!==draftSignature(d)){
    d.phase='select';d.review=null;d.error=null;
    if(d.orderId){d.orderId=null;}
  }
  next.revision++;return next;
}
export function startPayment(record,event,{id,now=Date.now(),companySnapshot={people:[],version:0},mode='form'}={}) {
  const next=clone(record),d=next.draft;
  if(next.blocked || LOCKED.includes(d.phase) || d.phase==='paid')return {record:next,error:'locked',order:null};
  const old=next.journal.find(o=>o.id===d.orderId);
  if(old && (LOCKED.includes(old.status)||old.status==='paid'))return {record:next,error:'locked',order:null};
  const error=selectionError(event,next);
  if(error){d.error=error;d.phase='select';d.review=null;return {record:next,error,order:null};}
  const stock=inventory(event,next),amount=stock.price*d.qty;
  if(d.phase!=='review'||!d.review||d.review.signature!==draftSignature(d)||d.review.unitPrice!==stock.price||d.review.total!==amount){d.error='changed';d.phase='select';d.review=null;return {record:next,error:'changed',order:null};}
  const orderId=old?.id || id;
  if(typeof orderId!=='string'||!orderId)return {record:next,error:'identity',order:null};
  const snapshot=clone({...d,phase:'processing',orderId,error:null});
  const timestamp=new Date(now).toISOString();
  const seatsLabel=seated(event)?d.seats.join(', '):null;
  const detail={ru:`${d.date}, ${d.time}${seatsLabel?'. Места: '+seatsLabel:'. Без выбора кресел'}`,en:`${d.date}, ${d.time}${seatsLabel?'. Seats: '+seatsLabel:'. Open seating'}`};
  const order=old?{...clone(old),updatedAt:timestamp,status:'processing',fulfillment:'pending',attempts:(old.attempts||1)+1}:{id:orderId,kind:'session',createdAt:timestamp,updatedAt:timestamp,status:'processing',fulfillment:'pending',total:amount,currency:'RUB',title:clone(event.name),companySnapshot:clone(companySnapshot),contact:d.contact.trim(),attempts:1,
    origin:{route:'/session',event:event.id,mode},sessionSnapshot:snapshot,
    items:[{id:`${orderId}-item`,productId:`session-${event.id}`,eventId:event.id,name:clone(event.name),quantity:d.qty,unitPrice:stock.price,subtotal:amount,date:d.date,time:d.time,seats:clone(d.seats),recipients:[]}],
    rights:Array.from({length:d.qty},(_,i)=>({id:`${orderId}-right-${i+1}`,name:clone(event.name),recipient:null,ready:false,qrPayload:`DEMO:SESSION:${orderId}:${i+1}`,detail:seated(event)?{ru:`${d.date}, ${d.time}. Место ${d.seats[i]}`,en:`${d.date}, ${d.time}. Seat ${d.seats[i]}`} : clone(detail)}))};
  d.phase='processing';d.orderId=orderId;d.error=null;
  next.journal=next.journal.filter(o=>o.id!==orderId).concat(order);next.revision++;
  return {record:next,order:clone(order),error:null};
}
export function settlePayment(record,id,outcome='normal',now=Date.now()) {
  const next=clone(record),order=next.journal.find(o=>o.id===id);
  if(!order || order.status!=='processing')return {record:next,order:order?clone(order):null};
  const status=['pending','unknown','failed','cancelled'].includes(outcome)?outcome:'paid';
  order.status=status;order.updatedAt=new Date(now).toISOString();
  order.fulfillment=status!=='paid'||outcome==='issuance-pending'?'pending':outcome==='partial'&&order.rights.length>1?'partial':'ready';
  order.rights=order.rights.map((right,i)=>({...right,ready:status==='paid'&&(order.fulfillment==='ready'||order.fulfillment==='partial'&&i===0)}));
  if(next.draft.orderId===id)next.draft.phase=status;
  next.revision++;return {record:next,order:clone(order)};
}
export function reconcile(record,id,result,now=Date.now()) {
  const next=clone(record),order=next.journal.find(o=>o.id===id);
  if(!order || !LOCKED.includes(order.status) || !['paid','failed'].includes(result))return {record:next,order:order?clone(order):null};
  order.status=result;order.updatedAt=new Date(now).toISOString();order.fulfillment=result==='paid'?'ready':'pending';
  order.rights=order.rights.map(right=>({...right,ready:result==='paid'}));
  if(next.draft.orderId===id){next.draft.phase=result;next.draft.error=null;}
  next.revision++;return {record:next,order:clone(order)};
}
export function recoverInterrupted(record) {
  const next=clone(record),order=next.journal.find(o=>o.id===next.draft.orderId);
  if(order?.status==='processing'){order.status='unknown';next.draft.phase='unknown';next.revision++;}
  return next;
}
export function mergeOrderUpdates(record,externalOrders=[]) {
  const next=clone(record);
  for(const order of next.journal){
    const external=externalOrders.find(o=>o.id===order.id&&o.kind==='session');
    if(!external || new Date(external.updatedAt).getTime()<new Date(order.updatedAt).getTime())continue;
    if(!['paid','failed','cancelled',...LOCKED].includes(external.status))continue;
    if(order.status==='paid'&&external.status!=='paid')continue;
    if(JSON.stringify(external.sessionSnapshot)!==JSON.stringify(order.sessionSnapshot))continue;
    order.status=external.status;
    order.updatedAt=external.updatedAt;
    order.rights=order.rights.map(right=>{const update=external.rights?.find(r=>r.id===right.id);return {...right,ready:order.status==='paid'&&(right.ready||update?.ready===true)};});
    const ready=order.rights.filter(r=>r.ready).length;
    order.fulfillment=ready===order.rights.length&&ready>0?'ready':ready>0?'partial':'pending';
    if(next.draft.orderId===order.id)next.draft.phase=order.status;
  }
  return next;
}
export function newBooking(record,event) {
  const next=clone(record);
  if(next.blocked||LOCKED.includes(next.draft.phase))return next;
  const previous=next.draft;
  next.draft={...defaultDraft(event),contact:previous.contact,qty:previous.qty,date:previous.date,time:previous.time};
  chooseSeats(next,event);next.revision++;return next;
}
export function resumeOrder(record,event,id) {
  const next=clone(record),order=next.journal.find(o=>o.id===id);
  if(next.blocked||LOCKED.includes(next.draft.phase)||!order||!['failed','cancelled'].includes(order.status))return next;
  if(!next.draft.orderId&&next.draft.phase==='select')next.savedDraft=clone(next.draft);
  next.draft={...clone(order.sessionSnapshot),phase:order.status,orderId:order.id,review:null,error:null};
  next.revision++;return next;
}
export function restoreSavedDraft(record,event) {
  const next=clone(record);
  if(next.blocked||LOCKED.includes(next.draft.phase)||!next.savedDraft)return next;
  next.draft=clone(next.savedDraft);next.savedDraft=null;next.draft.phase='select';next.draft.orderId=null;next.draft.review=null;
  chooseSeats(next,event);next.revision++;return next;
}
