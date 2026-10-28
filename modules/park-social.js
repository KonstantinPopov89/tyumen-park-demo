import {t,h,money} from './shared.js';

// Verified park contacts. Missing official addresses use the explicit local-file fallback.
export const parkChannels = Object.freeze([
  {id:'vk',name:'ВКонтакте',english:'VK',href:'https://vk.com/gpkio_tyumen'},
  {id:'max',name:'MAX',english:'MAX',href:null},
  {id:'whatsapp',name:'WhatsApp',english:'WhatsApp',href:null},
  {id:'telegram',name:'Telegram',english:'Telegram',href:'https://telegram.me/gorsad_tmn'}
]);
const icons = {
  vk:'<path d="M3 5h4c.3 5 2.2 7.4 3.7 7.9V5h3.8v4.5c1.5-.2 3-2.5 3.5-4.5h3.8c-.5 2.5-2.3 4.9-3.8 5.9 1.5.8 3.5 2.9 4 6.1h-4.2c-.6-2-2-3.5-3.3-3.8V17h-1.7C6.6 17 3.5 12.8 3 5Z"/>',
  telegram:'<path d="m21 4-3 16-6-4-3 3 .6-5.3L18 7l-10.7 5.5L3 11Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  whatsapp:'<path d="M20 11.5a8 8 0 0 1-12 7L3 20l1.5-4.5A8 8 0 1 1 20 11.5Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m8 7 1.5 3-1 1c.8 1.5 1.7 2.4 3.2 3.2l1-1L17 15c-.5 2-2 2.2-3.5 1.5A13 13 0 0 1 6.5 9C6 7.5 6.3 7 8 7Z"/>',
  max:'<path d="M12 3a9 9 0 0 0-8 13l-1 5 5-1A9 9 0 1 0 12 3Zm-4 9c0-2.5 1.4-4 4-4s4 1.5 4 4-1.4 4-4 4-4-1.5-4-4Z"/>'
};
export function renderParkSocial({kind='tickets'}={}){
  const links=parkChannels.filter(channel=>typeof channel.href==='string'&&channel.href.startsWith('https://'));
  const downloads=parkChannels.filter(channel=>!channel.href);
  const save=t(kind==='topup'?'Скачать подтверждение':'Скачать все билеты',kind==='topup'?'Download confirmation':'Download all tickets');
  const mark=channel=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[channel.id]}</svg>`;
  return `<section class="park-social" aria-labelledby="park-social-title"><h2 id="park-social-title">${t('Парк в соцсетях','The park on social media')}</h2><p>${t('Новости и связь с командой парка.','Updates and contact with the park team.')}</p><div class="park-social-links">${links.map(channel=>`<a class="secondary park-social-link" href="${h(channel.href)}" target="_blank" rel="noopener noreferrer" data-park-channel="${channel.id}" aria-label="${h(t(channel.name,channel.english)+t(': страница парка, откроется в новой вкладке',': park page, opens in a new tab'))}">${mark(channel)}<span>${h(t(channel.name,channel.english))}</span></a>`).join('')}</div>${downloads.length?`<details class="park-social-save"><summary>${t(kind==='topup'?'Сохранить подтверждение для себя':'Сохранить весь заказ для себя',kind==='topup'?'Keep your confirmation':'Keep your complete order')}</summary><p>${t(kind==='topup'?'Скачайте подтверждение, чтобы отправить его себе в MAX или WhatsApp.':'Один файл со всеми билетами, чтобы отправить себе в MAX или WhatsApp.',kind==='topup'?'Download the confirmation to send it to yourself in MAX or WhatsApp.':'One file with every ticket, ready to send to yourself in MAX or WhatsApp.')}</p><div class="park-social-links">${downloads.map(channel=>`<button type="button" class="secondary park-social-link park-social-download" data-park-save="${kind}" data-park-channel="${channel.id}" aria-label="${h(t(channel.name,channel.english)+': '+save)}">${mark(channel)}<span><strong>${h(t(channel.name,channel.english))}</strong><small>${save}</small></span></button>`).join('')}</div><p class="park-social-save-status" role="status" data-park-save-status></p></details>`:''}</section>`;
}
const safeName=value=>String(value).replace(/[^a-zA-Z0-9_.-]/g,'-');
export const topupFilename=op=>`tyumen-demo-topup-${safeName(op.id)}.html`;
export function topupConfirmationHTML(op){
  if(op?.payment!=='paid'||op?.credit!=='credited')throw new Error('Top-up is not complete');
  const title=t('Подтверждение демопополнения','Demo top-up confirmation');
  return `<!doctype html><html lang="${t('ru','en')}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:32px auto;padding:0 20px;max-width:640px;font:16px/1.5 system-ui,sans-serif;color:#193c55}h1{font-size:28px}dt{font-weight:600;margin-top:20px}dd{margin:0}footer{margin-top:32px}</style><h1>${title}</h1><p>ГПКиО Тюмень</p><dl><dt>${t('Сумма','Amount')}</dt><dd>${h(money(op.amount))}</dd><dt>${t('Демо-карта','Demo card')}</dt><dd>${h(op.card)}</dd><dt>${t('Результат','Result')}</dt><dd>${t('Демооплата подтверждена, сумма зачислена один раз.','Demo payment confirmed, amount credited once.')}</dd><dt>${t('Номер операции','Operation ID')}</dt><dd>${h(op.id)}</dd><dt>${t('Дата','Date')}</dt><dd>${h(op.creditedAt||op.updatedAt||'')}</dd></dl><footer>${t('Демонстрация. Это не чек и не билет. Реальные деньги и баланс карты не менялись.','Demonstration. This is not a receipt or ticket. No real funds or card balance changed.')}</footer></html>`;
}
export function bindParkSocial(root,{saveTickets,getTopup}={}){
  const section=root.querySelector('.park-social');if(!section)return ()=>{};
  const status=text=>{const node=section.querySelector('[data-park-save-status]');if(node)node.textContent=text;};
  const click=event=>{
    const button=event.target.closest('[data-park-save]');if(!button||!section.contains(button))return;
    try{
      if(button.dataset.parkSave==='tickets'){
        if(typeof saveTickets!=='function'||saveTickets()===false)throw new Error('No ready ticket');
      }else{
        const op=getTopup?.(),html=topupConfirmationHTML(op),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),anchor=document.createElement('a');
        anchor.href=url;anchor.download=topupFilename(op);document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
      status(t('Файл подготовлен. Проверьте загрузки браузера.','File prepared. Check your browser downloads.'));
    }catch{status(t('Не удалось подготовить файл. Вернитесь к готовой операции и попробуйте снова.','Could not prepare the file. Open the completed operation and try again.'));}
  };
  section.addEventListener('click',click);return ()=>section.removeEventListener('click',click);
}
