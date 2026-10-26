import {t,loc,h,read,write,company,notify,icon,uid} from './shared.js';
import {rides} from './data.js';
import {resolveDiscovery,saveDiscovery,classifyAxis,gestureDecision,recordDecision,undoDiscovery} from './discovery-model.js?v=r12';

// Only discovery progress lives here. The existing company, interests and orders
// retain their original keys and contracts.
const JOURNAL='discovery-progress-v3',LEGACY='discovery-progress-v2',INTENTS='discovery-saved-intent-v1',TUTORIAL='discovery-tutorial-v1';
const photo=r=>r.id==='ferris-wheel'?'assets/wheel.webp':r.image;
const interests=()=>read('saved',[]).filter(id=>rides.some(r=>r.id===id));
const selected=id=>interests().includes(id);
let focusReturn=null;
const baseURL=()=>'/discover';
const panelOf=p=>['details','list','company','help'].includes(p.get('panel'))?p.get('panel'):null;
const arrow=(direction)=>`<span class="sky-direction sky-direction-${direction}">${icon('arrow')}</span>`;

function context(params=new URLSearchParams()){
  let filtering=!!read('discovery-filter',false);
  const known=[...new Set(company().people.map(p=>p.band).filter(b=>b!=='unknown'))].sort();
  let list=filtering&&known.length?rides.filter(r=>known.some(b=>r.demoBands.includes(b))):rides;
  const explicit=rides.find(r=>r.id===params.get('ride'));
  const explicitFilterOverride=!!(filtering&&explicit&&!list.some(r=>r.id===explicit.id));
  if(explicitFilterOverride){filtering=false;list=rides;write('discovery-filter',false);}
  const signature=filtering?'age:'+known.join(','):'all';
  const {journal,view}=resolveDiscovery({stored:read(JOURNAL,null),legacy:read(LEGACY,null),requestedMode:params.get('mode'),explicitRide:params.get('ride'),listIds:list.map(r=>r.id),signature});
  return {filtering,list,signature,journal,view,explicitFilterOverride};
}
function persist(c){
  c.view.rideId=c.list[c.view.index]?.id||null;c.view.atEnd=c.list.length>0&&c.view.index===c.list.length;
  c.journal=saveDiscovery(read(JOURNAL,c.journal),c.signature,c.view);write(JOURNAL,c.journal);
}
function current(c){return c.list[c.view.index];}
function updateURL(c){
  const p=new URLSearchParams(location.hash.split('?')[1]||'');
  p.delete('mode');
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
    if(index===c.list.length)return `<article class="sky-slide sky-end" data-slot="${slot}" ${slot!==0?'aria-hidden="true" inert':''}><div><h2>${c.list.length?t('Вы посмотрели всё.','You have seen them all.'):t('Пока нет совпадений.','No matches yet.')}</h2><p>${interests().length?t('В вашем списке есть идеи для прогулки. Осталось выбрать билеты.','Your list has ideas for a day out. Choose your tickets next.'):t('Можно вернуться к началу и сохранить то, что понравилось.','Start again and save the rides you liked.')}</p><button class="sky-solid" data-sky-action="${interests().length?'list':'restart'}">${interests().length?t('Открыть список','Open your list'):t('Посмотреть снова','Browse again')}${icon('arrow')}</button><button class="sky-text" data-sky-action="${c.filtering?'filter':'restart'}">${c.filtering?t('Показать все аттракционы','Show all rides'):t('Начать заново','Start again')}</button></div></article>`;
    return '';
  }
  return `<article class="sky-slide" data-slot="${slot}" data-ride="${r.id}" ${slot!==0?'aria-hidden="true" inert':''}>
    <img class="sky-photo" src="${h(photo(r))}" alt="${h(loc(r.name))}" draggable="false" ${slot===0?'fetchpriority="high"':'loading="eager"'}>
    <div class="sky-photo-fallback" hidden>${t('Фото пока недоступно. Подбор продолжает работать.','Photo is unavailable. You can keep exploring.')}<button class="sky-text" data-sky-action="retry-photo">${t('Загрузить еще раз','Retry photo')}</button></div>
    <div class="sky-shade"></div><div class="sky-caption"><span class="sky-counter">${index+1} / ${c.list.length}</span><h2>${h(loc(r.name))}</h2><p>${h(loc(r.description))}</p><div class="sky-caption-actions"><a class="sky-buy" href="#/checkout?ride=${r.id}&product=single">${t('Выбрать билеты','Choose tickets')}${icon('arrow')}</a><button class="sky-text" data-sky-action="details" data-sky-focus="details">${t('Подробнее','Details')}</button></div></div>
    <div class="sky-verdict" aria-hidden="true"><span data-yes>${icon('heart')}${t('В список','Save')}</span><span data-no>${t('Пропустить','Skip')}${icon('arrow')}</span></div>
  </article>`;
}
function deck(c){return [-1,0,1].map(n=>slide(c,c.view.index+n,n)).join('');}
function controls(c){
  const r=current(c),end=!r;
  return `<div class="sky-actions" data-sky-controls><div class="sky-action-row">
    <button class="sky-circle" data-sky-action="prev" data-sky-focus="prev" aria-label="${t('Предыдущий аттракцион','Previous ride')}" ${c.view.index===0?'disabled':''}>${arrow('up')}</button>
    <button class="sky-skip" data-sky-action="skip" data-sky-focus="skip" ${end?'disabled':''}>${icon('close')}<span>${t('Пропустить','Skip')}</span></button>
    <button class="sky-save ${r&&selected(r.id)?'is-saved':''}" data-sky-action="yes" data-sky-focus="yes" ${end?'disabled':''}>${icon('heart')}<span>${t('В список','Save')}</span></button>
    <button class="sky-circle" data-sky-action="next" data-sky-focus="next" aria-label="${t('Следующий аттракцион','Next ride')}" ${end?'disabled':''}>${arrow('down')}</button>
    </div><div class="sky-secondary-row"><button class="sky-undo" data-sky-action="undo" data-sky-focus="undo" ${!c.view.undo.length?'disabled':''}>${icon('back')}<span>${t('Отменить','Undo')}</span></button><button id="sky-help-line" class="sky-help-line" data-sky-action="help" data-sky-focus="help">${t('Как пользоваться','How it works')}<span aria-hidden="true">?</span></button></div></div>`;
}
function tutorialMarkup(){
  return `<aside class="sky-tutorial" data-sky-tutorial data-phase="0" aria-label="${t('Подсказка по жестам','Gesture guide')}"><button class="sky-tutorial-close" data-sky-action="dismiss-tutorial" aria-label="${t('Закрыть подсказку','Close guide')}">${icon('close')}</button><div class="sky-tutorial-demo" aria-hidden="true"><div class="sky-tutorial-card"><span></span><i></i></div><div class="sky-tutorial-finger"></div></div><p data-sky-tutorial-text>${t('Вверх и вниз: смотреть','Up and down: browse')}</p><div class="sky-tutorial-steps" aria-hidden="true"><i></i><i></i><i></i></div></aside>`;
}
function panelBody(c,p,hooks){
  const panel=panelOf(p);
  if(panel==='company')return `<div data-sky-company>${hooks.companyPanel()}</div>`;
  if(panel==='list'){
    const xs=rides.filter(r=>selected(r.id));
    return `<h2 id="sky-panel-title">${t('Ваш список','Your list')} <span class="muted">${xs.length}</span></h2><p class="sky-panel-intro">${t('Идеи на прогулку. Сохранение ничего не покупает.','Ideas for your day out. Saving does not buy anything.')}</p><div class="sky-list">${xs.map(r=>`<article><button class="sky-list-ride" data-sky-action="details" data-ride="${r.id}" data-sky-focus="item-${r.id}"><img src="${h(photo(r))}" alt="" loading="lazy"><span>${h(loc(r.name))}</span>${icon('chevron')}</button><button class="sky-list-remove" data-sky-action="remove" data-ride="${r.id}" aria-label="${h(t('Убрать из списка: ','Remove from list: ')+loc(r.name))}">${icon('close')}</button></article>`).join('')||`<p class="sky-empty-copy">${t('Нажмите на сердце у понравившегося аттракциона. Он появится здесь.','Tap a ride’s heart to save it here.')}</p>`}</div>${xs.length?`<a class="primary sky-panel-cta" href="#/checkout?from=saved">${t('Выбрать билеты из списка','Choose tickets from your list')}${icon('arrow')}</a>`:`<button class="primary" data-sky-action="close">${t('Продолжить подбор','Keep exploring')}</button>`}`;
  }
  if(panel==='help')return `<h2 id="sky-panel-title">${t('Как выбирать аттракционы','How to browse rides')}</h2><div class="sky-help"><h3>${t('Вверх и вниз: смотреть','Up and down: browse')}</h3><p>${t('Переключайте аттракционы. Просмотр не меняет ваш список.','Switch between rides. Browsing does not change your list.')}</p><h3>${t('Вправо: сохранить','Right: save')}</h3><p>${t('Аттракцион попадет в список, и откроется следующий.','The ride is saved to your list, then the next one opens.')}</p><h3>${t('Влево: пропустить','Left: skip')}</h3><p>${t('Откроется следующий аттракцион. Уже сохраненное останется в списке. Последнее решение можно отменить.','The next ride opens. Saved rides stay in your list. You can undo your last decision.')}</p><button class="primary" data-sky-action="replay-tutorial">${t('Показать жесты','Show the gestures')}</button><h3>${t('Без жестов','Without gestures')}</h3><p>${t('Используйте кнопки под фото. На компьютере работают четыре стрелки клавиатуры и колесо мыши. Backspace отменяет решение.','Use the buttons below the photo. On a computer, use all four arrow keys or the mouse wheel. Backspace undoes a decision.')}</p><p class="fine">${t('Возрастные ориентиры демонстрационные. Они не подтверждают допуск.','Age guidance is a demo. It does not confirm admission.')}</p></div>`;
  const r=rides.find(r=>r.id===p.get('item'))||current(c);
  if(!r)return `<h2 id="sky-panel-title">${t('Аттракцион не найден','Ride not found')}</h2><button class="primary" data-sky-action="close">${t('Продолжить подбор','Keep exploring')}</button>`;
  return `<h2 id="sky-panel-title">${h(loc(r.name))}</h2><p class="sky-panel-intro">${h(loc(r.description))}</p><img class="sky-detail-photo" src="${h(photo(r))}" alt="${h(loc(r.name))}"><dl class="ride-facts"><div><dt>${t('Работает сейчас?','Open right now?')}</dt><dd>${t('Нужно уточнить у парка','Please check with the park')} <a href="#/availability?ride=${r.id}">${t('Что работает','What is open')}</a></dd></div><div><dt>${t('Допуск и сопровождение','Admission and accompanying adults')}</dt><dd>${t('Проверяются перед визитом','Check before your visit')}</dd></div></dl><div class="sky-detail-actions">${heartButton(r)}<a class="primary" href="#/checkout?ride=${r.id}&product=single">${t('Выбрать билеты','Choose tickets')}${icon('arrow')}</a></div><a class="text-link" href="${h(r.source)}" target="_blank" rel="noopener">${t('На официальном сайте парка','On the official park website')}</a><p class="demo-note">${t('Фото и описание из материалов парка. Покупка и возрастные ориентиры демонстрационные. Актуальные тарифы и допуск уточняйте у парка.','Photo and description from park materials. Purchases and age guidance are demos. Check current prices and admission with the park.')}</p>`;
}
export function renderExperience(p,hooks){
  const c=context(p);
  if(c.explicitFilterOverride)notify(t('Показаны все аттракционы, чтобы открыть ссылку.','Showing all rides to open this link.'));
  persist(c);
  return `<section class="sky-experience" data-sky-mode="unified" data-sky-ended="${!current(c)}" aria-label="${t('Аттракционы','Attractions')}"><h1 class="sr-only">${t('Аттракционы','Attractions')}</h1>
    <div class="sky-stage" data-sky-stage tabindex="0" aria-describedby="sky-help-line"><div class="sky-deck" data-sky-deck>${deck(c)}</div></div>
    <header class="sky-top"><a class="sky-circle sky-exit" href="#/home" aria-label="${t('Выйти из подбора, на главную','Exit discovery, back to home')}">${icon('close')}</a><span class="sky-stream-title">${t('Аттракционы','Attractions')}</span><button class="sky-list-entry" data-sky-action="list" data-sky-focus="list">${icon('heart')}<span>${t('Список','List')}</span><b data-sky-count>${interests().length}</b></button></header>
    <div class="sky-tools"><button data-sky-action="company" data-sky-focus="company">${t('Компания','Group')} <span data-sky-people>${company().people.length}</span>${icon('chevron')}</button><button data-sky-action="filter" aria-pressed="${c.filtering}" data-sky-focus="filter">${c.filtering?t('Возраст: демо','Age: demo'):t('Все возраста','All ages')}</button></div>
    <footer class="sky-bottom">${controls(c)}</footer>
    ${!panelOf(p)&&!read(TUTORIAL,{}).seen?tutorialMarkup():''}
    <p class="sr-only" role="status" aria-live="polite" data-sky-live></p>
    ${panelOf(p)?`<dialog class="sky-dialog" aria-labelledby="${panelOf(p)==='company'?'sky-company-title':'sky-panel-title'}"><div class="sky-dialog-top"><button class="sky-dialog-close" data-sky-action="close" aria-label="${t('Закрыть и вернуться к подбору','Close and return to discovery')}">${icon('close')}</button></div><div class="sky-panel-body" data-sky-panel>${panelBody(c,p,hooks)}</div></dialog>`:''}
  </section>`;
}

