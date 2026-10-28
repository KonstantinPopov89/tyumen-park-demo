import {t,lang,loc,h,read,write,personName,icon} from './shared.js';
import {readyRights} from './commerce-model.js?v=r10';
import {ticketShareURL,decodeTicketShare,messengerShareURL} from './ticket-share.js?v=r20.1';

const VIEW='receipt-current-v1';
const preferences=()=>{const value=read(VIEW,{});return value&&typeof value==='object'&&!Array.isArray(value)?value:{};};
function sessionTicket(right,order){
  const snapshot=order?.sessionSnapshot,rights=order?.rights;
  if(order?.kind!=='session'||!snapshot||!Array.isArray(rights)||!Array.isArray(snapshot.seats)||snapshot.qty!==rights.length)return null;
  const index=rights.findIndex(item=>item.id===right.id);
  if(index<0||rights.filter(item=>item.id===right.id).length!==1)return null;
  const seated=snapshot.seats.length>0;
  if(seated&&(snapshot.seats.length!==rights.length||snapshot.seats.some(seat=>typeof seat!=='string'||!seat.trim())||new Set(snapshot.seats).size!==snapshot.seats.length))return null;
  return {snapshot,seat:seated?snapshot.seats[index]:null,label:seated?t(`Место ${snapshot.seats[index]}`,`Seat ${snapshot.seats[index]}`):t(`Входной билет ${index+1} из ${rights.length}`,`Admission ticket ${index+1} of ${rights.length}`)};
}
export const receiptRecipient=(right,order)=>right.sharedRecipient|| (right.recipient?(right.recipient.deferred?t('Получатель не указан','Guest not assigned'):personName(right.recipient,right.recipient.displayIndex??0)):right.recipients?.length?(right.recipients.every(p=>p?.deferred)?t('Для вашей компании','For your group'):right.recipients.map((p,i)=>personName(p,p.displayIndex??i)).join(', ')):sessionTicket(right,order)?.label||t('Билет на место или вход','Seat or admission ticket'));
function receiptDetail(right,order,fallback){
  const original=loc(right.detail||fallback),session=sessionTicket(right,order);
  if(!session)return original;
  const {date,time}=session.snapshot;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return original;
  const parsed=new Date(`${date}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return original;
  const suffix=session.seat?t(`Место ${session.seat}`,`Seat ${session.seat}`):t('Без выбора кресел','Open seating');
  // Only the model's generated detail is reformatted. Legacy or custom terms stay verbatim.
  if(original!==`${date}, ${time}. ${suffix}`)return original;
  const displayDate=new Intl.DateTimeFormat(lang()==='ru'?'ru-RU':'en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(parsed);
  return `${displayDate}, ${time}. ${suffix}`;
}
export function selectedReceiptRight(order,preferred=preferences()[order.id]){const rights=readyRights(order);return rights.find(right=>right.id===preferred)||rights[0]||null;}
export function receiptQR(right){
  try{if(typeof window.qrcode!=='function')throw new Error('QR unavailable');const code=window.qrcode(0,'M');code.addData(right.qrPayload);code.make();return code.createSvgTag({cellSize:4,margin:16,scalable:true}).replace('<svg ','<svg aria-hidden="true" focusable="false" ');}
  catch{return `<p class="rp-qr-fallback">${t('QR пока недоступен. Используйте код в разделе "Код вручную".','QR is unavailable. Use the code in “Manual code”.')}</p>`;}
}
const kind=right=>right.uses?t('Общий пакет катаний','Shared ride bundle'):right.productId?.includes('pass')?t('Личный безлимит','Personal pass'):t('Демонстрационный билет','Demo ticket');
export function receiptCard(right,{interactive=true,wallet=false,order=null}={}){
  const tag=interactive?'button':'div';
  return `<article class="rp-card${wallet?' rp-wallet-card':''}" data-rp-right="${h(right.id)}"><div class="rp-card-brand"><strong>ГПКиО Тюмень</strong><span>${t('Образец','Sample')}</span></div><div class="rp-card-heading"><span>${kind(right)}</span><h2>${h(loc(right.name))}</h2><p>${h(receiptRecipient(right,order))}</p></div><${tag} class="rp-qr" ${interactive?`type="button" data-rp-action="large" aria-label="${h(t('Увеличить QR: ','Enlarge QR: ')+loc(right.name)+', '+receiptRecipient(right,order))}"`:''}>${receiptQR(right)}</${tag}>${interactive?`<button class="rp-enlarge" type="button" data-rp-action="large">${t('Увеличить QR','Enlarge QR')}</button>`:''}<p class="rp-validity">${h(receiptDetail(right,order,{ru:'Один демонстрационный визит',en:'One demo visit'}))}</p><p class="rp-demo">${t('Демо-QR не действует для прохода. Деньги не списывались.','Demo QR is not valid for admission. No money was charged.')}</p></article>`;
}
export function receiptConditions(right,order=null){
  return `<ul><li>${h(receiptDetail(right,order,{ru:'Демонстрационные условия',en:'Demo terms'}))}</li>${right.uses?`<li>${t('Общий запас','Shared allowance')}: ${right.uses} ${t('катаний','rides')}</li>`:''}${right.includedRides?.length?`<li>${t('Включены','Includes')}: ${right.includedRides.map(r=>h(loc(r.name))).join(', ')}</li>`:''}</ul><p class="rp-hint">${t('Возраст, рост и сопровождение уточняйте у парка. Демобилет не подтверждает допуск.','Check age, height and accompanying-adult rules with the park. A demo ticket does not confirm admission.')}</p>`;
}
const messengerIcons={
 vk:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.8 17.9C6.9 17.9 3.5 13.8 3.3 7h3c.2 5 2.4 7.1 4.2 7.6V7h2.8v4.4c1.8-.2 3.6-2.2 4.2-4.4h2.8a8.4 8.4 0 0 1-3.9 5.5c1.4.7 3.4 2.4 4.2 5.4h-3.1c-.6-2-2.1-3.6-4.2-3.8v3.8h-.5Z"/></svg>',
 max:'<svg viewBox="0 0 100 100" aria-hidden="true"><path fill-rule="evenodd" d="M50.76 0c27.53 0 49.12 22.34 49.12 49.89S77.61 99.23 51.02 99.23c-9.43 0-14.01-1.33-21.37-6.54-.5-.36-1.2-.26-1.63.19-5.66 6.04-20.17 10.28-20.83 2.03C7.19 80.53 0 71.18 0 49.61 0 21.3 23.22 0 50.76 0m.77 24.55c-13.07-.68-23.26 8.39-25.51 22.58-1.86 11.75 1.44 26.07 4.26 26.8 1.2.3 4.08-1.9 6.18-3.88.4-.37.99-.44 1.45-.15 3.27 2 6.97 3.5 11.05 3.71 13.42.7 25.3-9.8 26-23.21.71-13.42-10.01-25.14-23.43-25.85"/></svg>',
 whatsapp:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.2-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.1 15.3l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3.1 3c-.3 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.2.2 2 3.2 5 4.2 2.5.8 3 .6 3.5.1.4-.4.7-1.4.7-1.8 0-.2-.1-.4-.3-.5l-2.1-1c-.3-.1-.5-.1-.7.2l-.9 1.1c-.2.2-.4.2-.7.1a7.1 7.1 0 0 1-3.2-2.8c-.2-.3 0-.4.1-.6l.7-.9c.1-.2.1-.4 0-.6L9.6 7c-.1-.3-.3-.3-.7-.3Z"/></svg>',
 telegram:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.5 3.3-3.4 16c-.3 1.1-.9 1.3-1.8.8l-5.2-3.8-2.5 2.4c-.3.3-.5.5-1 .5l.4-5.3 9.6-8.6c.4-.4-.1-.6-.6-.3L5.2 12.4l-5-1.6c-1.1-.3-1.1-1.1.3-1.6l19.8-7.6c.9-.3 1.6.2 1.2 1.7Z" transform="translate(1 1) scale(.9)"/></svg>'
};
function selectedShareURL(right,order){
 return ticketShareURL({name:loc(right.name),recipient:receiptRecipient(right,order),detail:receiptDetail(right,order,{ru:'Один демонстрационный визит',en:'One demo visit'}),qrPayload:right.qrPayload,productId:right.productId||'',uses:right.uses||null,includedRides:(right.includedRides||[]).map(ride=>loc(ride.name))},location.href);
}
function shareMarkup(right,order){
 try{
  const url=selectedShareURL(right,order),text=t('Демобилет ГПКиО Тюмень. Образец не действует для прохода.','GPKiO Tyumen demo ticket. Not valid for admission.');
  const services=[['vk',t('ВК','VK')],['max','MAX'],['whatsapp','WhatsApp'],['telegram','Telegram']];
  return `<div class="rp-share"><h3>${t('Отправить этот билет','Send this ticket')}</h3><div class="rp-messengers">${services.map(([service,label])=>`<a class="rp-messenger" data-rp-messenger="${service}" href="${h(messengerShareURL(service,url,text))}" target="_blank" rel="noopener noreferrer" aria-label="${h(t(`Отправить билет через ${label}. Откроется приложение или новая вкладка.`,`Send ticket via ${label}. Opens an app or a new tab.`))}"><span class="rp-messenger-icon">${messengerIcons[service]}</span><span>${label}</span></a>`).join('')}</div><button class="rp-share-copy" type="button" data-rp-action="copy-link">${t('Скопировать ссылку на билет','Copy ticket link')}</button><p class="rp-hint">${t('Выберите получателя в приложении. По ссылке доступен только этот демобилет.','Choose a recipient in the app. The link opens only this demo ticket.')}</p><div data-rp-link-fallback hidden><label>${t('Ссылка на выбранный билет','Selected ticket link')}<textarea readonly rows="3" data-rp-share-url aria-label="${t('Ссылка на выбранный билет','Selected ticket link')}">${h(url)}</textarea></label></div></div>`;
 }catch{return `<p class="rp-hint">${t('Не удалось подготовить ссылку. Сохраните файл билета и отправьте его через приложение.','Could not prepare a link. Save the ticket file and send it through your app.')}</p>`;}
}

export function receiptMarkup(order){
  const rights=readyRights(order),right=selectedReceiptRight(order);if(!right)return '';
  return `<section class="rp-receipt" data-rp-receipt="${h(order.id)}" aria-label="${t('Готовые билеты','Ready tickets')}">${rights.length>1?`<label class="rp-selector"><span>${t('Билеты в заказе','Tickets in this order')} <b>${rights.length}</b></span><select data-rp-select>${rights.map((item,i)=>`<option value="${h(item.id)}" ${item.id===right.id?'selected':''}>${sessionTicket(item,order)?`${h(receiptRecipient(item,order))} · ${h(loc(item.name))}`:`${i+1}. ${h(loc(item.name))} · ${h(receiptRecipient(item))}`}</option>`).join('')}</select></label>`:''}<div class="rp-layout"><div data-rp-card>${receiptCard(right,{order})}</div><div class="rp-tools"><button class="primary rp-save" type="button" data-rp-action="save-all">${icon('download')}${rights.length>1?t('Сохранить все готовые билеты','Save all ready tickets'):t('Сохранить билет','Save ticket')}</button><p class="rp-hint">${t('Один файл с QR и условиями. Открывается без интернета.','One file with QR codes and terms. Opens offline.')}</p><div data-rp-share>${shareMarkup(right,order)}</div><div class="rp-secondary-actions">${rights.length>1?`<button type="button" data-rp-action="save-current">${t('Сохранить этот билет','Save this ticket')}</button>`:''}<button type="button" data-rp-action="share">${t('Отправить файл через другое приложение','Send file through another app')}</button><button type="button" data-rp-action="print">${t('Печать / PDF всех билетов','Print / PDF all tickets')}</button></div><p class="rp-status" data-rp-status role="status"></p><details class="rp-wallet"><summary>${t('Макеты Wallet','Wallet previews')}</summary><p class="rp-hint">${t('Предпросмотр выбранного билета. В Wallet ничего не добавляется.','Preview the selected ticket. Nothing is added to Wallet.')}</p><button type="button" data-rp-action="apple">${t('Посмотреть макет Apple Wallet','Preview Apple Wallet')}</button><button type="button" data-rp-action="google">${t('Посмотреть макет Google Wallet','Preview Google Wallet')}</button></details><details class="rp-code"><summary>${t('Код вручную','Manual code')}</summary><code data-rp-code>${h(right.qrPayload)}</code><button type="button" data-rp-action="copy">${t('Скопировать код','Copy code')}</button><p class="rp-status" data-rp-copy-status role="status"></p></details></div></div><details class="rp-conditions"><summary>${t('Состав и условия выбранного билета','Selected ticket: included rides and terms')}</summary><div data-rp-conditions>${receiptConditions(right,order)}</div></details><div class="rp-next"><h2>${t('Что делать дальше','What to do next')}</h2><p>${order.sharedCopy?t('Сохраните этот билет на устройстве или сохраните полученную ссылку. Этот образец не добавляется в вашу историю покупок.','Save this ticket on your device or keep the link you received. This sample is not added to your purchase history.'):t('Сохраните файл на устройстве или отправьте ссылку на выбранный билет. Ваш заказ останется в разделе "Мои билеты" в этом браузере.','Save the file on your device or send a link to the selected ticket. Your order stays in “My tickets” in this browser.')}</p><p class="rp-hint">${t('Для реального визита уточните у парка режим работы, возраст, рост и сопровождение.','For a real visit, check opening hours, age, height and accompanying-adult rules with the park.')} <a href="#/visit">${t('Контакты и правила','Contacts and rules')}</a></p></div><details class="rp-help"><summary>${t('Не получается сохранить или открыть билет?','Having trouble saving or opening a ticket?')}</summary><p>${t('Проверьте загрузки браузера. Можно сохранить отдельный билет, все готовые билеты или выбрать "Печать / PDF". Если QR не появился, код остается в разделе "Код вручную".','Check your browser downloads. Save one ticket, all ready tickets or choose “Print / PDF”. If the QR is unavailable, its code remains under “Manual code”.')}</p><p class="rp-hint">${t('Это демонстрация. Настоящая отправка билетов, поддержка покупки и возвраты здесь не подключены.','This is a demo. Actual ticket delivery, purchase support and refunds are not connected.')}</p></details></section>`;
}

const safeName=value=>String(value).replace(/[^a-zA-Z0-9_.-]/g,'-');
export const receiptFilename=(order,right=null)=>`tyumen-demo-${safeName(order.id)}${right?'-'+safeName(right.id):'-all'}.html`;
export function standaloneReceiptHTML(order,{rightId=null,orderDetails=''}={}){
  const ready=readyRights(order),rights=rightId?ready.filter(right=>right.id===rightId):ready;
  if(!rights.length)throw new Error('No ready ticket');
  return `<!doctype html><html lang="${lang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(t('Демобилеты ГПКиО Тюмень','GPKiO Tyumen demo tickets'))}</title><style>*{box-sizing:border-box}body{font:16px/1.5 system-ui,sans-serif;color:#193c55;background:white;margin:24px}main{max-width:900px;margin:auto}h1{font-size:26px}h2{font-size:20px;margin:6px 0}p{margin:10px 0}.rp-offline-ticket{break-inside:avoid;border:1px solid #b8cedd;border-radius:16px;padding:20px;margin:24px 0}.rp-card{text-align:center;max-width:440px;margin:auto}.rp-card-brand{display:flex;justify-content:space-between;border-bottom:2px solid #193c55;padding-bottom:12px}.rp-card-heading{padding-top:12px}.rp-card-heading>span,.rp-demo,.rp-hint{font-size:13px}.rp-qr{width:224px;max-width:100%;background:white;margin:16px auto}.rp-qr svg{width:100%;height:auto;display:block}.rp-validity{font-size:14px}.rp-qr-fallback{font-size:14px}code{display:block;overflow-wrap:anywhere;user-select:all;font:12px/1.5 monospace;margin:18px 0}.co-order-item{border-top:1px solid #b8cedd;padding-top:12px;margin-top:12px}.co-included{font-size:13px}button{font:inherit;color:#193c55;background:#edf6fb;border:1px solid #b8cedd;border-radius:24px;min-height:44px;padding:10px 20px}summary{min-height:44px;padding-block:10px}@media(max-width:400px){body{margin:16px}.rp-offline-ticket{padding:14px}}@media print{body{margin:0}button{display:none}.rp-offline-ticket{break-inside:avoid}}</style></head><body><main><h1>${h(t('Ваши демонстрационные билеты','Your demo tickets'))}</h1><p>${t('Образцы не действуют для прохода. Деньги не списывались.','Samples are not valid for admission. No money was charged.')}</p><p>${t('Номер заказа','Order number')}: ${h(order.id)}</p><p>${rightId?t('Этот файл содержит один выбранный готовый билет.','This file contains one selected ready ticket.'):t(`В файле ${rights.length} готовых билетов из ${order.rights?.length||0}.`,`This file contains ${rights.length} ready tickets out of ${order.rights?.length||0}.`)}</p><button onclick="window.print()">${t('Печать / PDF','Print / PDF')}</button>${rights.map(right=>`<section class="rp-offline-ticket">${receiptCard(right,{interactive:false,order})}<code>${h(right.qrPayload)}</code>${receiptConditions(right,order)}</section>`).join('')}${orderDetails}</main></body></html>`;
}

export function bindReceipt(root,{getOrder,makeHTML=standaloneReceiptHTML}={}){
  const section=root.querySelector('[data-rp-receipt]');if(!section)return ()=>{};
  const order=getOrder(section.dataset.rpReceipt);if(!order||!readyRights(order).length)return ()=>{};
  let current=selectedReceiptRight(order),dialog=null,alive=true;
  const status=message=>{if(alive)section.querySelector('[data-rp-status]').textContent=message;};
  const copyStatus=message=>{if(alive)section.querySelector('[data-rp-copy-status]').textContent=message;};
  const closeDialog=()=>{if(!dialog)return;const active=dialog;dialog=null;if(active.open&&typeof active.close==='function')active.close();else active.remove();};
  const showDialog=(type,opener)=>{
    closeDialog();const right=current,heading=type==='large'?t('QR выбранного билета','Selected ticket QR'):type==='apple'?t('Макет Apple Wallet','Apple Wallet preview'):t('Макет Google Wallet','Google Wallet preview');
    const node=document.createElement('dialog');dialog=node;node.className='rp-dialog';node.setAttribute('aria-labelledby','rp-dialog-title');
    node.innerHTML=`<div class="rp-dialog-heading"><h2 id="rp-dialog-title">${heading}</h2><button type="button" data-rp-close aria-label="${t('Закрыть','Close')}">${icon('close')}</button></div>${type==='large'?`<div class="rp-dialog-identity"><h3>${h(loc(right.name))}</h3><p>${h(receiptRecipient(right,order))}</p></div><div class="rp-large-qr">${receiptQR(right)}</div><p class="rp-hint">${t('Демо-QR не действует для прохода.','Demo QR is not valid for admission.')}</p>`:`<p class="rp-hint">${t('Это макет выбранного билета. Действующий пропуск не создается и в Wallet не добавляется.','This is a preview of the selected ticket. No valid pass is created or added to Wallet.')}</p>${receiptCard(right,{interactive:false,wallet:true,order})}`}<code>${h(right.qrPayload)}</code>`;
    document.body.append(node);
    const finish=()=>{if(dialog===node)dialog=null;node.remove();if(alive&&opener?.isConnected)opener.focus({preventScroll:true});};
    const close=()=>typeof node.close==='function'?node.close():finish();
    node.addEventListener('close',finish);node.addEventListener('click',event=>{if(event.target===node||event.target.closest('[data-rp-close]'))close();});
    node.addEventListener('cancel',event=>{event.preventDefault();close();});
    node.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){event.preventDefault();node.querySelector('[data-rp-close]').focus();}});
    if(typeof node.showModal==='function')node.showModal();else{node.setAttribute('open','');node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');}
    node.querySelector('[data-rp-close]').focus();
  };
  const download=right=>{
    try{const html=makeHTML(order,{rightId:right?.id||null}),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download=receiptFilename(order,right);document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status(t('Файл подготовлен. Проверьте загрузки браузера.','File prepared. Check your browser downloads.'));}
    catch{status(t('Не удалось подготовить файл. Билет остается на экране; можно сохранить его через "Печать / PDF".','Could not prepare the file. Your ticket remains on screen; try “Print / PDF”.'));}
  };
  const change=event=>{
    if(!event.target.matches('[data-rp-select]'))return;
    current=selectedReceiptRight(order,event.target.value);if(!current)return;
    const next={...preferences(),[order.id]:current.id};write(VIEW,Object.fromEntries(Object.entries(next).slice(-32)));
    section.querySelector('[data-rp-card]').innerHTML=receiptCard(current,{order});section.querySelector('[data-rp-code]').textContent=current.qrPayload;section.querySelector('[data-rp-conditions]').innerHTML=receiptConditions(current,order);section.querySelector('[data-rp-share]').innerHTML=shareMarkup(current,order);copyStatus('');status('');
  };
  const click=async event=>{
    if(event.target.closest('[data-rp-messenger]')){status(t('Подтвердите отправку в выбранном приложении. Билет остается здесь.','Confirm sending in the app you chose. Your ticket stays here.'));return;}
    const button=event.target.closest('[data-rp-action]');if(!button||!section.contains(button))return;
    const action=button.dataset.rpAction,right=current;
    if(['large','apple','google'].includes(action)){showDialog(action,button);return;}
    if(action==='save-all'){download(null);return;}if(action==='save-current'){download(right);return;}
    if(action==='copy-link'){
      try{const url=selectedShareURL(right,order);if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(url);status(t('Ссылка скопирована. Вставьте ее в сообщение получателю.','Link copied. Paste it into a message to the recipient.'));}
      catch{const fallback=section.querySelector('[data-rp-link-fallback]');if(fallback){fallback.hidden=false;const field=fallback.querySelector('textarea');field.focus();field.select();}status(t('Скопируйте выделенную ссылку и вставьте ее в сообщение.','Copy the selected link and paste it into a message.'));}return;
    }
    if(action==='copy'){
      try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(right.qrPayload);if(current.id===right.id)copyStatus(t('Код скопирован.','Code copied.'));}
      catch{copyStatus(t('Не удалось скопировать. Выделите код выше и скопируйте вручную.','Could not copy. Select the code above and copy it manually.'));}return;
    }
    if(action==='print'){
      let printWindow;try{const html=makeHTML(order),target=window.open('','_blank');printWindow=target;if(!target){status(t('Разрешите окно печати или сохраните файл билетов.','Allow the print window or save the ticket file.'));return;}target.document.write(html);target.document.close();setTimeout(()=>target.print(),250);}
      catch{printWindow?.close();status(t('Печать не открылась. Сохраните файл и распечатайте его из браузера.','Print could not open. Save the file and print it from your browser.'));}return;
    }
    if(action==='share'){
      try{
        const file=new File([makeHTML(order,{rightId:right.id})],receiptFilename(order,right),{type:'text/html'});
        if(typeof navigator.share!=='function'||typeof navigator.canShare!=='function'||!navigator.canShare({files:[file]})){status(t('Этот браузер не может передать файл. Используйте значок приложения выше или скопируйте ссылку.','This browser cannot share the file. Use an app icon above or copy the ticket link.'));return;}
        await navigator.share({files:[file],title:t('Демобилет ГПКиО Тюмень','GPKiO Tyumen demo ticket')});status(t('Меню обмена закрыто. Доставка зависит от выбранного приложения.','The share sheet has closed. Delivery depends on the app you chose.'));
      }catch(error){status(error.name==='AbortError'?t('Обмен отменен. Билет остается здесь.','Sharing cancelled. Your ticket stays here.'):t('Не удалось передать файл. Сохраните билет и поделитесь им из загрузок.','Could not share the file. Save the ticket and share it from your downloads.'));}
    }
  };
  section.addEventListener('change',change);section.addEventListener('click',click);
  return ()=>{alive=false;closeDialog();section.removeEventListener('change',change);section.removeEventListener('click',click);};
}

