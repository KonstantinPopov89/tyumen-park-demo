import {admissionSummary,admissionFacts,admissionSource} from './admission.js?v=r13';
import {t,loc,h,money,read,write,atomic,orders,navigate,refresh,notify,icon,contactValid,uid,storageAvailable} from './shared.js';
import {rides} from './data.js';
import {productCatalog} from './commerce-model.js?v=r10';
import {QUICK_CATEGORIES,itemKey,newQuickDraft,reconcileQuickCompany,quickItems,quickTotal,quickQuantity,changeQuickQuantity,changeQuickCategory,changeQuickRide,quickIssues,createQuickOrder,quickSignature,newQuickAttempt,activeQuickOrder,enterQuickRide,quickReturn} from './quick-model.js?v=r15';

function setFieldError(field,message=''){
  if(!field)return;
  if(message)field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');
  const note=(field.tagName==='FIELDSET'?field:field.parentElement)?.querySelector('[data-field-error]');
  if(note){note.textContent=message;note.hidden=!message;}
  const page=field.closest('.page'),summary=page?.querySelector('[data-qp-error],[data-co-error],[data-co-topup-error],[data-company-error]');
  if(summary)summary.classList.toggle('sr-only',[...page.querySelectorAll('[data-field-error]')].some(el=>!el.hidden&&el.textContent&&el.textContent===summary.textContent));
}
const KEY='quick-draft',catalog=productCatalog(rides);
const param=(p,k)=>typeof p?.get==='function'?p.get(k):p?.[k];
let error='',busy=false;
const reviewMode=()=>new URLSearchParams(location.search).get('review')==='1';
const errorText=code=>({quantity:t('Введите целое число от 0 до 8.','Enter a whole number from 0 to 8.'),empty:t('Выберите хотя бы один билет или пакет.','Choose at least one ticket or package.'),product:t('Проверьте выбранные билеты.','Please check your ticket selection.'),ride:t('Выберите аттракцион.','Choose an attraction.'),contact:t('Укажите email или телефон из 10-15 цифр, либо оставьте поле пустым.','Enter an email or a phone number of 10-15 digits, or leave this blank.'),changed:t('Заказ изменился в другой вкладке. Проверьте состав и сумму перед оплатой.','Your order changed in another tab. Check the items and total before paying.'),storage:t('Не удалось сохранить демозаказ. Выбор остался в форме.','Could not save your demo order. Your selection remains in the form.')}[code]||t('Проверьте состав заказа.','Please check the order.'));
function load(params,context={}){
  const locked=activeQuickOrder(orders());if(locked)return {order:locked,locked:true};
  let draft=read(KEY,null);const previous=draft&&orders().find(o=>o.id===(draft.orderId||draft.id));
  if(previous){
    if(param(params,'choose')==='1'&&context.intentEntry&&previous.status==='paid'&&previous.fulfillment==='ready')draft=null;
    else return {order:previous};
  }
  if(!draft||draft.version!==1||!Array.isArray(draft.items)||!Array.isArray(draft.people)){
    const category=param(params,'product')||'unlimited',ride=param(params,'ride');
    draft=newQuickDraft(uid('order'),read('company',null),category,rides.some(r=>r.id===ride)?ride:'ferris-wheel');write(KEY,draft);
  }
  const reconciled=reconcileQuickCompany(draft,read('company',null));if(JSON.stringify(reconciled)!==JSON.stringify(draft)){draft=reconciled;write(KEY,draft);}
  const selected=enterQuickRide(draft,param(params,'ride'),catalog,rides,context.intentEntry);
  if(JSON.stringify(selected)!==JSON.stringify(draft)){draft=selected;write(KEY,draft);}
  if(context.intentEntry)error='';
  return {draft};
}
const categories=()=>[
  ['unlimited',t('Безлимиты','Passes'),t('Личный билет на несколько аттракционов.','A personal pass for several rides.')],
  ['package',t('Пакеты','Bundles'),t('Катания для всей компании.','Rides to share with your group.')],
  ['single',t('Билеты','Tickets'),t('Одно катание или вход на площадку.','A single ride or venue admission.')]
];
function quantity(draft,product,rideId){
  const key=itemKey(product.id,rideId),count=quickQuantity(draft,key),invalid=Object.hasOwn(draft.quantityInputs||{},key);
  return `<fieldset class="qp-quantity"><legend>${product.personal?t('Сколько человек?','How many people?'):t('Сколько пакетов?','How many bundles?')}</legend><div class="qp-quantity-presets">${[1,2,3,4].map(n=>`<button type="button" class="chip" data-qp-quantity data-key="${h(key)}" data-product="${product.id}" data-ride="${h(rideId||'')}" data-value="${n}" aria-pressed="${count===n&&!invalid}">${n}</button>`).join('')}<button type="button" class="chip qp-other" data-qp-manual="${h(key)}" aria-expanded="${invalid||count>4}">${t('Другое','Other')}</button></div><div class="qp-custom" data-qp-custom-wrap="${h(key)}" ${invalid||count>4?'':'hidden'}><label for="qp-qty-${h(key)}">${t('Количество от 0 до 8','Quantity from 0 to 8')}</label><input id="qp-qty-${h(key)}" type="text" inputmode="numeric" autocomplete="off" maxlength="3" data-qp-custom aria-describedby="qp-qty-note-${h(key)} qp-qty-error-${h(key)}" data-key="${h(key)}" data-product="${product.id}" data-ride="${h(rideId||'')}" value="${h(invalid?draft.quantityInputs[key]:count)}" ${invalid?'aria-invalid="true"':''}><small id="qp-qty-note-${h(key)}">${t('0 убирает товар из заказа.','0 removes this item from your order.')}</small><small class="error" id="qp-qty-error-${h(key)}" data-field-error ${invalid?'':'hidden'}>${invalid?errorText('quantity'):''}</small></div></fieldset>`;
}
function rideRestrictions(ride){
  if(!ride)return '';
  return `<div class="admission-inline"><p class="fine">${h(admissionSummary(ride))}</p><details><summary>${t('Ограничения','Restrictions')}</summary><dl>${admissionFacts(ride)}</dl><a class="text-link" href="${h(admissionSource(ride)||ride.source)}" target="_blank" rel="noopener">${t('Правила на сайте парка','Rules on the park website')}</a></details></div>`;
}
function product(draft,p,rideId=null){
  const ride=rides.find(r=>r.id===rideId),name=p.id==='single'&&ride?loc(ride.name):loc(p.name),key=itemKey(p.id,rideId);
  const included=p.rideIds.map(id=>rides.find(r=>r.id===id)).filter(Boolean);
  return `<article class="qp-product" data-qp-product="${h(key)}"><div class="qp-product-heading"><h2>${h(name)}</h2><p class="qp-price"><strong>${money(p.price)}</strong><span>${p.personal?t('за человека','per person'):t('за пакет','per bundle')}</span></p></div><p class="qp-description">${h(loc(p.description))}</p>${p.id==='single'?`<label class="field qp-ride-choice"><span class="field-label">${t('Аттракцион','Attraction')}</span><select data-qp-ride>${rides.map(r=>`<option value="${h(r.id)}" ${r.id===rideId?'selected':''}>${h(loc(r.name))}</option>`).join('')}</select></label>`:''}${p.id==='single'?rideRestrictions(ride):''}${quantity(draft,p,rideId)}<details class="qp-product-terms"><summary>${t('Что входит и как использовать','Included rides and conditions')}</summary><p>${h(loc(p.validity))}.</p>${included.length?`<ul>${included.map(r=>`<li>${h(loc(r.name))}</li>`).join('')}</ul>`:''}<p>${t('Условия приведены для демонстрации. Реальный допуск и правила уточняйте у парка.','These are demonstration conditions. Check actual admission and rules with the park.')}</p></details></article>`;
}
function summary(draft){
  const items=quickItems(draft,catalog,rides),total=quickTotal(draft,catalog,rides);
  return `<div class="qp-summary-heading"><h2>${t('Ваш заказ','Your order')}</h2><strong data-qp-total>${money(total)}</strong></div>${items.length?`<ul class="qp-cart-items">${items.map(item=>`<li><div><h3>${h(loc(item.name))}</h3><p>${item.quantity} × ${money(item.price)}</p><span class="qp-item-note">${item.personal?t('Личный демобилет','Personal demo ticket'):t('Общий пакет катаний','Shared ride bundle')}</span></div><div class="qp-item-end"><strong>${money(item.total)}</strong><button class="text-link" type="button" data-qp-remove="${h(item.key)}" aria-label="${h(t('Убрать ','Remove ')+loc(item.name))}">${t('Убрать','Remove')}</button></div></li>`).join('')}</ul>`:`<p class="qp-empty">${t('Пока ничего не выбрано. Укажите количество нужных билетов.','Nothing selected yet. Choose the quantity of the tickets you want.')}</p>`}`;
}
function orderResult(order,locked=false,returnTo=''){
  return `<section class="page qp-page qp-resume"><a class="back-link" href="#${h(returnTo||'/home')}">${icon('back')}${returnTo?t('К статусам аттракционов','Back to ride statuses'):t('На главную','Home')}</a><h1>${locked?t('Проверьте сохраненную оплату','Check your saved payment'):t('Ваш заказ сохранен','Your order is saved')}</h1><p>${locked?t('Сначала проверьте результат этой операции. Повторная оплата не нужна.','Check this transaction first. Do not pay again.'):t('Билеты и результат доступны в истории покупок.','Your tickets and result are available in your purchase history.')}</p><p><strong>${money(order.total)}</strong></p><a class="primary" href="#/tickets?order=${encodeURIComponent(order.id)}">${t('Открыть заказ','Open order')}${icon('arrow')}</a>${!locked&&order.status==='paid'&&order.fulfillment==='ready'?`<button class="secondary" type="button" data-qp-new>${t('Выбрать новые билеты','Choose new tickets')}</button>`:''}${!locked&&['failed','cancelled'].includes(order.status)?`<button class="secondary" type="button" data-qp-edit>${t('Изменить выбор','Edit selection')}</button>`:''}</section>`;
}
export function render(route,params,context={}){
  const state=load(params,context),returnTo=quickReturn(param(params,'return'));
  const back=returnTo?`<a class="back-link" href="#${h(returnTo)}">${icon('back')}${t('К статусам аттракционов','Back to ride statuses')}</a>`:'';
  if(state.order)return orderResult(state.order,state.locked,returnTo);
  const draft=state.draft,category=QUICK_CATEGORIES.includes(draft.category)?draft.category:'unlimited';
  const products=category==='unlimited'?['mini-pass3','park-pass27']:category==='package'?['package10']:['single','venue-entry'];
  const issue=quickIssues(draft,catalog,rides),disabled=issue.length>0||!storageAvailable();
  const legacy=read('commerce-draft',null),hasLegacy=legacy&&!legacy.initialSuggestion&&!legacy.orderId&&!orders().some(o=>o.id===legacy.id)&&legacy.lines?.some(line=>line.quantity>0);
  return `<section class="page qp-page" data-qp-snapshot="${h(quickSignature(draft))}">${back}<nav class="qp-modes" aria-label="${t('Вариант покупки','Purchase route')}"><a href="#/quick?product=unlimited" aria-current="page">${t('Быстрая покупка','Quick purchase')}</a><a href="#/discover">${t('Подобрать аттракционы','Find attractions')}</a></nav><div class="qp-heading"><h1>${t('Выберите билеты','Choose tickets')}</h1><p>${t('Выберите формат и количество билетов.','Choose your ticket type and quantity.')}</p></div>${hasLegacy?`<p class="qp-previous-order"><a class="text-link" href="#/checkout">${t('Продолжить ранее выбранный заказ','Continue your earlier order')}</a></p>`:''}<nav class="qp-tabs" aria-label="${t('Вид покупки','Ticket category')}">${categories().map(([id,name,description])=>`<button type="button" data-qp-category="${id}" aria-pressed="${category===id}"><strong>${name}</strong><span>${description}</span></button>`).join('')}</nav><div class="qp-layout"><div class="qp-products">${products.map(id=>product(draft,catalog.find(p=>p.id===id),id==='single'?draft.displayRide:null)).join('')}</div><aside class="qp-summary" tabindex="-1"><div data-qp-cart>${summary(draft)}</div><p class="qp-delivery-note">${t('Демобилеты появятся здесь сразу. Деньги не списываются.','Demo tickets appear here immediately. No money is charged.')}</p><details class="qp-contact"><summary>${t('Добавить контакт по желанию','Add an optional contact')}</summary><label class="field"><span class="field-label" id="qp-contact-label">Email ${t('или телефон','or phone')}</span><input type="text" data-qp-contact aria-labelledby="qp-contact-label" aria-describedby="qp-contact-note qp-contact-error" value="${h(draft.contact)}" autocomplete="off" placeholder="${t('Можно оставить пустым','You can leave this blank')}"><small id="qp-contact-note">${t('Контакт останется в этом браузере. Письма и SMS не отправляются.','Your contact stays in this browser. No email or SMS is sent.')}</small><small class="error" id="qp-contact-error" data-field-error hidden></small></label></details><details class="qp-conditions"><summary>${t('Все условия демопокупки','All demo purchase conditions')}</summary><p>${t('Все цены условные. Демобилеты не действуют для прохода. Возраст, рост и правила сопровождения уточняйте у парка перед визитом.','All prices are samples. Demo tickets do not grant admission. Check age, height and accompanying-adult rules with the park before visiting.')}</p><p>${t('Личный демобилет можно получить без имени получателя. Если компания уже сохранена, используем ее участников. Дополнительные билеты останутся без назначенного получателя.','Personal demo tickets do not require a guest name. We use your saved group if available. Extra tickets remain unassigned.')}</p></details>${reviewMode()?`<details class="qp-diagnostics"><summary>${t('Проверка демооплаты','Demo payment test')}</summary><label>${t('Результат','Result')}<select data-qp-outcome>${['success','cancel','fail','pending','unknown','partial','delay'].map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label></details>`:''}</aside></div><p class="qp-error ${issue.includes('quantity')&&(!error||error===errorText('quantity'))?'sr-only':''}" data-qp-error role="status">${h(error||(!storageAvailable()?t('Браузер запретил сохранение. Оформление образца недоступно.','Browser storage is blocked. Sample checkout is unavailable.'):issue.includes('quantity')?errorText('quantity'):''))}</p><div class="qp-dock"><button class="qp-dock-total" type="button" data-qp-cart-view aria-label="${t('Показать состав и сумму заказа','Show order items and total')}"><strong data-qp-total>${money(quickTotal(draft,catalog,rides))}</strong><span>${t('Показать заказ','Show order')}</span></button><button class="primary" type="button" data-qp-pay ${disabled?'disabled':''}>${t('Оплатить в демо','Pay in demo')} · <span data-qp-pay-total>${money(quickTotal(draft,catalog,rides))}</span></button></div></section>`;
}
function sync(root,draft){
  const box=root.querySelector('[data-qp-snapshot]');if(box)box.dataset.qpSnapshot=quickSignature(draft);
  root.querySelector('[data-qp-cart]').innerHTML=summary(draft);
  root.querySelectorAll('[data-qp-total],[data-qp-pay-total]').forEach(el=>el.textContent=money(quickTotal(draft,catalog,rides)));
  const issues=quickIssues(draft,catalog,rides);root.querySelector('[data-qp-pay]').disabled=issues.length>0||busy||!storageAvailable();
  root.querySelector('[data-qp-error]').textContent=error||(issues.includes('quantity')?errorText('quantity'):'');
  root.querySelector('[data-qp-error]').classList.toggle('sr-only',issues.includes('quantity')&&(!error||error===errorText('quantity')));
  root.querySelectorAll('[data-qp-quantity]').forEach(el=>el.setAttribute('aria-pressed',String(!Object.hasOwn(draft.quantityInputs||{},el.dataset.key)&&quickQuantity(draft,el.dataset.key)===Number(el.dataset.value))));
}
function save(update){const draft=read(KEY,null);if(!draft||draft.orderId||orders().some(o=>o.id===draft.id))return null;const next=update(draft);write(KEY,next);return next;}
async function pay(root){
  if(busy)return;const locked=activeQuickOrder(orders());if(locked){navigate(`/tickets?order=${encodeURIComponent(locked.id)}`);return;}
  const draft=read(KEY,null);if(!draft)return;const previous=orders().find(o=>o.id===(draft.orderId||draft.id));if(previous){navigate(`/tickets?order=${encodeURIComponent(previous.id)}`);return;}
  const expected=root.querySelector('[data-qp-snapshot]')?.dataset.qpSnapshot;
  if(expected!==quickSignature(draft)){error=errorText('changed');refresh();notify(error);return;}
  const issues=quickIssues(draft,catalog,rides);if(issues.length){error=errorText(issues[0]);sync(root,draft);const invalid=root.querySelector('[data-qp-custom][aria-invalid="true"]');invalid?.focus();return;}
  const contact=root.querySelector('[data-qp-contact]')?.value||'';if(!contactValid(contact)){error=errorText('contact');root.querySelector('[data-qp-error]').textContent=error;const field=root.querySelector('[data-qp-contact]');field.closest('details').open=true;setFieldError(field,error);field.focus();return;}
  draft.contact=contact.trim();busy=true;error='';const button=root.querySelector('[data-qp-pay]');button.disabled=true;button.textContent=t('Сохраняем демозаказ...','Saving demo order...');let result;
  try{
    const outcome=reviewMode()?root.querySelector('[data-qp-outcome]')?.value||'success':'success';
    await atomic('orders',rows=>{result=(rows||[]).find(o=>o.id===draft.id)||activeQuickOrder(rows);if(result)return rows;if(expected!==quickSignature(read(KEY,null)))throw new Error('cart-changed');result=createQuickOrder(draft,catalog,rides,outcome);return [...(rows||[]),result];},[]);
    if(result.id===draft.id){draft.orderId=result.id;write(KEY,draft);}navigate(`/tickets?order=${encodeURIComponent(result.id)}`);
  }catch(e){busy=false;error=errorText(e.message==='cart-changed'?'changed':'storage');refresh();notify(error);}finally{busy=false;}
}
export function bind(root,route,params){
  let active=true;
  const click=e=>{
    const button=e.target.closest('button');if(!button||!root.contains(button)||button.disabled)return;
    if(button.hasAttribute('data-qp-pay')){pay(root);return;}
    if(button.hasAttribute('data-qp-cart-view')){const summary=root.querySelector('.qp-summary');summary?.scrollIntoView({block:'start',behavior:'auto'});summary?.focus({preventScroll:true});return;}
    if(button.hasAttribute('data-qp-new')){if(activeQuickOrder(orders())){refresh();return;}write(KEY,newQuickDraft(uid('order'),read('company',null),'unlimited'));error='';refresh();return;}
    if(button.hasAttribute('data-qp-edit')){const draft=read(KEY,null),old=draft&&orders().find(o=>o.id===(draft.orderId||draft.id));if(!draft||!['failed','cancelled'].includes(old?.status))return;write(KEY,newQuickAttempt(draft,uid('order')));error='';refresh();return;}
    if(button.dataset.qpCategory){save(d=>changeQuickCategory(d,button.dataset.qpCategory));error='';refresh();return;}
    if(button.hasAttribute('data-qp-manual')){const key=button.dataset.qpManual,wrap=[...root.querySelectorAll('[data-qp-custom-wrap]')].find(el=>el.dataset.qpCustomWrap===key);if(wrap){wrap.hidden=false;button.setAttribute('aria-expanded','true');wrap.querySelector('input').focus();}return;}
    let result;
    if(button.hasAttribute('data-qp-quantity'))result=save(d=>changeQuickQuantity(d,button.dataset.product,button.dataset.ride||null,button.dataset.value,catalog,rides).draft);
    if(button.hasAttribute('data-qp-remove'))result=save(d=>{const item=d.items.find(x=>x.key===button.dataset.qpRemove);return item?changeQuickQuantity(d,item.productId,item.rideId,0,catalog,rides).draft:d;});
    if(result){error='';refresh();}
  };
  const input=e=>{const el=e.target;
    if(el.matches('[data-qp-custom]')){let result;const next=save(d=>{result=changeQuickQuantity(d,el.dataset.product,el.dataset.ride||null,el.value,catalog,rides);return result.draft;});if(next){error=result.error?errorText(result.error):'';sync(root,next);setFieldError(el,error);}}
    if(el.matches('[data-qp-contact]')){setFieldError(el);const next=save(d=>({...d,contact:el.value}));error='';if(next)sync(root,next);}
  };
  const change=e=>{if(e.target.matches('[data-qp-ride]')){save(d=>changeQuickRide(d,e.target.value,rides));error='';refresh();}};
  const external=e=>{if(active&&e.detail?.external&&['orders',KEY,'company','storage'].includes(e.detail.key))refresh();};
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);window.addEventListener('tmn:change',external);
  return ()=>{active=false;root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);window.removeEventListener('tmn:change',external);};
}