export function bindExperience(root,p,hooks){
  let c=context(p),gesture=null,offset=0,motionAxis='y',settling=null,disposed=false,frame=0,childCleanup=null,wheelAmount=0,wheelAt=0,lastWheelCommit=-Infinity,suppressClickUntil=0,multiTouch=false;
  const pointers=new Set(),tutorialTimers=new Set();
  const stage=root.querySelector('[data-sky-stage]'),deckEl=root.querySelector('[data-sky-deck]'),controlsEl=root.querySelector('[data-sky-controls]'),dialog=root.querySelector('dialog');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),panel=panelOf(p),duration=230;
  const ownHistory=history.state?.tmnDiscoveryPanel;
  const focusTarget=(scope,key)=>[...scope.querySelectorAll(`[data-sky-focus="${CSS.escape(key)}"]`)].find(el=>!el.closest('[inert]'));
  const interactive=target=>target?.closest('input,textarea,select,button,a,summary,[contenteditable]:not([contenteditable="false"])');
  const size=axis=>axis==='x'?stage.clientWidth:stage.clientHeight;
  const announce=message=>{root.querySelector('[data-sky-live]').textContent=message;};
  const currentLabel=()=>current(c)?loc(current(c).name)+'. '+(c.view.index+1)+' / '+c.list.length:t('Вы посмотрели все аттракционы','You have seen all rides');
  const markIntent=id=>{const token=uid('saved-intent');write(INTENTS,{...read(INTENTS,{}),[id]:token});return token;};
  const dismissTutorial=()=>{
    tutorialTimers.forEach(clearTimeout);tutorialTimers.clear();
    const tutorial=root.querySelector('[data-sky-tutorial]');if(tutorial){tutorial.remove();write(TUTORIAL,{version:1,seen:true});}
  };
  const finishTutorialLater=()=>{const timer=setTimeout(()=>{tutorialTimers.delete(timer);dismissTutorial();},6600);tutorialTimers.add(timer);};
  const startTutorial=()=>{
    const tutorial=root.querySelector('[data-sky-tutorial]');if(!tutorial||panel)return;
    write(TUTORIAL,{version:1,seen:true});
    finishTutorialLater();
    if(reduced.matches){tutorial.dataset.static='true';tutorial.querySelector('[data-sky-tutorial-text]').textContent=t('↕ Смотреть · → В список · ← Пропустить','↕ Browse · → Save · ← Skip');return;}
    const phrases=[t('Вверх и вниз: смотреть','Up and down: browse'),t('Вправо: в список','Right: save'),t('Влево: пропустить','Left: skip')];
    for(const [phase,delay]of [[1,2200],[2,4400]]){const timer=setTimeout(()=>{tutorialTimers.delete(timer);if(disposed||!tutorial.isConnected)return;tutorial.dataset.phase=String(phase);tutorial.querySelector('[data-sky-tutorial-text]').textContent=phrases[phase];},delay);tutorialTimers.add(timer);}
  };
  const syncHearts=()=>{
    root.querySelector('[data-sky-count]').textContent=interests().length;
    root.querySelectorAll('[data-sky-action="heart"]').forEach(b=>{const on=selected(b.dataset.ride),r=rides.find(r=>r.id===b.dataset.ride);b.classList.toggle('is-saved',on);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',(on?t('Убрать из списка: ','Remove from list: '):t('В список: ','Save: '))+loc(r.name));b.querySelector('span').textContent=on?t('В списке','Saved'):t('В список','Save');});
    const yes=root.querySelector('[data-sky-action="yes"]');if(yes)yes.classList.toggle('is-saved',!!current(c)&&selected(current(c).id));
  };
  const position=(value,animate=false,axis=motionAxis)=>{
    offset=value;motionAxis=axis;
    deckEl.querySelectorAll('[data-slot]').forEach(el=>{
      const slot=+el.dataset.slot;el.dataset.gestureAxis=axis;
      el.style.transition=animate&&!reduced.matches?`transform ${duration}ms cubic-bezier(.16,1,.3,1),opacity ${duration}ms ease-out`:'none';
      if(axis==='y'){el.style.transform=`translate3d(0,${slot*size('y')+value}px,0)`;el.style.opacity='1';}
      else{el.style.transform=slot===0?`translate3d(${value}px,0,0) rotate(${value/Math.max(1,size('x'))*6}deg)`:`scale(${.975+Math.min(1,Math.abs(value)/Math.max(1,size('x')))*.025})`;el.style.opacity=slot===-1?'0':slot===0?'1':String(.8+Math.min(1,Math.abs(value)/Math.max(1,size('x')))*.2);}
      el.style.setProperty('--decision-strength',axis==='x'?Math.min(1,Math.abs(value)/110):0);el.dataset.direction=value>0?'yes':'no';
    });
  };
  const wirePhotos=()=>deckEl.querySelectorAll('img').forEach(img=>{
    const error=()=>{img.hidden=true;img.closest('.sky-slide').querySelector('.sky-photo-fallback').hidden=false;};
    img.onerror=error;img.onload=()=>{img.hidden=false;img.closest('.sky-slide').querySelector('.sky-photo-fallback').hidden=true;};
    if(img.complete&&!img.naturalWidth)error();
  });
  const repaint=()=>{
    if(disposed)return;
    const active=document.activeElement?.dataset.skyAction;
    deckEl.innerHTML=deck(c);controlsEl.innerHTML=controls(c).replace(/^<div[^>]*>|<\/div>$/g,'');
    root.querySelector('.sky-experience').dataset.skyEnded=String(!current(c));position(0,false,'y');wirePhotos();syncHearts();
    if(active)controlsEl.querySelector(`[data-sky-action="${active}"]:not(:disabled)`)?.focus({preventScroll:true});
    announce(currentLabel());
  };
  const cancelSettle=()=>{if(!settling)return;clearTimeout(settling.timer);settling=null;repaint();};
  const settleBack=()=>{cancelSettle();position(0,true);};
  const move=(direction,decision=null)=>{
    if(panel||disposed)return;
    dismissTutorial();cancelSettle();gesture=null;
    const r=current(c),target=c.view.index+direction;if(target<0||target>c.list.length||decision&&!r){settleBack();return;}
    const start=offset,axis=decision?'x':'y',travel=decision?(decision==='yes'?size('x'):-size('x')):-direction*size('y');
    if(decision){
      const added=decision==='yes'&&!selected(r.id),token=decision==='yes'?markIntent(r.id):null;
      if(added)write('saved',[...interests(),r.id]);
      c.view=recordDecision(c.view,{id:r.id,added,decision,token});
    }
    c.view.index=target;persist(c);updateURL(c);
    if(reduced.matches){repaint();return;}
    position(start,false,axis);void deckEl.offsetHeight;position(travel,true,axis);
    const run={timer:setTimeout(()=>{if(disposed||settling!==run)return;settling=null;repaint();},duration)};settling=run;
  };
  const undo=()=>{
    if(panel)return;dismissTutorial();cancelSettle();gesture=null;
    const result=undoDiscovery(c.view,c.list.map(r=>r.id),interests(),read(INTENTS,{}));c.view=result.view;
    if(result.reverted){markIntent(result.action.id);write('saved',result.saved);}
    persist(c);updateURL(c);repaint();if(result.action)announce(t('Решение отменено. ','Decision undone. ')+currentLabel());
  };
  const toggle=id=>{
    cancelSettle();const xs=interests(),on=!xs.includes(id);markIntent(id);
    write('saved',on?[...xs,id]:xs.filter(x=>x!==id));syncHearts();
    announce(on?t('Добавлено в список','Added to your list'):t('Удалено из списка','Removed from your list'));
  };
  const changeHash=(hash,state,replace=false)=>{
    if(replace)history.replaceState(state,'',hash);else history.pushState(state,'',hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const closePanel=()=>{
    focusReturn={key:ownHistory?.focus||panel||'details'};
    if(ownHistory?.base)history.back();else changeHash('#'+baseURL(),null,true);
  };
  const openPanel=(type,b)=>{
    cancelSettle();gesture=null;position(0);persist(c);
    const query=new URLSearchParams({panel:type});
    if(type==='details'&&(b?.dataset.ride||current(c)?.id))query.set('item',b?.dataset.ride||current(c).id);
    changeHash('#/discover?'+query,{tmnDiscoveryPanel:{base:location.hash,focus:b?.dataset.skyFocus||type}});
  };
  const refreshPanelList=()=>{
    const panelRoot=root.querySelector('[data-sky-panel]');if(!panelRoot)return;
    panelRoot.innerHTML=panelBody(c,p,hooks);syncHearts();panelRoot.querySelector('button,a')?.focus({preventScroll:true});
  };
  const click=e=>{
    if(performance.now()<suppressClickUntil){e.preventDefault();return;}
    const b=e.target.closest('[data-sky-action]');if(!b||b.disabled)return;
    const action=b.dataset.skyAction;dismissTutorial();
    if(['details','list','company','help'].includes(action))openPanel(action,b);
    else if(action==='close')closePanel();
    else if(action==='replay-tutorial'){write(TUTORIAL,{version:1,seen:false});closePanel();}
    else if(action==='heart')toggle(b.dataset.ride);
    else if(action==='remove'){toggle(b.dataset.ride);refreshPanelList();}
    else if(action==='next')move(1);
    else if(action==='prev')move(-1);
    else if(action==='yes')move(1,'yes');
    else if(action==='skip')move(1,'skip');
    else if(action==='undo')undo();
    else if(action==='restart'){cancelSettle();c.view={index:0,rideId:null,atEnd:false,undo:[]};persist(c);updateURL(c);repaint();}
    else if(action==='filter'){
      cancelSettle();gesture=null;persist(c);write('discovery-filter',!c.filtering);c=context();persist(c);updateURL(c);repaint();
      b.setAttribute('aria-pressed',String(c.filtering));b.textContent=c.filtering?t('Возраст: демо','Age: demo'):t('Все возраста','All ages');
      announce(c.filtering?t('Применен демонстрационный возрастной ориентир. Это не проверка допуска.','Demo age guidance applied. This is not an admission check.'):t('Показаны все возраста','Showing all ages'));
      if(c.filtering&&!company().people.some(x=>x.band!=='unknown'))notify(t('Возраст пока не указан. Показаны все аттракционы.','No age selected yet. Showing all rides.'));
    }else if(action==='retry-photo'){const img=b.closest('.sky-slide').querySelector('img');img.src=photo(rides.find(r=>r.id===b.closest('.sky-slide').dataset.ride));}
  };
  const cancelGesture=()=>{gesture=null;settleBack();};
  const observeDown=e=>{
    dismissTutorial();if(e.pointerType!=='mouse'){pointers.add(e.pointerId);if(pointers.size>1){multiTouch=true;cancelGesture();}}
  };
  const observeUp=e=>{pointers.delete(e.pointerId);if(!pointers.size)multiTouch=false;};
  const down=e=>{
    if(panel||interactive(e.target)||multiTouch||e.isPrimary===false||e.pointerType==='mouse'&&e.button!==0)return;
    const rect=stage.getBoundingClientRect();if(e.pointerType!=='mouse'&&(e.clientX-rect.left<24||rect.right-e.clientX<24))return;
    if(gesture&&gesture.id!==e.pointerId){multiTouch=true;cancelGesture();return;}
    cancelSettle();gesture={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,time:e.timeStamp,velocity:0,axis:null};
    stage.focus({preventScroll:true});try{stage.setPointerCapture(e.pointerId);}catch{}
  };
  const pointerMove=e=>{
    const g=gesture;if(!g||g.id!==e.pointerId||multiTouch)return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;g.axis=classifyAxis(dx,dy,g.axis);if(!g.axis)return;
    const travel=g.axis==='x'?dx:dy,value=g.axis==='x'?e.clientX:e.clientY,last=g.axis==='x'?g.lastX:g.lastY,dt=e.timeStamp-g.time;
    if(dt>0)g.velocity=(value-last)/dt;g.lastX=e.clientX;g.lastY=e.clientY;g.time=e.timeStamp;
    let visual=travel;if(g.axis==='y'&&(c.view.index===0&&travel>0||c.view.index===c.list.length&&travel<0)||g.axis==='x'&&!current(c))visual*=.2;
    position(reduced.matches?0:visual,false,g.axis);
  };
  const up=e=>{
    const g=gesture;if(!g||g.id!==e.pointerId)return;gesture=null;
    const decision=multiTouch?null:gestureDecision({axis:g.axis,dx:e.clientX-g.x,dy:e.clientY-g.y,velocity:e.timeStamp-g.time>100?0:g.velocity,width:size('x'),height:size('y')});
    try{stage.releasePointerCapture(e.pointerId);}catch{}
    if(g.axis)suppressClickUntil=performance.now()+280;
    if(decision==='yes'||decision==='skip')move(1,decision);else if(decision)move(decision==='next'?1:-1);else settleBack();
  };
  const cancel=e=>{pointers.delete(e?.pointerId);if(!pointers.size)multiTouch=false;if(!e||gesture?.id===e.pointerId)cancelGesture();};
  const wheel=e=>{
    if(panel||e.ctrlKey||interactive(e.target)||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    dismissTutorial();e.preventDefault();const now=performance.now();if(now-wheelAt>180)wheelAmount=0;wheelAt=now;
    if(now-lastWheelCommit<320)return;wheelAmount+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?size('y'):1);
    if(Math.abs(wheelAmount)>70){move(wheelAmount>0?1:-1);wheelAmount=0;lastWheelCommit=now;}
  };
  const key=e=>{
    if(panel||e.metaKey||e.ctrlKey||e.altKey||interactive(e.target))return;
    const actions={ArrowDown:()=>move(1),ArrowUp:()=>move(-1),ArrowRight:()=>move(1,'yes'),ArrowLeft:()=>move(1,'skip'),Backspace:undo};
    if(actions[e.key]){e.preventDefault();dismissTutorial();actions[e.key]();}
  };
  const external=e=>{
    if(!e.detail?.external)return;
    if(e.detail.key==='saved'){cancelSettle();syncHearts();if(panel==='list')refreshPanelList();}
    if(['company','discovery-filter',JOURNAL].includes(e.detail.key)){
      cancelSettle();gesture=null;c=context();persist(c);repaint();root.querySelector('[data-sky-people]').textContent=company().people.length;
      const button=root.querySelector('[data-sky-action="filter"]');button.setAttribute('aria-pressed',String(c.filtering));button.textContent=c.filtering?t('Возраст: демо','Age: demo'):t('Все возраста','All ages');
      if(panel==='company'&&e.detail.key==='company')notify(t('Компания изменена в другой вкладке. Здесь сохранится ваш открытый состав.','The group changed in another tab. Saving here will use the group you are editing.'));
    }
  };
  const visibility=()=>{if(document.hidden){cancelGesture();cancelSettle();dismissTutorial();pointers.clear();multiTouch=false;}};
  const resize=()=>{cancelGesture();cancelSettle();position(0,false,'y');if(reduced.matches&&root.querySelector('[data-sky-tutorial]')){tutorialTimers.forEach(clearTimeout);tutorialTimers.clear();finishTutorialLater();const tutorial=root.querySelector('[data-sky-tutorial]');tutorial.dataset.static='true';tutorial.querySelector('[data-sky-tutorial-text]').textContent=t('↕ Смотреть · → В список · ← Пропустить','↕ Browse · → Save · ← Skip');}};
  root.addEventListener('click',click);root.addEventListener('pointerdown',observeDown,true);root.addEventListener('pointerup',observeUp,true);root.addEventListener('pointercancel',observeUp,true);
  stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',pointerMove);stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',cancel);stage.addEventListener('lostpointercapture',cancel);stage.addEventListener('wheel',wheel,{passive:false});document.addEventListener('keydown',key);window.addEventListener('tmn:change',external);document.addEventListener('visibilitychange',visibility);window.addEventListener('resize',resize);reduced.addEventListener('change',resize);
  const cancelDialog=e=>{e.preventDefault();closePanel();};
  const trapDialog=e=>{
    if(e.key!=='Tab')return;
    const xs=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]'));
    if(!xs.length){e.preventDefault();return;}
    if(e.shiftKey&&document.activeElement===xs[0]){e.preventDefault();xs.at(-1).focus();}
    else if(!e.shiftKey&&document.activeElement===xs.at(-1)){e.preventDefault();xs[0].focus();}
  };
  if(dialog){dialog.addEventListener('cancel',cancelDialog);dialog.addEventListener('keydown',trapDialog);
    if(panel==='company'){const title=dialog.querySelector('h1');title.id='sky-company-title';dialog.querySelector('.company-page').append(dialog.querySelector('.company-save'));childCleanup=hooks.bindCompany(dialog.querySelector('[data-sky-company]'),closePanel);}
  }
  frame=requestAnimationFrame(()=>{
    if(disposed)return;position(0,false,'y');wirePhotos();startTutorial();
    if(dialog){dialog.showModal();const target=focusReturn?.key&&focusTarget(dialog,focusReturn.key);(target||dialog.querySelector('.sky-dialog-close')).focus({preventScroll:true});}
    else if(focusReturn?.key)(focusTarget(root,focusReturn.key)||stage).focus({preventScroll:true});else stage.focus({preventScroll:true});focusReturn=null;
  });
  return ()=>{
    if(panel&&!focusReturn)focusReturn={key:ownHistory?.focus||panel};
    disposed=true;gesture=null;pointers.clear();if(settling)clearTimeout(settling.timer);settling=null;tutorialTimers.forEach(clearTimeout);tutorialTimers.clear();cancelAnimationFrame(frame);childCleanup?.();
    root.removeEventListener('click',click);root.removeEventListener('pointerdown',observeDown,true);root.removeEventListener('pointerup',observeUp,true);root.removeEventListener('pointercancel',observeUp,true);
    stage.removeEventListener('pointerdown',down);stage.removeEventListener('pointermove',pointerMove);stage.removeEventListener('pointerup',up);stage.removeEventListener('pointercancel',cancel);stage.removeEventListener('lostpointercapture',cancel);stage.removeEventListener('wheel',wheel);document.removeEventListener('keydown',key);window.removeEventListener('tmn:change',external);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',resize);reduced.removeEventListener('change',resize);dialog?.removeEventListener('cancel',cancelDialog);dialog?.removeEventListener('keydown',trapDialog);
    deckEl.querySelectorAll('img').forEach(img=>{img.onload=null;img.onerror=null;});
  };
}
