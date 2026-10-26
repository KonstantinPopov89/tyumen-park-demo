import {t,loc,h,read,write,company,notify,icon} from './shared.js';
import {rides} from './data.js';

// Only discovery progress lives here. The existing company, interests and orders
// retain their original keys and contracts.
const JOURNAL='discovery-progress-v2';
const photo=r=>r.id==='ferris-wheel'?'assets/wheel.webp':r.image;
const interests=()=>read('saved',[]).filter(id=>rides.some(r=>r.id===id));
const selected=id=>interests().includes(id);
let focusReturn=null;
const modeOf=p=>p.get('mode')==='swipe'?'swipe':'feed';
const baseURL=mode=>'/discover?mode='+mode;
const panelOf=p=>['details','list','company','help'].includes(p.get('panel'))?p.get('panel'):null;
const arrow=(direction)=>`<span class="sky-direction sky-direction-${direction}">${icon('arrow')}</span>`;

function context(mode){
  const filtering=!!read('discovery-filter',false);
  const known=[...new Set(company().people.map(p=>p.band).filter(b=>b!=='unknown'))].sort();
  const list=filtering&&known.length?rides.filter(r=>known.some(b=>r.demoBands.includes(b))):rides;
  const signature=mode+':'+(filtering?'age:'+known.join(','):'all');
  const stored=read(JOURNAL,{});
  const journal={version:2,views:stored?.views&&typeof stored.views==='object'?stored.views:{},active:stored?.active&&typeof stored.active==='object'?stored.active:{}};
  const prior=journal.views[journal.active[mode]];
  let view=journal.views[signature];
  if(!view||typeof view!=='object')view={rideId:prior?.rideId||null,index:0,atEnd:false,undo:[]};
  const found=list.findIndex(r=>r.id===view.rideId);
  let index=view.atEnd?list.length:found>=0?found:Math.min(Math.max(0,Number(view.index)||0),Math.max(0,list.length-1));
  view={index,rideId:list[index]?.id||null,atEnd:list.length>0&&index===list.length,undo:Array.isArray(view.undo)?view.undo.filter(x=>x&&rides.some(r=>r.id===x.id)).slice(-100):[]};
  return {mode,filtering,list,signature,journal,view};
}
function persist(c){
  c.view.rideId=c.list[c.view.index]?.id||null;
  c.view.atEnd=c.list.length>0&&c.view.index===c.list.length;
  // Merge other modes changed by another tab rather than overwriting them.
  const latest=read(JOURNAL,{});
  const views={...(latest?.views||{}),[c.signature]:c.view};
  const keys=Object.keys(views);for(const key of keys.slice(0,Math.max(0,keys.length-32)))if(key!==c.signature)delete views[key];
  write(JOURNAL,{version:2,views,active:{...(latest?.active||{}),[c.mode]:c.signature}});
}
function current(c){return c.list[c.view.index];}
function updateURL(c){
  const p=new URLSearchParams(location.hash.split('?')[1]||'');
  p.set('mode',c.mode);
  // A shareable object deep link follows browsing, so reload never jumps back.
  if(p.has('ride')){if(current(c))p.set('ride',current(c).id);else p.delete('ride');history.replaceState(history.state,'','#/discover?'+p);}
}
function heartButton(r,extra=''){
  const on=selected(r.id);
  return `<button class="sky-save ${on?'is-saved':''} ${extra}" data-sky-action="heart" data-ride="${r.id}" aria-pressed="${on}" aria-label="${h((on?t('Убрать из списка: ','Remove from list: '):t('В список: ','Save: '))+loc(r.name))}">${icon('heart')}<span>${on?t('В списке','Saved'):t('В список','Save')}</span></button>`;
}
function slide(c,index,slot){
  const r=c.list[index];
  if(!r){
    if(index===c.list.length)return `<article class="sky-slide sky-end" data-slot="${slot}"><div><h2>${c.list.length?t('Вы посмотрели всё.','You have seen them all.'):t('Пока нет совпадений.','No matches yet.')}</h2><p>${interests().length?t('В вашем списке есть идеи для прогулки. Осталось выбрать билеты.','Your list has ideas for a day out. Choose your tickets next.'):t('Можно вернуться к началу и сохранить то, что понравилось.','Start again and save the rides you liked.')}</p><button class="sky-solid" data-sky-action="${interests().length?'list':'restart'}">${interests().length?t('Открыть список','Open your list'):t('Посмотреть снова','Browse again')}${icon('arrow')}</button><button class="sky-text" data-sky-action="${c.filtering?'filter':'restart'}">${c.filtering?t('Показать все аттракционы','Show all rides'):t('Начать заново','Start again')}</button></div></article>`;
    return '';
  }
  return `<article class="sky-slide" data-slot="${slot}" data-ride="${r.id}" ${slot!==0?'aria-hidden="true" inert':''}>
    <img class="sky-photo" src="${h(photo(r))}" alt="${h(loc(r.name))}" draggable="false" ${slot===0?'fetchpriority="high"':'loading="eager"'}>
    <div class="sky-photo-fallback" hidden>${t('Фото пока недоступно. Подбор продолжает работать.','Photo is unavailable. You can keep exploring.')}<button class="sky-text" data-sky-action="retry-photo">${t('Загрузить еще раз','Retry photo')}</button></div>
    <div class="sky-shade"></div><div class="sky-caption"><span class="sky-counter">${index+1} / ${c.list.length}</span><h2>${h(loc(r.name))}</h2><p>${h(loc(r.description))}</p><button class="sky-text" data-sky-action="details" data-sky-focus="details">${t('Подробнее','Details')}${icon('arrow')}</button></div>
    ${c.mode==='swipe'?`<div class="sky-verdict" aria-hidden="true"><span data-yes>${icon('heart')}${t('В список','Save')}</span><span data-no>${t('Пропустить','Skip')}${icon('arrow')}</span></div>`:''}
  </article>`;
}
function deck(c){return c.mode==='feed'?[-1,0,1].map(n=>slide(c,c.view.index+n,n)).join(''):slide(c,c.view.index+1,1)+slide(c,c.view.index,0);}
function controls(c){
  const r=current(c),end=!r;
  return `<div class="sky-actions" data-sky-controls>${c.mode==='feed'?`
    <button class="sky-circle" data-sky-action="prev" data-sky-focus="prev" aria-label="${t('Предыдущий аттракцион','Previous ride')}" ${c.view.index===0?'disabled':''}>${arrow('up')}</button>
    ${r?heartButton(r):`<button class="sky-save" data-sky-action="list">${icon('heart')}<span>${t('Ваш список','Your list')}</span></button>`}
    <button class="sky-circle" data-sky-action="next" data-sky-focus="next" aria-label="${t('Следующий аттракцион','Next ride')}" ${end?'disabled':''}>${arrow('down')}</button>`:`
    <button class="sky-circle" data-sky-action="undo" data-sky-focus="undo" aria-label="${t('Отменить последнее решение','Undo last decision')}" ${!c.view.undo.length?'disabled':''}>${icon('back')}</button>
    <button class="sky-skip" data-sky-action="skip" data-sky-focus="skip" ${end?'disabled':''}>${icon('close')}<span>${t('Пропустить','Skip')}</span></button>
    <button class="sky-save ${r&&selected(r.id)?'is-saved':''}" data-sky-action="yes" data-sky-focus="yes" ${end?'disabled':''}>${icon('heart')}<span>${t('В список','Save')}</span></button>`}</div>`;
}
function panelBody(c,p,hooks){
  const panel=panelOf(p);
  if(panel==='company')return `<div data-sky-company>${hooks.companyPanel()}</div>`;
  if(panel==='list'){
    const xs=rides.filter(r=>selected(r.id));
    return `<h2 id="sky-panel-title">${t('Ваш список','Your list')} <span class="muted">${xs.length}</span></h2><p class="sky-panel-intro">${t('Идеи на прогулку. Сохранение ничего не покупает.','Ideas for your day out. Saving does not buy anything.')}</p><div class="sky-list">${xs.map(r=>`<article><button class="sky-list-ride" data-sky-action="details" data-ride="${r.id}" data-sky-focus="item-${r.id}"><img src="${h(photo(r))}" alt="" loading="lazy"><span>${h(loc(r.name))}</span>${icon('chevron')}</button><button class="sky-list-remove" data-sky-action="remove" data-ride="${r.id}" aria-label="${h(t('Убрать из списка: ','Remove from list: ')+loc(r.name))}">${icon('close')}</button></article>`).join('')||`<p class="sky-empty-copy">${t('Нажмите на сердце у понравившегося аттракциона. Он появится здесь.','Tap a ride’s heart to save it here.')}</p>`}</div>${xs.length?`<a class="primary sky-panel-cta" href="#/checkout?from=saved">${t('Выбрать билеты из списка','Choose tickets from your list')}${icon('arrow')}</a>`:`<button class="primary" data-sky-action="close">${t('Продолжить подбор','Keep exploring')}</button>`}`;
  }
  if(panel==='help')return `<h2 id="sky-panel-title">${t('Каждому свой ритм.','Explore at your own pace.')}</h2><div class="sky-help"><h3>${t('Лента','Feed')}</h3><p>${t('Листайте вверх и вниз. Сердце добавляет аттракцион в список, не переключая фото.','Swipe up and down. The heart saves a ride without switching photos.')}</p><h3>${t('Свайпы','Swipes')}</h3><p>${t('Вправо: в список. Влево: пропустить. Последнее решение можно отменить.','Right: save. Left: skip. You can undo your last decision.')}</p><h3>${t('Без жестов','Without gestures')}</h3><p>${t('Используйте кнопки внизу. На компьютере доступны стрелки клавиатуры; в ленте также колесо мыши.','Use the buttons below. On a computer, use the arrow keys; the feed also supports the mouse wheel.')}</p><p class="fine">${t('Возрастные ориентиры демонстрационные. Они не подтверждают допуск.','Age guidance is a demo. It does not confirm admission.')}</p></div>`;
  const r=rides.find(r=>r.id===p.get('item'))||current(c);
  if(!r)return `<h2 id="sky-panel-title">${t('Аттракцион не найден','Ride not found')}</h2><button class="primary" data-sky-action="close">${t('Продолжить подбор','Keep exploring')}</button>`;
  return `<h2 id="sky-panel-title">${h(loc(r.name))}</h2><p class="sky-panel-intro">${h(loc(r.description))}</p><img class="sky-detail-photo" src="${h(photo(r))}" alt="${h(loc(r.name))}"><dl class="ride-facts"><div><dt>${t('Работает сейчас?','Open right now?')}</dt><dd>${t('Нужно уточнить у парка','Please check with the park')} <a href="#/availability?ride=${r.id}">${t('Что работает','What is open')}</a></dd></div><div><dt>${t('Допуск и сопровождение','Admission and accompanying adults')}</dt><dd>${t('Проверяются перед визитом','Check before your visit')}</dd></div></dl><div class="sky-detail-actions">${heartButton(r)}<a class="primary" href="#/checkout?ride=${r.id}&product=single">${t('Выбрать билеты','Choose tickets')}${icon('arrow')}</a></div><a class="text-link" href="${h(r.source)}" target="_blank" rel="noopener">${t('На официальном сайте парка','On the official park website')}</a><p class="demo-note">${t('Фото и описание из материалов парка. Покупка и возрастные ориентиры демонстрационные. Актуальные тарифы и допуск уточняйте у парка.','Photo and description from park materials. Purchases and age guidance are demos. Check current prices and admission with the park.')}</p>`;
}
export function renderExperience(p,hooks){
  const c=context(modeOf(p));
  const id=p.get('ride'),seed=c.list.findIndex(r=>r.id===id);
  if(seed>=0)c.view.index=seed;
  persist(c);
  return `<section class="sky-experience" data-sky-mode="${c.mode}" data-sky-ended="${!current(c)}" aria-label="${t(c.mode==='feed'?'Лента аттракционов':'Подбор свайпами',c.mode==='feed'?'Ride feed':'Swipe discovery')}"><h1 class="sr-only">${c.mode==='feed'?t('Лента аттракционов','Ride feed'):t('Подбор свайпами','Swipe discovery')}</h1>
    <div class="sky-stage" data-sky-stage tabindex="0" aria-describedby="sky-help-line"><div class="sky-deck" data-sky-deck>${deck(c)}</div></div>
    <header class="sky-top"><a class="sky-circle sky-exit" href="#/home" aria-label="${t('Выйти из подбора, на главную','Exit discovery, back to home')}">${icon('close')}</a><nav class="sky-modes" aria-label="${t('Режим подбора','Discovery mode')}"><a href="#/discover?mode=feed" ${c.mode==='feed'?'aria-current="page"':''}>${t('Лента','Feed')}</a><a href="#/discover?mode=swipe" ${c.mode==='swipe'?'aria-current="page"':''}>${t('Свайпы','Swipes')}</a></nav><button class="sky-list-entry" data-sky-action="list" data-sky-focus="list">${icon('heart')}<span>${t('Список','List')}</span><b data-sky-count>${interests().length}</b></button></header>
    <div class="sky-tools"><button data-sky-action="company" data-sky-focus="company">${t('Компания','Group')} <span data-sky-people>${company().people.length}</span>${icon('chevron')}</button><button data-sky-action="filter" aria-pressed="${c.filtering}" data-sky-focus="filter">${c.filtering?t('Возраст: демо','Age: demo'):t('Все возраста','All ages')}</button></div>
    <footer class="sky-bottom">${controls(c)}<button id="sky-help-line" class="sky-help-line" data-sky-action="help" data-sky-focus="help">${c.mode==='feed'?t('Листайте вверх. Сохраняйте сердцем.','Swipe up. Save with the heart.'):t('Влево пропустить. Вправо в список.','Left to skip. Right to save.')}<span aria-hidden="true">?</span></button></footer>
    <p class="sr-only" role="status" aria-live="polite" data-sky-live></p>
    ${panelOf(p)?`<dialog class="sky-dialog" aria-labelledby="${panelOf(p)==='company'?'sky-company-title':'sky-panel-title'}"><div class="sky-dialog-top"><button class="sky-dialog-close" data-sky-action="close" aria-label="${t('Закрыть и вернуться к подбору','Close and return to discovery')}">${icon('close')}</button></div><div class="sky-panel-body" data-sky-panel>${panelBody(c,p,hooks)}</div></dialog>`:''}
  </section>`;
}

