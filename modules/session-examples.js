import {t,lang,loc,h,money,icon} from './shared.js';
import {events} from './data.js';

const dateLabel=date=>new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',timeZone:'Asia/Yekaterinburg'}).format(new Date(`${date}T12:00:00+05:00`));

// Shared entry cards: the selected route opens the existing booking engine directly.
export function renderSessionExamples({compact=false}={}) {
  return `<div class="session-examples ${compact?'is-compact':''}">${events.map(event=>{
    const seats=event.mode==='seated',dates=event.dates.map(dateLabel);
    const title=loc(event.name).replace(/:\s*(демосеанс|demo session)$/i,'');
    const type=seats?t('С выбором мест','Choose your seats'):t('Без выбора мест','General admission');
    const description=seats?t('Выберите время и кресла на схеме. Места рядом можно подобрать одной кнопкой.','Choose a time and seats on the plan. Find adjacent seats with one button.'):t('Выберите время и число гостей. Билет закреплен за сеансом, кресло выбирать не нужно.','Choose a time and the number of guests. Your ticket is for a session; no seat selection is needed.');
    return `<article class="session-example" data-session-example="${h(event.id)}"><img src="${h(event.image)}" alt="" loading="lazy"><div class="session-example-body"><p class="session-example-type">${icon(seats?'check':'clock')}<span>${type}</span><span class="session-example-demo">${t('Демо','Demo')}</span></p><h3>${h(title)}</h3><p class="session-example-description">${description}</p><dl class="session-example-facts"><div><dt>${t('Даты','Dates')}</dt><dd>${h(dates.join(' · '))}</dd></div><div><dt>${t('Начало','Starts at')}</dt><dd>${event.times.map(h).join(' · ')}</dd></div><div><dt>${t('За гостя','Per guest')}</dt><dd>${money(event.price)} <span>${t('в демо','in demo')}</span></dd></div></dl><div class="session-example-actions"><a class="${compact?'secondary':'primary'}" href="#/session?event=${encodeURIComponent(event.id)}&mode=form">${t('Выбрать время','Choose a time')}${icon('arrow')}</a>${!compact?`<a class="text-link" href="#/session?event=${encodeURIComponent(event.id)}&mode=quiz">${t('Пошаговый выбор','Step-by-step booking')}</a>`:''}</div><p class="session-example-note">${t('Пример бронирования. Даты, цены и наличие мест условные.','Sample booking. Dates, prices and availability are illustrative.')}</p></div></article>`;
  }).join('')}</div>`;
}
