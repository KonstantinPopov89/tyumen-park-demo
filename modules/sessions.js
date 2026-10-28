import {t,lang,loc,h,money,read,atomic,company,orders,putOrder,navigate,refresh,notify,icon,uid,demoNote} from './shared.js';
import {events} from './data.js';
import {MAX_QTY,LOCKED,SCENARIOS,seated,allSeats,emptyRecord as emptySessionRecord,normalizeRecord as normalizeSessionRecord,inventory,selectionError,change,startPayment,settlePayment,reconcile,recoverInterrupted,newBooking,mergeOrderUpdates,resumeOrder,restoreSavedDraft} from './sessions-model.js?v=r10';

const inFlight=new Set();
const keyOf=event=>`session:${event.id}`;
const initialQuantity=()=>{const group=read('company',null);return Array.isArray(group?.people)?Math.max(1,Math.min(MAX_QTY,group.people.length)):2;};
const emptyRecord=event=>emptySessionRecord(event,initialQuantity());
const normalizeRecord=(raw,event)=>normalizeSessionRecord(raw,event,initialQuantity());
const param=(params,name)=>params?.get?params.get(name):params?.[name];
const eventList=()=>Array.isArray(events)?events:Object.values(events);
const eventFor=params=>eventList().find(e=>e.id===param(params,'event')) || eventList()[0];
const modeFor=params=>param(params,'mode')==='quiz'?'quiz':'form';
const reviewMode=()=>new URLSearchParams(location.search).get('review')==='1';
const routeFor=(event,mode,order)=>`/session?event=${encodeURIComponent(event.id)}&mode=${mode}${order?'&order='+encodeURIComponent(order):''}`;
const displayTitle=event=>loc(event.name).replace(/:\s*(демосеанс|demo session)$/i,'');
const dateText=date=>{try{return new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',weekday:'short',timeZone:'Asia/Yekaterinburg'}).format(new Date(`${date}T12:00:00+05:00`));}catch{return date;}};
const errorText=code=>({
  session:t('Выберите доступные дату и время примера.','Choose an available example date and time.'),
  quantity:t('Укажите целое число гостей от 1 до 8.','Enter a whole number of guests from 1 to 8.'),
  closed:t('Этот пример сеанса закрыт. Выберите другое время или событие.','This example session is closed. Choose another time or event.'),
  shortage:t('В этом примере недостаточно мест. Уменьшите количество или выберите другой сеанс.','This example has too few places. Reduce the quantity or choose another session.'),
  seats:t('Выберите по одному свободному месту для каждого гостя.','Choose one available seat for each guest.'),
  'seat-limit':t('Все места для вашей компании уже выбраны. Сначала снимите одно из выбранных мест.','All seats for your group are selected. Deselect one before choosing another.'),
  contact:t('Проверьте email или телефон: нужно от 10 до 15 цифр. Поле можно оставить пустым.','Check the email or phone number: use 10 to 15 digits. You may leave it empty.'),
  price:t('Не удалось проверить сумму. Вернитесь к выбору.','The amount could not be checked. Return to the selection.'),
  changed:t('Места или сумма изменились. Проверьте выбор и итог еще раз перед демонстрационной оплатой.','Seats or the amount changed. Review your selection and total again before demo payment.'),
  locked:t('Исход этого заказа еще не установлен. Повторная оплата заблокирована.','The result of this order is unresolved. Another payment is blocked.'),
  recovery:t('Не удалось безопасно восстановить заказ. Новая оплата заблокирована; проверьте историю.','The order could not be safely restored. New payment is blocked; check the history.'),
  storage:t('Не удалось сохранить изменение. Обновите страницу и проверьте сохраненный заказ.','The change could not be saved. Reload and check the saved order.')
}[code] || t('Проверьте параметры заказа.','Review the order details.'));

function switches(event,mode){return `<nav class="session-modes" aria-label="${h(t('Способ выбора сеанса','Session booking method'))}"><button type="button" class="chip" data-session-mode="form" aria-pressed="${mode==='form'}">${t('Вся форма','Full form')}</button><button type="button" class="chip" data-session-mode="quiz" aria-pressed="${mode==='quiz'}">${t('Шаг за шагом','Step by step')}</button></nav>`;}
function summary(event,record,{compact=false}={}){
  const d=record.draft,stock=inventory(event,record),order=record.journal.find(o=>o.id===d.orderId),amount=order&&['paid',...LOCKED,'failed','cancelled'].includes(d.phase)?order.total:stock.price*d.qty;
  return `<div class="session-summary ${compact?'is-compact':''}"><div><strong>${h(loc(order?.title || event.name))}</strong><span>${h(dateText(d.date))} · ${h(d.time)}</span><span>${t('Гостей','Guests')}: ${d.qty}${seated(event)?` · ${t('Места','Seats')}: ${h(d.seats.join(', ') || t('не выбраны','not selected'))}`:''}</span></div><strong class="session-summary-total">${money(amount)}</strong></div>`;
}
function dates(event,record){
  const d=record.draft;
  const times=event.times.map(time=>{
    const stock=inventory(event,record,{...d,time}),unavailable=stock.closed||stock.remaining===0,short=stock.remaining<d.qty;
    const status=stock.closed?t('Закрыт в демо','Closed in demo'):stock.remaining===0?t('Мест нет в демо','Full in demo'):t(`Свободно: ${stock.remaining}`,`${stock.remaining} available`);
    return `<button type="button" class="chip ${short&&!unavailable?'is-short':''}" data-session-time="${h(time)}" aria-pressed="${d.time===time}" ${unavailable?'disabled':''}><strong>${h(time)}</strong><span>${h(status)}</span></button>`;
  }).join('');
  return `<fieldset class="session-fieldset" id="session-dates"><legend>${t('Когда вы придете?','When will you visit?')}</legend><div class="session-date-options">${event.dates.map(date=>`<button type="button" class="chip" data-session-date="${h(date)}" aria-pressed="${d.date===date}">${h(dateText(date))}</button>`).join('')}</div><span class="field-label session-sub-label">${t('Время в Тюмени и места в демо','Tyumen time and demo availability')}</span><div class="session-time-options">${times}</div><p class="fine muted">${t('Даты, расписание и свободные места условные. Реального бронирования нет.','Dates, times and available places are illustrative. No real reservation is made.')}</p></fieldset>`;
}
function quantity(event,record){const d=record.draft;return `<fieldset class="session-fieldset" id="session-quantity"><legend>${t('Сколько гостей?','How many guests?')}</legend><div class="session-quantity-options">${[1,2,3,4].map(q=>`<button type="button" class="chip" data-session-qty="${q}" aria-pressed="${d.qty===q}">${q}</button>`).join('')}<button type="button" class="text-link" data-session-manual>${t('Другое количество','Another quantity')}</button></div><div class="session-manual" ${d.qty<=4&&d.quantityInput==null&&d.error!=='quantity'?'hidden':''}><label class="field-label" for="session-custom-quantity">${t('Гостей, от 1 до 8','Guests, from 1 to 8')}</label><input id="session-custom-quantity" class="field" type="number" min="1" max="${MAX_QTY}" step="1" inputmode="numeric" value="${h(d.quantityInput??d.qty)}" data-session-custom-qty aria-invalid="${d.error==='quantity'}" ${d.error==='quantity'?'aria-describedby="session-quantity-error"':''}>${d.error==='quantity'?`<p class="error" id="session-quantity-error">${errorText('quantity')}</p>`:''}</div><p class="fine muted">${t('Количество зрителей не меняет состав сохраненной компании.','The audience size does not change your saved group.')}</p></fieldset>`;}
function seats(event,record){
  const d=record.draft,stock=inventory(event,record);
  if(!seated(event))return `<div class="session-fieldset session-capacity" id="session-seats" tabindex="-1"><h2>${t('Без выбора кресел','Open seating')}</h2><p>${t('Выбрано мест','Places selected')}: <strong>${d.qty}</strong></p><p class="muted">${t('Свободно в локальном примере','Available in this local example')}: ${stock.remaining} ${t('из','of')} ${event.capacity||24}.</p><p class="fine muted">${t('Это проверка вместимости демосеанса, не резерв в парке.','This checks the demo capacity; it does not reserve a place at the park.')}</p></div>`;
  const cells=allSeats(event).map(seat=>{const taken=stock.taken.includes(seat),selected=d.seats.includes(seat);return `<button type="button" class="session-seat ${taken?'is-taken':''}" data-session-seat="${seat}" aria-label="${h(t('Место','Seat')+' '+seat+(taken?t(', занято в примере',', occupied in the example'):selected?t(', выбрано',', selected'):''))}" aria-pressed="${selected}" ${taken?'disabled':''}>${seat}</button>`;}).join('');
  return `<fieldset class="session-fieldset" id="session-seats"><legend>${t('Выберите места','Choose your seats')}</legend><div class="session-seat-toolbar"><p>${t('Выбрано','Selected')}: <strong>${d.seats.length} ${t('из','of')} ${d.qty}</strong></p><button type="button" class="text-link" data-session-auto>${t('Найти рядом','Find adjacent seats')}</button><button type="button" class="text-link" data-session-clear>${t('Снять выбор','Clear selection')}</button></div>${!stock.adjacent.length&&stock.remaining>=d.qty?`<p class="session-notice">${t('Такого количества мест рядом нет. Можно выбрать отдельные кресла на схеме.','There are no adjacent seats for this group. You can choose separate seats on the plan.')}</p>`:''}<div class="session-stage">${t('Сцена','Stage')}</div><div class="session-seat-scroll"><div class="session-seat-grid" style="--seat-columns:${event.columns||6}">${cells}</div></div><div class="session-seat-legend"><span>${t('Контур: свободно','Outline: available')}</span><span>${t('Синий: ваш выбор','Blue: selected')}</span><span>${t('Серый: занято','Grey: occupied')}</span></div><p class="fine muted">${t('Схема демонстрационная. Реального резерва мест нет.','This is a demonstration plan. No real seats are reserved.')}</p></fieldset>`;
}
function contact(record){return `<div class="session-contact"><label class="field-label" for="session-contact">${t('Email или телефон','Email or phone')} <span class="muted">${t('по желанию','optional')}</span></label><input class="field" id="session-contact" data-session-contact aria-invalid="${record.draft.error==='contact'}" ${record.draft.error==='contact'?'aria-describedby="session-contact-error"':''} type="text" autocomplete="off" maxlength="254" value="${h(record.draft.contact)}" placeholder="${h(t('Email или телефон','Email or phone'))}">${record.draft.error==='contact'?`<p class="error" id="session-contact-error">${errorText('contact')}</p>`:''}<p class="fine muted">${t('Контакт сохранится только в этом браузере. Сообщения не отправляются.','The contact stays in this browser. No messages are sent.')}</p></div>`;}
function simulation(record){
  if(!reviewMode()||record.readonly)return '';
  const labels={normal:['Обычный успех','Successful payment'],soldout:['Мест нет','Sold out'],shortage:['Осталось одно место','One place left'],separated:['Места раздельно','Separated seats'],closed:['Сеанс закрыт','Session closed'],'price-change':['Изменение цены +100','Price change +100'],pending:['Оплата ожидается','Payment pending'],unknown:['Исход неизвестен','Unknown result'],failed:['Оплата отклонена','Payment failed'],cancelled:['Оплата отменена','Payment cancelled'],partial:['Частичная выдача','Partial issuance'],'issuance-pending':['Выдача ожидается','Issuance pending']};
  return `<details class="session-review-tools"><summary>${t('Сценарии проверки','Review scenarios')}</summary>${!LOCKED.includes(record.draft.phase)&&record.draft.phase!=='paid'?`<label class="field-label" for="session-scenario">${t('Локальная симуляция','Local simulation')}</label><select class="field" id="session-scenario" data-session-scenario>${SCENARIOS.map(s=>`<option value="${s}" ${record.draft.scenario===s?'selected':''}>${t(...labels[s])}</option>`).join('')}</select>`:''}${LOCKED.includes(record.draft.phase)?`<p>${t('Завершить проверку того же заказа без новой попытки оплаты.','Reconcile the same order without another payment attempt.')}</p><div class="session-review-actions"><button type="button" class="secondary" data-session-resolve="paid">${t('Подтвердить успех','Confirm success')}</button><button type="button" class="secondary" data-session-resolve="failed">${t('Подтвердить отказ','Confirm failure')}</button></div>`:''}</details>`;
}
function activeResult(event,record,mode){
  const d=record.draft,o=record.journal.find(order=>order.id===d.orderId);
  const status={processing:[t('Проверяем заказ','Checking your order'),t('Подождите. Повторное действие не создаст новую оплату.','Please wait. Repeating the action will not create another payment.')],pending:[t('Ожидаем результат оплаты','Payment result pending'),t('Заказ сохранен. Проверяйте его состояние в истории, не оплачивайте снова.','Your order is saved. Check its state in history; do not pay again.')],unknown:[t('Результат пока неизвестен','The result is not known yet'),t('Заказ сохранен с прежним номером. Новая оплата заблокирована, пока исход не подтвержден.','The order keeps its original ID. Another payment is blocked until the result is confirmed.')],failed:[t('Демооплата отклонена','Demo payment failed'),t('Билеты не выданы. Можно снова проверить этот заказ перед новой попыткой.','No tickets were issued. You can review this order before trying again.')],cancelled:[t('Демооплата отменена','Demo payment cancelled'),t('Билеты не выданы. Ваш выбор сохранен.','No tickets were issued. Your selection is saved.')],paid:[t('Демонстрационный заказ оформлен','Your demo order is complete'),o?.fulfillment==='ready'?t('Образцы билетов доступны в общей истории.','Ticket samples are available in your order history.'):t('Демооплата завершена, выдача образцов еще не полная. Повторная оплата не требуется.','Demo payment is complete; ticket samples are not all ready yet. Do not pay again.')]};
  const [title,text]=record.blocked?[t('Проверьте сохраненный заказ','Check your saved order'),errorText('recovery')]:status[d.phase]||status.unknown;
  return `<div class="panel session-result" role="status"><h2>${title}</h2><p>${text}</p>${record.blocked?'':summary(event,record)}${o?`<p class="fine muted">${t('Номер','Order ID')}: ${h(o.id)}</p>`:''}<div class="session-result-actions">${o?`<button type="button" class="primary" data-session-ticket="${h(o.id)}">${t('Открыть заказ','Open order')}</button>`:''}<button type="button" class="secondary" data-session-history>${t('История покупок','Order history')}</button>${['failed','cancelled'].includes(d.phase)&&!record.blocked&&!record.readonly?`<button type="button" class="text-link" data-session-retry>${t('Снова проверить заказ','Review the order again')}</button>`:''}${d.phase==='paid'&&!record.blocked&&!record.readonly?`<button type="button" class="text-link" data-session-new>${t('Выбрать еще один сеанс','Book another session')}</button>`:''}</div></div>${simulation(record)}`;
}
function dock(event,record,mode){
  const d=record.draft;if(record.blocked||['paid','failed','cancelled',...LOCKED].includes(d.phase))return '';
  const review=d.phase==='review',stock=inventory(event,record);
  let label=review?t('Оплатить в демо','Pay in demo'):t('Проверить заказ','Review order'),focus='';
  if(mode==='quiz'&&!review){if(d.step===1)label=t('К выбору гостей','Choose guests');else if(d.step===0&&seated(event))label=t('Выбрать места','Choose seats');}
  if(mode==='form'&&!review){const error=selectionError(event,record);if(error==='seats'){focus='session-seats';label=t('Выбрать места','Choose seats');}else if(error==='contact'){focus='session-contact';label=t('Исправить контакт','Correct contact');}else if(error==='quantity'){focus='session-quantity';label=t('Выбрать количество','Choose quantity');}else if(['closed','shortage','session'].includes(error)){focus='session-dates';label=t('Другой сеанс','Another session');}}
  return `<aside class="session-dock"><div><span>${h(dateText(d.date))} · ${h(d.time)}</span><strong>${t('Гостей','Guests')}: ${d.qty} · ${money(stock.price*d.qty)}</strong></div><button type="button" class="primary" ${focus?`data-session-focus="${focus}"`:review?'data-session-pay':mode==='quiz'?'data-session-next':'data-session-review'}>${label}</button></aside>`;
}
function quizFields(event,record){
  const d=record.draft,step=d.step===3?0:d.step,steps=[[0,t('Гости','Guests')],...(seated(event)?[[2,t('Места','Seats')]]:[]),[3,t('Проверка','Review')]];
  return `<div class="session-progress" aria-label="${h(t('Шаги подбора','Booking steps'))}">${steps.map(([value,label],i)=>`<button type="button" data-session-step="${value}" aria-current="${step===value?'step':'false'}">${i+1}<span>${label}</span></button>`).join('')}</div><div class="session-quiz-date"><span>${h(dateText(d.date))} · ${h(d.time)}</span><button type="button" class="text-link" data-session-step="${step===1?0:1}">${step===1?t('К гостям','Back to guests'):t('Изменить дату','Change date')}</button></div>${step===1?dates(event,record):step===2?seats(event,record):quantity(event,record)}${step!==1?`<details class="session-optional-contact" ${d.error==='contact'?'open':''}><summary>${t('Добавить контакт по желанию','Add an optional contact')}</summary>${contact(record)}</details>`:''}<div class="session-inline-actions">${step===2?`<button type="button" class="secondary" data-session-step="0">${t('Назад','Back')}</button>`:''}<button type="button" class="primary" data-session-next>${step===1?t('К выбору гостей','Choose guests'):step===0&&seated(event)?t('Выбрать места','Choose seats'):t('Проверить заказ','Review order')}</button></div>`;
}
export function render(route,params){
  const event=eventFor(params);if(!event)return `<section class="page empty"><h1>${t('События пока не добавлены','No events have been added')}</h1></section>`;
  const mode=modeFor(params);let record=normalizeRecord(read(keyOf(event),null),event);
  const requested=param(params,'order');
  if(requested&&requested!==record.draft.orderId){
    const historical=record.journal.find(o=>o.id===requested);
    if(!historical)return `<section class="page empty"><h1>${t('Заказ не найден','Order not found')}</h1><p>${t('Текущий выбор сохранен. Откройте доступные заказы в истории.','Your current selection is saved. Open the available orders in history.')}</p><button class="primary" data-session-history>${t('История покупок','Order history')}</button></section>`;
    record={...record,readonly:true,activeLocked:record.blocked||LOCKED.includes(record.draft.phase),draft:{...historical.sessionSnapshot,orderId:historical.id,phase:historical.status,error:null}};
  }
  const d=record.draft;
  const active=record.blocked || ['paid','failed','cancelled',...LOCKED].includes(d.phase);
  let content;
  if(active)content=activeResult(event,record,mode);
  else if(d.phase==='review')content=`<div class="panel session-order-review" tabindex="-1" id="session-order-review"><h2>${t('Проверьте места и сумму','Review the places and amount')}</h2>${summary(event,record)}<dl class="session-facts"><div><dt>${t('Один билет','One ticket')}</dt><dd>${money(inventory(event,record).price)}</dd></div><div><dt>${t('Контакт','Contact')}</dt><dd>${h(d.contact || t('Не указан','Not provided'))}</dd></div></dl><p class="fine muted">${t('Цена примера. Перед действием еще раз проверяются выбранные места и итог.','Example price. Selected places and the total are checked again before payment.')}</p><div class="session-inline-actions"><button class="secondary" type="button" data-session-edit>${t('Изменить выбор','Edit selection')}</button><button class="primary" type="button" data-session-pay>${t('Оплатить в демо','Pay in demo')} · ${money(inventory(event,record).price*d.qty)}</button></div><p class="fine muted">${t('Деньги не списываются, резерв в парке не создается.','No money is charged and no park reservation is created.')}</p></div>${simulation(record)}`;
  else{
    content=`<div class="session-booking-grid"><div class="panel session-fields">${mode==='quiz'?quizFields(event,record):`${dates(event,record)}${quantity(event,record)}${seats(event,record)}${contact(record)}<div class="session-inline-actions"><button type="button" class="primary" data-session-review>${t('Проверить заказ','Review order')}</button></div>`}</div><aside class="session-side-context"><img src="${h(event.image)}" alt="${h(loc(event.name))}" width="600" height="400">${summary(event,record,{compact:true})}<p class="fine muted">${t('Событие, расписание и цена придуманы для демонстрации сайта.','This event, schedule and price are invented for the website demonstration.')}</p><p class="fine muted">${t('Сохранение черновика не бронирует места в парке.','Saving a draft does not reserve places at the park.')}</p></aside></div>${simulation(record)}`;
  }
  return `<section class="page session-page" data-session-event="${h(event.id)}"><div class="page-heading session-heading"><button class="back-link" type="button" data-session-events>${icon('back')}${t('К событиям','Back to events')}</button><h1>${h(displayTitle(event))}</h1><p class="session-booking-type">${icon(seated(event)?'check':'clock')}${seated(event)?t('Демосеанс · места на схеме','Demo session · choose seats'):t('Демосеанс · без выбора кресел','Demo session · no seat selection')}</p>${switches(event,mode)}</div>${record.readonly?`<div class="session-notice"><p>${t('Просмотр сохраненного заказа не меняет текущий выбор.','Viewing a saved order does not change your current selection.')}</p><button class="text-link" data-session-current>${t('Вернуться к текущему выбору','Return to the current selection')}</button>${!record.activeLocked&&['failed','cancelled'].includes(d.phase)?`<button class="text-link" data-session-resume="${h(d.orderId)}">${t('Продолжить этот сохраненный заказ','Resume this saved order')}</button>`:''}</div>`:''}${record.savedDraft&&!record.readonly&&!LOCKED.includes(d.phase)?`<button class="text-link" data-session-restore-draft>${t('Вернуться к отложенному выбору','Return to the parked selection')}</button>`:''}<p class="error session-error" data-session-error role="alert" ${d.error?'':'hidden'}>${d.error?h(errorText(d.error)):''}</p>${content}${record.readonly?'':dock(event,record,mode)}</section>`;
}

export function bind(root,route,params){
  const event=eventFor(params);if(!event)return;
  const mode=modeFor(params),storageKey=keyOf(event);let disposed=false,busy=false,contactQueue=Promise.resolve();
  const saved=()=>normalizeRecord(read(storageKey,null),event);
  const repaint=(options={})=>{if(!disposed)refresh(options);};
  const fail=()=>{notify(errorText('storage'));};
  const contactValue=()=>root.querySelector('[data-session-contact]')?.value;
  async function mutate(action,{redraw=true,flush=true}={}){
    const contact=flush?contactValue():undefined;
    const next=await atomic(storageKey,raw=>{
      let record=normalizeRecord(raw,event);
      if(contact!==undefined)record=change(record,event,{type:'contact',value:contact});
      return change(record,event,action);
    },emptyRecord(event));
    if(redraw){const error=next.draft.error;const focus=error==='contact'?'[data-session-contact]':error==='quantity'?'[data-session-custom-qty]':error?'.session-error':action.type==='review'&&next.draft.phase==='review'?'#session-order-review':['step','edit'].includes(action.type)?'.session-fields':null;repaint(focus?{focus}:{});}return next;
  }
  async function pay(){
    if(busy||inFlight.has(event.id))return;busy=true;inFlight.add(event.id);
    let startedOrder=null,outcome='normal';
    try{
      await contactQueue;
      const next=await atomic(storageKey,raw=>{
        const record=normalizeRecord(raw,event);outcome=record.draft.scenario;
        const result=startPayment(record,event,{id:uid('session'),companySnapshot:company(),mode});
        startedOrder=result.order;return result.record;
      },emptyRecord(event));
      if(!startedOrder){notify(errorText(next.draft.error||'locked'));repaint();return;}
      await putOrder(startedOrder);repaint();
      let completed=null;
      await atomic(storageKey,raw=>{const r=settlePayment(normalizeRecord(raw,event),startedOrder.id,outcome);completed=r.order;return r.record;},emptyRecord(event));
      if(completed)await putOrder(completed);
      if(completed?.status==='paid'&&location.hash.startsWith('#/session'))navigate(`/tickets?order=${encodeURIComponent(completed.id)}`);
      else refresh();
    }catch{
      if(startedOrder){
        try{const recovered=await atomic(storageKey,raw=>recoverInterrupted(normalizeRecord(raw,event)),emptyRecord(event));const order=recovered.journal.find(o=>o.id===startedOrder.id);if(order)await putOrder(order);}catch{/* Keep persisted journal; never retry the payment. */}
      }
      fail();refresh();
    }finally{busy=false;inFlight.delete(event.id);}
  }
  async function nextStep({flushManual=true}={}){
    await contactQueue;const field=root.querySelector('[data-session-custom-qty]');if(flushManual&&field&&!field.closest('[hidden]'))await mutate({type:'quantity',value:field.value},{redraw:false});const record=saved(),d=record.draft;
    if(d.step!==1&&(d.error==='quantity'||d.quantityInput!=null)){repaint({focus:'[data-session-custom-qty]'});return;}
    if(d.step===1){if(!event.dates.includes(d.date)||!event.times.includes(d.time)){notify(errorText('session'));return;}await mutate({type:'step',value:0});}
    else if((d.step===0||d.step===3)&&seated(event)){const stock=inventory(event,record);if(stock.closed||stock.remaining<d.qty){notify(errorText(stock.closed?'closed':'shortage'));return;}await mutate({type:'step',value:2});}
    else await mutate({type:'review'});
  }
  async function onClick(e){
    const button=e.target.closest('button');if(!button||!root.contains(button)||button.disabled)return;
    try{
      if(button.hasAttribute('data-session-mode')){await contactQueue;const contact=contactValue();if(contact!==undefined)await mutate({type:'contact',value:contact},{redraw:false,flush:false});navigate(routeFor(event,button.dataset.sessionMode,param(params,'order')));return;}
      if(button.hasAttribute('data-session-current')){navigate(routeFor(event,mode));return;}
      if(button.hasAttribute('data-session-resume')){await atomic(storageKey,raw=>resumeOrder(normalizeRecord(raw,event),event,button.dataset.sessionResume),emptyRecord(event));navigate(routeFor(event,mode));return;}
      if(button.hasAttribute('data-session-restore-draft')){await atomic(storageKey,raw=>restoreSavedDraft(normalizeRecord(raw,event),event),emptyRecord(event));navigate(routeFor(event,mode));refresh();return;}
      if(button.hasAttribute('data-session-events')){navigate('/events');return;}
      if(button.hasAttribute('data-session-history')){navigate('/history');return;}
      if(button.hasAttribute('data-session-ticket')){navigate(`/tickets?order=${encodeURIComponent(button.dataset.sessionTicket)}`);return;}
      if(button.hasAttribute('data-session-manual')){const group=root.querySelector('.session-manual');if(group){group.hidden=false;group.querySelector('input')?.focus();}return;}
      if(button.hasAttribute('data-session-focus')){const target=root.querySelector('#'+button.dataset.sessionFocus);if(target){if(!target.matches('input,button'))target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'smooth'});}return;}
      if(button.hasAttribute('data-session-pay')){await pay();return;}
      if(button.hasAttribute('data-session-next')){await nextStep();return;}
      if(button.hasAttribute('data-session-new')){await atomic(storageKey,raw=>newBooking(normalizeRecord(raw,event),event),emptyRecord(event));repaint();return;}
      if(button.hasAttribute('data-session-resolve')&&reviewMode()){
        let order=null;await atomic(storageKey,raw=>{const record=normalizeRecord(raw,event);const result=reconcile(record,record.draft.orderId,button.dataset.sessionResolve);order=result.order;return result.record;},emptyRecord(event));
        if(order)await putOrder(order);repaint();return;
      }
      let action;
      if(button.hasAttribute('data-session-date'))action={type:'date',value:button.dataset.sessionDate};
      if(button.hasAttribute('data-session-time'))action={type:'time',value:button.dataset.sessionTime};
      if(button.hasAttribute('data-session-qty')){if(mode==='quiz'){await contactQueue;await mutate({type:'quantity',value:button.dataset.sessionQty},{redraw:false});await nextStep({flushManual:false});return;}action={type:'quantity',value:button.dataset.sessionQty};}
      if(button.hasAttribute('data-session-seat'))action={type:'seat',value:button.dataset.sessionSeat};
      if(button.hasAttribute('data-session-auto'))action={type:'auto'};
      if(button.hasAttribute('data-session-clear'))action={type:'clear-seats'};
      if(button.hasAttribute('data-session-edit')||button.hasAttribute('data-session-retry')){if(mode==='quiz')await mutate({type:'step',value:0},{redraw:false});action={type:'edit'};}
      if(button.hasAttribute('data-session-review'))action={type:'review'};
      if(button.hasAttribute('data-session-back'))action={type:'step',value:saved().draft.step-1};
      if(button.hasAttribute('data-session-step')){if(button.dataset.sessionStep==='2'&&(saved().draft.error==='quantity'||saved().draft.quantityInput!=null)){repaint({focus:'[data-session-custom-qty]'});return;}action=button.dataset.sessionStep==='3'?{type:'review'}:{type:'step',value:button.dataset.sessionStep};}
      if(action){await contactQueue;await mutate(action);}
    }catch{fail();}
  }
  function onInput(e){
    if(!e.target.matches('[data-session-contact]'))return;
    const value=e.target.value;
    contactQueue=contactQueue.then(()=>mutate({type:'contact',value},{redraw:false,flush:false})).catch(fail);
  }
  async function onChange(e){try{
    if(e.target.matches('[data-session-custom-qty]'))await mutate({type:'quantity',value:e.target.value});
    if(e.target.matches('[data-session-scenario]')&&reviewMode())await mutate({type:'scenario',value:e.target.value});
  }catch{fail();}}
  function onExternal(e){if(e.detail?.key===storageKey&&e.detail.external)repaint();}
  root.addEventListener('click',onClick);root.addEventListener('input',onInput);root.addEventListener('change',onChange);window.addEventListener('tmn:change',onExternal);
  // The per-event journal is the transaction source; recover an interrupted
  // response as unknown and repair the common history mirror, without charging.
  const initial=saved();
  if(initial.draft.orderId){
    atomic(storageKey,raw=>{
      let record=mergeOrderUpdates(normalizeRecord(raw,event),orders());
      if(record.draft.phase==='processing'&&!inFlight.has(event.id))record=recoverInterrupted(record);
      return record;
    },emptyRecord(event)).then(async record=>{
      const order=record.journal.find(o=>o.id===record.draft.orderId);
      if(order){const mirror=orders().find(o=>o.id===order.id);if(!mirror||new Date(order.updatedAt).getTime()>new Date(mirror.updatedAt).getTime()||order.status==='unknown'&&mirror.status==='processing')await putOrder(order);}
      if(record.draft.phase!==initial.draft.phase)repaint();
    }).catch(fail);
  }
  return ()=>{disposed=true;root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);window.removeEventListener('tmn:change',onExternal);};
}