export function bindExperience(root,p,hooks){
  let c=context(modeOf(p)),gesture=null,offset=0,settling=null,disposed=false,frame=0,childCleanup=null,wheelAmount=0,wheelAt=0,lastWheelCommit=0;
  const stage=root.querySelector('[data-sky-stage]'),deckEl=root.querySelector('[data-sky-deck]'),controlsEl=root.querySelector('[data-sky-controls]'),dialog=root.querySelector('dialog');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),panel=panelOf(p),duration=220;
  const ownHistory=history.state?.tmnDiscoveryPanel;
  const focusTarget=(scope,key)=>[...scope.querySelectorAll(`[data-sky-focus="${CSS.escape(key)}"]`)].find(el=>!el.closest('[inert]'));
  const size=()=>c.mode==='feed'?stage.clientHeight:stage.clientWidth;
  const announce=message=>{root.querySelector('[data-sky-live]').textContent=message;};
  const currentLabel=()=>current(c)?loc(current(c).name)+'. '+(c.view.index+1)+' / '+c.list.length:t('Вы посмотрели все аттракционы','You have seen all rides');
  const syncHearts=()=>{
    root.querySelector('[data-sky-count]').textContent=interests().length;
    root.querySelectorAll('[data-sky-action="heart"]').forEach(b=>{const on=selected(b.dataset.ride),r=rides.find(r=>r.id===b.dataset.ride);b.classList.toggle('is-saved',on);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',(on?t('Убрать из списка: ','Remove from list: '):t('В список: ','Save: '))+loc(r.name));b.querySelector('span').textContent=on?t('В списке','Saved'):t('В список','Save');});
  };
  const position=(value,animate=false)=>{
    offset=value;
    deckEl.querySelectorAll('[data-slot]').forEach(el=>{
      const slot=+el.dataset.slot;
      el.style.transition=animate&&!reduced.matches?`transform ${duration}ms cubic-bezier(.16,1,.3,1),opacity ${duration}ms ease-out`:'none';
      if(c.mode==='feed')el.style.transform=`translate3d(0,${slot*size()+value}px,0)`;
      else {el.style.transform=slot===0?`translate3d(${value}px,0,0) rotate(${value/Math.max(1,size())*8}deg)`:`scale(${.965+Math.min(1,Math.abs(value)/Math.max(1,size()))*.035})`;el.style.opacity=slot===0?'1':String(.75+Math.min(1,Math.abs(value)/Math.max(1,size()))*.25);}
      el.style.setProperty('--decision-strength',Math.min(1,Math.abs(value)/100));
      el.dataset.direction=value>0?'yes':'no';
    });
  };
  const wirePhotos=()=>deckEl.querySelectorAll('img').forEach(img=>{
    const error=()=>{img.hidden=true;img.closest('.sky-slide').querySelector('.sky-photo-fallback').hidden=false;};
    img.onerror=error;img.onload=()=>{img.hidden=false;img.closest('.sky-slide').querySelector('.sky-photo-fallback').hidden=true;};
    if(img.complete&&!img.naturalWidth)error();
  });
  const repaint=()=>{
    const active=document.activeElement?.dataset.skyAction;
    deckEl.innerHTML=deck(c);controlsEl.innerHTML=controls(c).replace(/^<div[^>]*>|<\/div>$/g,'');
    root.querySelector('[data-sky-count]').textContent=interests().length;
    root.querySelector('.sky-experience').dataset.skyEnded=String(!current(c));
    position(0);wirePhotos();
    if(active)controlsEl.querySelector(`[data-sky-action="${active}"]:not(:disabled)`)?.focus({preventScroll:true});
    announce(currentLabel());
  };
  const cancelSettle=finish=>{if(!settling)return;if(finish)settling.finish();else{clearTimeout(settling.timer);settling=null;position(0);}};
  const settleBack=()=>{cancelSettle(false);position(0,true);};
  const move=(direction,decision=null)=>{
    if(panel)return;
    cancelSettle(true);gesture=null;
    const r=current(c),target=c.view.index+direction;
    if(target<0||target>c.list.length||decision&&!r){settleBack();return;}
    const start=offset,travel=c.mode==='feed'?-direction*size():(decision==='yes'?size():-size());
    position(reduced.matches?0:start);void deckEl.offsetHeight;position(reduced.matches?0:travel,true);
    const run={timer:null,finish:()=>{
      if(settling!==run||disposed)return;
      clearTimeout(run.timer);settling=null;
      if(decision){const added=decision==='yes'&&!selected(r.id);if(added)write('saved',[...interests(),r.id]);c.view.undo.push({id:r.id,index:c.view.index,added,decision});}
      c.view.index=target;persist(c);updateURL(c);repaint();
    }};
    settling=run;if(reduced.matches)run.finish();else run.timer=setTimeout(run.finish,duration);
  };
  const undo=()=>{
    cancelSettle(true);const action=c.view.undo.pop();if(!action)return;
    const found=c.list.findIndex(r=>r.id===action.id);if(found<0)return;
    if(action.added)write('saved',interests().filter(id=>id!==action.id));
    c.view.index=found;persist(c);updateURL(c);repaint();announce(t('Решение отменено. ','Decision undone. ')+currentLabel());
  };
  const toggle=(id)=>{
    cancelSettle(true);const xs=interests(),on=!xs.includes(id);
    // An explicit change after a swipe is a newer intention than that swipe.
    c.view.undo=c.view.undo.map(x=>x.id===id?{...x,added:false}:x);
    write('saved',on?[...xs,id]:xs.filter(x=>x!==id));persist(c);syncHearts();
    announce(on?t('Добавлено в список','Added to your list'):t('Удалено из списка','Removed from your list'));
  };
  const changeHash=(hash,state,replace=false)=>{
    if(replace)history.replaceState(state,'',hash);else history.pushState(state,'',hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const closePanel=()=>{
    focusReturn={mode:c.mode,key:ownHistory?.focus||panel||'details'};
    if(ownHistory?.base)history.back();else changeHash('#'+baseURL(c.mode),null,true);
  };
  const openPanel=(type,b)=>{
    cancelSettle(true);gesture=null;position(0);persist(c);
    const query=new URLSearchParams({mode:c.mode,panel:type});
    if(type==='details'&&(b?.dataset.ride||current(c)?.id))query.set('item',b?.dataset.ride||current(c).id);
    changeHash('#/discover?'+query,{tmnDiscoveryPanel:{base:location.hash,focus:b?.dataset.skyFocus||type}});
  };
  const refreshPanelList=()=>{
    const panelRoot=root.querySelector('[data-sky-panel]');if(!panelRoot)return;
    panelRoot.innerHTML=panelBody(c,p,hooks);syncHearts();
    panelRoot.querySelector('button,a')?.focus({preventScroll:true});
  };
  const click=e=>{
    const b=e.target.closest('[data-sky-action]');if(!b)return;
    const a=b.dataset.skyAction;
    if(['details','list','company','help'].includes(a))openPanel(a,b);
    else if(a==='close')closePanel();
    else if(a==='heart')toggle(b.dataset.ride);
    else if(a==='remove'){toggle(b.dataset.ride);refreshPanelList();}
    else if(a==='next')move(1);
    else if(a==='prev')move(-1);
    else if(a==='yes')move(1,'yes');
    else if(a==='skip')move(1,'skip');
    else if(a==='undo')undo();
    else if(a==='restart'){cancelSettle(true);c.view={index:0,rideId:null,atEnd:false,undo:[]};persist(c);updateURL(c);repaint();}
    else if(a==='filter'){
      cancelSettle(true);persist(c);write('discovery-filter',!c.filtering);c=context(c.mode);persist(c);updateURL(c);repaint();
      b.setAttribute('aria-pressed',String(c.filtering));b.textContent=c.filtering?t('Возраст: демо','Age: demo'):t('Все возраста','All ages');
      announce(c.filtering?t('Применен демонстрационный возрастной ориентир. Это не проверка допуска.','Demo age guidance applied. This is not an admission check.'):t('Показаны все возраста','Showing all ages'));
      if(c.filtering&&!company().people.some(x=>x.band!=='unknown'))notify(t('Возраст пока не указан. Показаны все аттракционы.','No age selected yet. Showing all rides.'));
    }else if(a==='retry-photo'){const img=b.closest('.sky-slide').querySelector('img');img.src=photo(rides.find(r=>r.id===b.closest('.sky-slide').dataset.ride));}
  };
  const down=e=>{
    if(panel||e.target.closest('button,a,input,select,textarea')||e.pointerType==='mouse'&&e.button!==0)return;
    if(gesture&&gesture.id!==e.pointerId){gesture=null;settleBack();return;}
    cancelSettle(true);gesture={id:e.pointerId,x:e.clientX,y:e.clientY,last:c.mode==='feed'?e.clientY:e.clientX,time:e.timeStamp,velocity:0,locked:false};
    stage.focus({preventScroll:true});try{stage.setPointerCapture(e.pointerId);}catch{}
  };
  const pointerMove=e=>{
    const g=gesture;if(!g||g.id!==e.pointerId)return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y,travel=c.mode==='feed'?dy:dx,cross=c.mode==='feed'?dx:dy;
    if(!g.locked&&Math.abs(cross)>Math.abs(travel)+8){gesture=null;settleBack();return;}
    if(Math.abs(travel)>8)g.locked=true;
    const value=c.mode==='feed'?e.clientY:e.clientX,dt=e.timeStamp-g.time;
    if(dt>0)g.velocity=(value-g.last)/dt;g.last=value;g.time=e.timeStamp;
    let visual=travel;if(c.mode==='feed'&&(c.view.index===0&&travel>0||c.view.index===c.list.length&&travel<0)||c.mode==='swipe'&&!current(c))visual*=.2;
    if(g.locked)position(reduced.matches?0:visual);
  };
  const up=e=>{
    const g=gesture;if(!g||g.id!==e.pointerId)return;gesture=null;
    const travel=c.mode==='feed'?e.clientY-g.y:e.clientX-g.x,velocity=e.timeStamp-g.time>100?0:g.velocity;
    const commit=g.locked&&(Math.abs(travel)>Math.min(96,size()*.16)||Math.abs(travel)>30&&Math.abs(velocity)>.5&&Math.sign(velocity)===Math.sign(travel));
    try{stage.releasePointerCapture(e.pointerId);}catch{}
    if(commit)move(c.mode==='feed'?(travel<0?1:-1):1,c.mode==='swipe'?(travel>0?'yes':'skip'):null);else settleBack();
  };
  const cancel=e=>{if(!e||gesture?.id===e.pointerId){gesture=null;settleBack();}};
  const wheel=e=>{
    if(panel||e.ctrlKey||c.mode!=='feed'||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    e.preventDefault();const now=performance.now();
    if(now-wheelAt>180)wheelAmount=0;wheelAt=now;
    if(now-lastWheelCommit<260)return;
    wheelAmount+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?size():1);
    if(Math.abs(wheelAmount)>70){move(wheelAmount>0?1:-1);wheelAmount=0;lastWheelCommit=now;}
  };
  const key=e=>{
    if(panel||e.metaKey||e.ctrlKey||e.altKey||e.target.closest('input,textarea,select,button,a,summary'))return;
    const actions=c.mode==='feed'?{ArrowDown:()=>move(1),ArrowUp:()=>move(-1)}:{ArrowRight:()=>move(1,'yes'),ArrowLeft:()=>move(1,'skip'),Backspace:undo};
    if(actions[e.key]){e.preventDefault();actions[e.key]();}
  };
  const external=e=>{
    if(!e.detail?.external)return;
    if(e.detail.key==='saved'){cancelSettle(true);c.view.undo=c.view.undo.map(x=>({...x,added:false}));persist(c);syncHearts();if(panel==='list')refreshPanelList();}
    if(e.detail.key==='company'){
      cancelSettle(true);persist(c);c=context(c.mode);persist(c);repaint();root.querySelector('[data-sky-people]').textContent=company().people.length;
      if(panel==='company')notify(t('Компания изменена в другой вкладке. Здесь сохранится ваш открытый состав.','The group changed in another tab. Saving here will use the group you are editing.'));
    }
  };
  const visibility=()=>{if(document.hidden){gesture=null;cancelSettle(true);position(0);}};
  const resize=()=>{gesture=null;cancelSettle(true);position(0);};
  root.addEventListener('click',click);stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',pointerMove);stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',cancel);stage.addEventListener('lostpointercapture',cancel);stage.addEventListener('wheel',wheel,{passive:false});document.addEventListener('keydown',key);window.addEventListener('tmn:change',external);document.addEventListener('visibilitychange',visibility);window.addEventListener('resize',resize);reduced.addEventListener('change',resize);
  const cancelDialog=e=>{e.preventDefault();closePanel();};
  const trapDialog=e=>{
    if(e.key!=='Tab')return;
    const xs=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]'));
    if(!xs.length){e.preventDefault();return;}
    if(e.shiftKey&&document.activeElement===xs[0]){e.preventDefault();xs.at(-1).focus();}
    else if(!e.shiftKey&&document.activeElement===xs.at(-1)){e.preventDefault();xs[0].focus();}
  };
  if(dialog){
    dialog.addEventListener('cancel',cancelDialog);
    dialog.addEventListener('keydown',trapDialog);
    if(panel==='company'){
      const title=dialog.querySelector('h1');title.id='sky-company-title';
      dialog.querySelector('.company-page').append(dialog.querySelector('.company-save'));
      childCleanup=hooks.bindCompany(dialog.querySelector('[data-sky-company]'),closePanel);
    }
  }
  frame=requestAnimationFrame(()=>{
    position(0);wirePhotos();
    if(dialog){dialog.showModal();const focusKey=focusReturn?.mode===c.mode?focusReturn.key:null;const target=focusKey&&focusTarget(dialog,focusKey);(target||dialog.querySelector('.sky-dialog-close')).focus({preventScroll:true});}
    else if(focusReturn?.mode===c.mode){(focusTarget(root,focusReturn.key)||stage).focus({preventScroll:true});}
    else stage.focus({preventScroll:true});
    focusReturn=null;
  });
  return ()=>{
    if(panel&&!focusReturn)focusReturn={mode:c.mode,key:ownHistory?.focus||panel};
    cancelSettle(true);disposed=true;gesture=null;cancelAnimationFrame(frame);childCleanup?.();
    root.removeEventListener('click',click);stage.removeEventListener('pointerdown',down);stage.removeEventListener('pointermove',pointerMove);stage.removeEventListener('pointerup',up);stage.removeEventListener('pointercancel',cancel);stage.removeEventListener('lostpointercapture',cancel);stage.removeEventListener('wheel',wheel);document.removeEventListener('keydown',key);window.removeEventListener('tmn:change',external);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',resize);reduced.removeEventListener('change',resize);dialog?.removeEventListener('cancel',cancelDialog);dialog?.removeEventListener('keydown',trapDialog);
  };
}
