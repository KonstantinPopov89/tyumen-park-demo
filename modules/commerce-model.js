// Pure demo commerce model. No network, DOM, storage, or real payment actions.
export const CATALOG_VERSION = 'tmn-demo-20261026-v1';
export const clone = value => JSON.parse(JSON.stringify(value));
const stamp = () => new Date().toISOString();
const safeQty = value => String(value).trim()!=='' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 8 ? Number(value) : null;
export function productCatalog(rides = []) {
  const ids = rides.map(r => r.id);
  const mini = ['ferris-wheel', 'royal-carousel', 'autodrom'].filter(id => ids.includes(id));
  return [
    {id:'mini-pass3',name:{ru:'Безлимит на 3 аттракциона',en:'Three-ride pass'},price:1400,personal:true,rideIds:mini,description:{ru:'Личный демонстрационный безлимит на Колесо обозрения, Роскошную карусель и Автодром.',en:'A personal demo pass for the Ferris wheel, Royal carousel and Bumper cars.'},validity:{ru:'Один демонстрационный визит',en:'One demo visit'}},
    {id:'park-pass27',name:{ru:'Безлимит на парк',en:'Park pass'},price:2900,personal:true,rideIds:ids,description:{ru:'Личный демонстрационный безлимит на весь локальный каталог. Реальные правила допуска остаются отдельными.',en:'A personal demo pass for the complete local catalogue. Actual admission rules remain separate.'},validity:{ru:'Один демонстрационный визит',en:'One demo visit'}},
    {id:'package10',name:{ru:'10 катаний вместе',en:'10 rides together'},price:3200,personal:false,rideIds:ids,uses:10,description:{ru:'Общий запас из 10 демонстрационных катаний для выбранной компании. Один QR на каждый пакет.',en:'A shared allowance of 10 demo rides for the selected group. One QR for each package.'},validity:{ru:'Один демонстрационный визит',en:'One demo visit'}},
    {id:'single',name:{ru:'Разовый билет',en:'Single ride ticket'},price:500,personal:true,rideIds:[],description:{ru:'Один демонстрационный билет на выбранный аттракцион для указанного участника.',en:'One demo ride on the selected attraction for the assigned guest.'},validity:{ru:'Одно демонстрационное катание',en:'One demo ride'}},
    {id:'venue-entry',name:{ru:'Билет на площадку',en:'Venue admission'},price:600,personal:true,rideIds:[],description:{ru:'Отдельный демонстрационный вход на площадку события. Без места и без катаний.',en:'A separate demo admission to an event venue. No seat and no rides included.'},validity:{ru:'Один демонстрационный вход',en:'One demo admission'}}
  ];
}
export function makeLine(id, productId, catalog, people, rideId, quantity) {
  const product = catalog.find(p => p.id === productId) || catalog[0];
  const q = safeQty(quantity) ?? Math.max(1, Math.min(people.length, 8));
  return {id,productId:product.id,rideId:product.id === 'single' ? rideId || 'ferris-wheel' : null,quantity:q,recipients:product.personal ? Array.from({length:q},(_,i) => people[i]?.id || null) : [],sharedPeople:product.personal ? [] : people.map(p => p.id)};
}
export function resizeLine(line, count) {
  const q = safeQty(count); if(q === null) return {line,error:'quantity'};
  const next=clone(line);next.quantity=q;
  next.recipients=Array.from({length:q},(_,i)=>next.recipients?.[i] || null);
  return {line:next,error:null};
}
export function reconcileDraft(draft, group) {
  const next=clone(draft), valid=new Set(group.people.map(p=>p.id));
  next.companySnapshot=clone(group.people);next.companyVersion=group.version;
  next.lines=next.lines.map(l=>({...l,recipients:(l.recipients||[]).map(id=>valid.has(id)?id:null),sharedPeople:(l.sharedPeople||[]).filter(id=>valid.has(id))}));
  return next;
}
export function lineDetails(line, catalog, rides, people) {
  const p=catalog.find(x=>x.id===line.productId); if(!p) return null;
  const ride=rides.find(r=>r.id===line.rideId);
  const name=p.id==='single' && ride ? ride.name : p.name;
  const rideIds=p.id==='single'?[line.rideId]:clone(p.rideIds);
  const snapshotPerson=id=>{const i=people.findIndex(x=>x.id===id);return i<0?null:{...clone(people[i]),displayIndex:people[i].displayIndex??i};};
  return {...clone(line),name:clone(name),description:clone(p.description),unitPrice:p.price,subtotal:p.price*line.quantity,personal:p.personal,rideIds,includedRides:rideIds.map(id=>rides.find(r=>r.id===id)).filter(Boolean).map(r=>({id:r.id,name:clone(r.name)})),validity:clone(p.validity),uses:p.uses||null,recipients:(line.recipients||[]).map(snapshotPerson),sharedRecipients:(line.sharedPeople||[]).map(snapshotPerson).filter(Boolean)};
}
export function validateDraft(draft,catalog,rides) {
  const issues=[];const people=draft.companySnapshot||[];
  if(!draft.lines.length || !draft.lines.some(l=>l.quantity>0))issues.push('empty');
  for(const l of draft.lines) {
    const p=catalog.find(x=>x.id===l.productId);if(!p){issues.push('product');continue;}
    if(safeQty(l.quantity)===null)issues.push('quantity');
    if(p.id==='single'&&!rides.some(r=>r.id===l.rideId))issues.push('ride');
    if(p.personal && l.quantity>0 && (l.recipients.length!==l.quantity||l.recipients.some(id=>!people.some(p=>p.id===id))))issues.push('recipients');
    if(!p.personal && l.quantity>0 && !(l.sharedPeople||[]).some(id=>people.some(p=>p.id===id)))issues.push('shared');
  }
  if(draft.delivery==='card'&&!/^\d{6,16}$/.test(draft.cardNumber||''))issues.push('card');
  return [...new Set(issues)];
}
export function createOrder(draft,catalog,rides,outcome='success',now=stamp()) {
  const issues=validateDraft(draft,catalog,rides);if(issues.length)throw new Error(issues.join(','));
  const people=clone(draft.companySnapshot).map((p,i)=>({...p,displayIndex:i})),items=draft.lines.filter(l=>l.quantity>0).map(l=>lineDetails(l,catalog,rides,people));
  const status=({success:'paid',partial:'paid',delay:'paid',pending:'pending',unknown:'unknown',fail:'failed',cancel:'cancelled'})[outcome]||'paid';
  const rights=[];
  for(const item of items)for(let i=0;i<item.quantity;i++){
    const rid=`${draft.id}-${item.id}-${i+1}`;
    rights.push({id:rid,name:clone(item.name),recipient:item.personal?clone(item.recipients[i]):null,recipients:item.personal?[]:clone(item.sharedRecipients),ready:false,qrPayload:`DEMO:TMN:${rid}`,detail:clone(item.validity),productId:item.productId,rideIds:clone(item.rideIds),includedRides:clone(item.includedRides),uses:item.uses,delivery:draft.delivery==='card'?'card':'ticket'});
  }
  rights.forEach((r,i)=>{r.ready=status==='paid'&&outcome!=='delay'&&(outcome!=='partial'||i===0);});
  const n=rights.filter(r=>r.ready).length;
  return {id:draft.id,kind:'commerce',createdAt:now,updatedAt:now,status,fulfillment:n===rights.length?'ready':n?'partial':'pending',total:items.reduce((n,x)=>n+x.subtotal,0),currency:'RUB',title:{ru:'Аттракционы и билеты',en:'Attractions and tickets'},companySnapshot:people,items,rights,contact:draft.contact||'',delivery:{mode:draft.delivery||'ticket',cardNumber:draft.delivery==='card'?draft.cardNumber:null},origin:{route:'/checkout'},catalogVersion:CATALOG_VERSION,demo:true};
}
export function readyRights(order) {return order?.status==='paid'?(order.rights||[]).filter(r=>r.ready===true):[];}
export function settleOrder(order,outcome,now=stamp()) {
  const next=clone(order);next.updatedAt=now;
  if(order.status==='paid'&&order.fulfillment==='ready')return next;
  const status=({success:'paid',partial:'paid',delay:'paid',pending:'pending',unknown:'unknown',fail:'failed',cancel:'cancelled'})[outcome];
  if(!status)return next;
  // A paid order cannot be turned into a failed payment by a status check.
  if(order.status==='paid'&&status!=='paid')return next;
  next.status=status;next.rights=(next.rights||[]).map((r,i)=>({...r,ready:status==='paid'&&(r.ready||outcome==='success'||(outcome==='partial'&&i===0))}));
  const n=next.rights.filter(r=>r.ready).length;next.fulfillment=n===next.rights.length?'ready':n?'partial':'pending';return next;
}
export function newTopupLedger() {return {version:1,operations:[],activeId:null,balanceByCard:{}};}
export function validTopup(card,amount) {return /^\d{6,16}$/.test(String(card))&&Number.isInteger(Number(amount))&&Number(amount)>=100&&Number(amount)<=20000;}
export function startTopup(ledger,request,outcome='success',now=stamp()) {
  const next=clone(ledger||newTopupLedger());
  // The active operation stays active even after completion until an explicit new action.
  if(next.activeId&&next.operations.some(o=>o.id===next.activeId))return next;
  const previous=next.operations.find(o=>o.id===request.id);if(previous){next.activeId=previous.id;return next;}
  if(!validTopup(request.card,request.amount))throw new Error('invalid-topup');
  const payment=({success:'paid',delay:'paid',pending:'pending',unknown:'unknown',fail:'failed',cancel:'cancelled'})[outcome]||'paid';
  const op={id:request.id,card:String(request.card),amount:Number(request.amount),payment,credit:'pending',autoChecks:0,manualChecks:0,deferCredit:outcome==='delay',createdAt:now,updatedAt:now,creditedAt:null};
  next.operations.push(op);next.activeId=op.id;return next;
}
export function checkTopup(ledger,id,manual=false,resolve=null,now=stamp()) {
  const next=clone(ledger||newTopupLedger()),op=next.operations.find(o=>o.id===id);if(!op)return next;
  if(op.credit==='credited')return next;
  if(!manual&&op.autoChecks>=3)return next;
  if(manual)op.manualChecks=(op.manualChecks||0)+1;else op.autoChecks++;
  if(resolve==='success'){op.payment='paid';op.deferCredit=false;}
  else if(['pending','unknown','failed','cancelled'].includes(resolve)&&op.payment!=='paid')op.payment=resolve;
  if(op.payment==='paid'&&!op.deferCredit){op.credit='credited';op.creditedAt=now;next.balanceByCard[op.card]=(next.balanceByCard[op.card]||0)+op.amount;}
  op.updatedAt=now;return next;
}
export function canStartNewTopup(op) {return !op||op.credit==='credited'||['failed','cancelled'].includes(op.payment);}
export function clearTopupActive(ledger) {const next=clone(ledger||newTopupLedger()),op=next.operations.find(o=>o.id===next.activeId);if(canStartNewTopup(op))next.activeId=null;return next;}