// Shared demo links carry one validated snapshot, never a local purchase lookup.
function sharedOrder(params){
 const snapshot=decodeTicketShare(params.get('data'));if(!snapshot)return null;
 const right={id:'shared-ticket',name:snapshot.name,sharedRecipient:snapshot.recipient,detail:snapshot.detail,qrPayload:snapshot.qrPayload,productId:snapshot.productId,uses:snapshot.uses,includedRides:snapshot.includedRides.map(name=>({name})),ready:true};
 return {id:'shared-demo',status:'paid',fulfillment:'ready',demo:true,sharedCopy:true,rights:[right]};
}
export function render(route,params){
 const order=sharedOrder(params);
 if(!order)return `<section class="page empty"><h1>${t('Ссылка на билет повреждена','This ticket link is incomplete')}</h1><p>${t('Попросите отправителя снова скопировать ссылку на билет или прислать сохраненный файл.','Ask the sender to copy the ticket link again or send the saved file.')}</p><a class="secondary" href="#/home">${t('На главную','Home')}</a></section>`;
 return `<section class="page co-page co-receipt-page"><div class="page-heading"><h1>${t('Вам отправили демобилет','You received a demo ticket')}</h1><p>${t('Образец для просмотра. Не подтверждает оплату и не действует для прохода.','A preview sample. It does not confirm payment or grant admission.')}</p></div>${receiptMarkup(order)}</section>`;
}
export function bind(root,route,params){const order=sharedOrder(params);return order?bindReceipt(root,{getOrder:()=>order}):()=>{};}
