import { rides } from './data.js';
import { h, icon, lang, loc, t, read, write, notify, uid } from './shared.js';
import { admissionSummary } from './admission.js?v=r13';
import { DEMO_NOW, STATUSES, deriveRows, readOptions, routeFor, selectRows } from './availability-model.js';

const statusText = key => ({
  all: t('Все', 'All'), open: t('Работают', 'Operating'), unknown: t('Уточняем', 'Unknown'),
  paused: t('Пауза', 'Paused'), closed: t('Закрыты', 'Closed')
})[key];
const rowStatus = key => ({ open: t('Работает', 'Operating'), unknown: t('Уточняем', 'Unknown'), paused: t('Пауза', 'Paused'), closed: t('Закрыт', 'Closed') })[key];
const reasonText = key => ({
  unconnected: t('Рабочие статусы не подключены. Уточните у парка, принимает ли аттракцион гостей.', 'Live statuses are not connected. Ask the park whether this ride is admitting guests.'),
  unconfirmed: t('В этом примере нет подтвержденной отметки. Неизвестный статус не означает, что аттракцион закрыт.', 'This example has no confirmed entry. An unknown status does not mean the ride is closed.'),
  open: t('Учебный пример: дежурный отметил, что аттракцион принимает гостей.', 'Sample: a staff entry says the ride is admitting guests.'),
  paused: t('Учебный пример: временный перерыв. Время возобновления нужно уточнить.', 'Sample: a temporary break. The reopening time needs confirmation.'),
  closed: t('Учебный пример: аттракцион закрыт на обслуживание.', 'Sample: the ride is closed for maintenance.'),
  stale: t('Срок учебной отметки истек. Прежний статус больше не подтверждает работу аттракциона.', 'The sample entry has expired. Its previous status no longer confirms operation.'),
  error: t('Учебный источник недоступен. Статус неизвестен, это не подтверждение закрытия.', 'The sample source is unavailable. Status is unknown; this does not confirm closure.')
})[key];

function stamp(value) {
  return new Intl.DateTimeFormat(lang() === 'ru' ? 'ru-RU' : 'en-GB', { timeZone: 'Asia/Yekaterinburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(value);
}

function detailHTML(row, options) {
  const { ride } = row;
  const returnTo = routeFor({ ...options, ride: ride.id });
  const purchase = row.status === 'open' && options.demo;
  return `<p class="av-reason">${reasonText(row.reason)}</p><div class="av-detail-actions">${purchase ? `<a class="secondary" href="#/quick?product=single&choose=1&ride=${encodeURIComponent(ride.id)}&return=${encodeURIComponent(returnTo)}">${t('Выбрать демобилеты', 'Choose demo tickets')}${icon('arrow')}</a>` : `<a class="secondary" href="tel:+73452406083">${t('Уточнить у парка', 'Ask the park')}${icon('arrow')}</a>`}<a class="text-link" href="#/ride?id=${encodeURIComponent(ride.id)}&return=${encodeURIComponent(returnTo)}">${t('Аттракцион и ограничения', 'Ride and restrictions')}${icon('arrow')}</a>${['paused', 'closed'].includes(row.status) ? `<button type="button" class="text-link" data-av-filter="open">${t('Работающие в примере', 'Operating in the example')}${icon('arrow')}</button>` : ''}</div>${purchase ? `<p class="fine av-admission">${t('Без списания денег. Учебный статус не подтверждает реальный допуск.', 'No money is charged. A sample status does not confirm actual admission.')}</p>` : ''}<details class="av-source"><summary>${t('Источник и время статуса', 'Status source and time')}${icon('chevron')}</summary><dl class="av-facts"><div><dt>${t('Источник', 'Source')}</dt><dd>${row.source === 'sample' ? t('Учебная отметка дежурного', 'Sample staff entry') : t('Нет подключенного источника', 'No connected source')}</dd></div><div><dt>${t('Проверено', 'Checked')}</dt><dd>${row.checkedAt ? `${h(stamp(row.checkedAt))} · ${t('Тюмень, учебное время', 'Tyumen, sample time')}` : t('Время неизвестно', 'Time unknown')}</dd></div>${row.expiresAt ? `<div><dt>${row.stale ? t('Отметка истекла', 'Entry expired') : t('Пример действует до', 'Example valid until')}</dt><dd>${h(stamp(row.expiresAt))}</dd></div>` : ''}</dl></details>`;
}

const savedIds = () => { const value = read('saved', []); return Array.isArray(value) ? value : []; };
const saveLabel = (ride, selected) => (selected ? t('Убрать из списка: ', 'Remove from list: ') : t('В список: ', 'Save: ')) + loc(ride.name);

function rowHTML(row, options, index) {
  const { ride } = row;
  const opened = options.ride === ride.id;
  const selected = savedIds().includes(ride.id);
  return `<li class="av-row" data-av-row="${h(ride.id)}" data-status="${row.status}"><div class="av-row-head"><button class="av-summary" type="button" data-av-toggle="${h(ride.id)}" aria-expanded="${opened}" aria-controls="av-detail-${h(ride.id)}"><span class="av-photo"><img src="${h(ride.image)}" alt="" width="60" height="60" loading="${index < 4 ? 'eager' : 'lazy'}"></span><span class="av-ride-copy"><span class="av-ride-name">${h(loc(ride.name))}</span><span class="av-ride-rules">${h(admissionSummary(ride))}</span></span><span class="av-status av-status-${row.status}"><span aria-hidden="true"></span>${rowStatus(row.status)}${row.stale ? `<small>${t('данные устарели', 'out of date')}</small>` : ''}</span>${icon('chevron')}</button><button class="av-save" type="button" data-av-save="${h(ride.id)}" aria-pressed="${selected}" aria-label="${h(saveLabel(ride, selected))}" title="${h(saveLabel(ride, selected))}">${icon('heart')}</button></div><div class="av-detail" id="av-detail-${h(ride.id)}" ${opened ? '' : 'hidden'}>${detailHTML(row, options)}</div></li>`;
}

function noticeHTML(options, offline) {
  if (options.demo && options.scenario === 'error') return `<div class="av-notice av-notice-error" role="status"><strong>${t('Пример: сведения недоступны', 'Example: records unavailable')}</strong><p>${t('Показываем неизвестные статусы. Сведения об аттракционах доступны.', 'Statuses are unknown. Ride details remain available.')}</p><button class="text-link" data-av-retry>${t('Повторить в демо', 'Retry the demo')}${icon('arrow')}</button></div>`;
  if (offline) return `<div class="av-notice" role="status"><strong>${options.demo && options.scenario === 'offline' ? t('Пример: нет связи', 'Example: offline') : t('Нет связи', 'You are offline')}</strong><p>${options.demo ? t('Доступны сохраненные учебные примеры. Реальную работу уточните у парка.', 'Saved sample records are available. Confirm actual operation with the park.') : t('Каталог доступен. Текущую работу аттракционов подтвердить не можем.', 'The catalog is available. Current ride operation cannot be confirmed.')}</p></div>`;
  if (options.demo && options.scenario === 'stale') return `<div class="av-notice" role="status"><strong>${t('Пример: сведения устарели', 'Example: records are out of date')}</strong><p>${t('Истекшие отметки заменены на "Уточняем". Их прежний статус не используется.', 'Expired entries are shown as unknown. Their previous status is no longer used.')}</p></div>`;
  return '';
}

export function render(route, params = new URLSearchParams()) {
  const options = { ...readOptions(params), q: '' };
  const rows = deriveRows(rides, options);
  const selected = selectRows(rows, options);
  if (options.ride && rides.some(ride => ride.id === options.ride) && !selected.visible.some(row => row.ride.id === options.ride)) {
    options.q = ''; options.status = 'all';
  }
  return `<section class="page availability-page" data-av-page>
    <header class="av-heading"><a class="back-link" href="#/home" aria-label="${t('Главная', 'Home')}">${icon('back')}</a><h1>${t('Что работает', 'What is operating')}</h1></header>
    <div class="av-toolbar"><div class="av-filters" role="group" aria-label="${t('Фильтр по статусу', 'Filter by status')}">${STATUSES.map(status => `<button type="button" class="av-filter" data-av-filter="${status}" aria-pressed="${options.status === status}"><span>${statusText(status)}</span><span class="av-filter-count" data-av-count="${status}"></span></button>`).join('')}</div><p class="av-toolbar-note" data-av-sticky-state></p></div>
    <p class="av-result-live" data-av-result role="status" aria-live="polite" aria-atomic="true"></p><ul class="av-rides" data-av-rides>${rows.map((row, index) => rowHTML(row, options, index)).join('')}</ul><div class="av-empty" data-av-empty hidden><h2>${t('Таких аттракционов не нашлось', 'No matching rides')}</h2><p data-av-empty-note></p><button type="button" class="secondary" data-av-reset>${t('Показать все', 'Show all rides')}${icon('arrow')}</button></div>
    <a class="av-sessions" href="#/events"><span><strong>${t('Хотите прийти к определенному времени?', 'Prefer a timed visit?')}</strong><span>${t('Посмотрите примеры бронирования сеансов.', 'Explore the sample session bookings.')}</span></span><span>${t('Выбрать сеанс', 'Choose a session')}${icon('arrow')}</span></a>
    <aside class="av-mode" aria-label="${t('Актуальность статусов', 'Status freshness')}"><div><strong data-av-mode-title></strong><p data-av-mode-note></p></div><div class="av-mode-actions"><a class="text-link av-contact" href="tel:+73452406083">${t('Уточнить у парка', 'Ask the park')}${icon('arrow')}</a><button type="button" class="text-link av-demo-toggle" data-av-demo aria-pressed="${options.demo}"></button></div></aside>
    <details class="av-demo-controls" data-av-demo-controls ${options.demo ? '' : 'hidden'}><summary>${t('Настройки примера', 'Example settings')}${icon('chevron')}</summary><div><label for="av-scenario">${t('Состояние данных', 'Data condition')}</label><select id="av-scenario" data-av-scenario><option value="normal">${t('Разные статусы', 'Different statuses')}</option><option value="stale">${t('Данные устарели', 'Outdated records')}</option><option value="error">${t('Источник недоступен', 'Source unavailable')}</option><option value="offline">${t('Нет связи', 'Offline')}</option></select><p class="fine">${t('Учебное время:', 'Sample time:')} ${h(stamp(DEMO_NOW))} · ${t('Тюмень', 'Tyumen')}</p></div></details>
    <div data-av-notice></div>
    <details class="av-explanation"><summary>${t('Как читать статусы', 'How to read these statuses')}${icon('chevron')}</summary><p>${t('Статус "Уточняем" означает, что подтверждения нет. Это не сообщение о закрытии. Работающий аттракцион может иметь ограничения по возрасту, росту и сопровождению.', 'Unknown means there is no confirmation. It does not mean the ride is closed. An operating ride may still have age, height or accompanying-adult requirements.')}</p><p>${t('Данные о текущей работе парка не подключены. Режим примера использует только учебные отметки; источник и время доступны в подробностях аттракциона.', 'Live park data is not connected. Example mode uses sample entries only; each ride provides the source and time in its details.')}</p></details></section>`;
}

export function bind(root, route, params = new URLSearchParams()) {
  const page = root.querySelector('[data-av-page]');
  if (!page) return () => {};
  let options = { ...readOptions(params), q: '' };
  let revealFrame;
  const rowNodes = new Map([...page.querySelectorAll('[data-av-row]')].map(el => [el.dataset.avRow, el]));
  if (options.ride && rowNodes.has(options.ride)) {
    const selected = selectRows(deriveRows(rides, options), options);
    if (!selected.visible.some(row => row.ride.id === options.ride)) { options.q = ''; options.status = 'all'; }
  } else options.ride = '';

  function saveURL(push = false) {
    const next = '#' + routeFor(options);
    if (location.hash === next) return;
    history[push ? 'pushState' : 'replaceState'](history.state, '', location.pathname + location.search + next);
  }

  function paintSaved() {
    const selected = new Set(savedIds());
    for (const ride of rides) {
      const button = rowNodes.get(ride.id)?.querySelector('[data-av-save]');
      if (!button) continue;
      const label = saveLabel(ride, selected.has(ride.id));
      button.setAttribute('aria-pressed', String(selected.has(ride.id)));
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    }
  }
  function onSavedChange(event) { if (event.detail?.key === 'saved') paintSaved(); }

  function paint() {
    const focusBefore = document.activeElement;
    const focusRow = focusBefore?.closest?.('[data-av-row]')?.dataset.avRow;
    const focusHref = focusBefore?.getAttribute?.('href');
    const rows = deriveRows(rides, options);
    const { visible, counts } = selectRows(rows, options);
    const visibleIds = new Set(visible.map(row => row.ride.id));
    page.querySelector('[data-av-mode-title]').textContent = options.demo ? t('Пример статусов', 'Sample statuses') : t('Работу аттракционов нужно уточнить', 'Check ride operation before your visit');
    page.querySelector('[data-av-mode-note]').textContent = options.demo ? t('Учебные данные, не текущая работа парка.', 'Sample data, not current park operations.') : t('Текущие данные парка не подключены. Ограничения указаны у каждого аттракциона.', 'Live park data is not connected. Each ride lists its admission rules.');
    const demoButton = page.querySelector('[data-av-demo]');
    demoButton.textContent = options.demo ? t('Выйти из примера', 'Exit the example') : t('Пример статусов', 'Sample statuses');
    demoButton.setAttribute('aria-pressed', String(options.demo));
    const demoControls = page.querySelector('[data-av-demo-controls]');
    demoControls.hidden = !options.demo;
    if (!options.demo) demoControls.open = false;
    page.querySelector('[data-av-scenario]').value = options.scenario;
    page.querySelector('[data-av-notice]').innerHTML = noticeHTML(options, !navigator.onLine || options.demo && options.scenario === 'offline');
    const sampleLabel = page.querySelector('[data-av-sticky-state]');
    sampleLabel.hidden = !options.demo;
    sampleLabel.textContent = t('Учебный пример, не текущая работа парка', 'Sample only, not current park operations');
    page.querySelector('[data-av-result]').textContent = options.q || options.status !== 'all' ? t('Найдено: ', 'Found: ') + visible.length + t(' из ', ' of ') + rides.length : t('Аттракционы: ', 'Attractions: ') + rides.length;
    page.querySelectorAll('.av-filter[data-av-filter]').forEach(button => {
      const status = button.dataset.avFilter;
      button.setAttribute('aria-pressed', String(options.status === status));
      button.querySelector('[data-av-count]').textContent = counts[status];
    });
    rows.forEach(row => {
      const node = rowNodes.get(row.ride.id);
      node.hidden = !visibleIds.has(row.ride.id);
      node.dataset.status = row.status;
      const badge = node.querySelector('.av-status');
      badge.className = 'av-status av-status-' + row.status;
      badge.innerHTML = `<span aria-hidden="true"></span>${rowStatus(row.status)}${row.stale ? `<small>${t('данные устарели', 'out of date')}</small>` : ''}`;
      const button = node.querySelector('[data-av-toggle]');
      const opened = options.ride === row.ride.id && !node.hidden;
      button.setAttribute('aria-expanded', String(opened));
      const detail = node.querySelector('.av-detail');
      detail.hidden = !opened;
      if (opened) {
        const html = detailHTML(row, options);
        if (detail.innerHTML !== html) detail.innerHTML = html;
      }
    });
    paintSaved();
    page.querySelector('[data-av-empty]').hidden = visible.length > 0;
    page.querySelector('[data-av-empty-note]').textContent = options.status === 'open' && !options.demo ? t('Подтвержденных рабочих статусов пока нет. Это не означает, что все аттракционы закрыты.', 'No operating statuses are confirmed. This does not mean every ride is closed.') : t('В этой группе пока нет аттракционов. Можно вернуться ко всему списку.', 'There are no rides in this group. You can return to the complete list.');
    if (focusRow && focusHref && !focusBefore.isConnected) {
      [...(rowNodes.get(focusRow)?.querySelectorAll('a') || [])].find(link => link.getAttribute('href') === focusHref)?.focus({ preventScroll: true });
    }
  }

  function reset() { options.q = ''; options.status = 'all'; options.ride = ''; saveURL(); paint(); page.querySelector('.av-filter[data-av-filter=all]').focus({ preventScroll: true }); }
  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !page.contains(button)) return;
    if (button.hasAttribute('data-av-save')) {
      const id = button.dataset.avSave;
      if (!rides.some(ride => ride.id === id)) return;
      const previous = savedIds(), selected = !previous.includes(id);
      const stored = read('discovery-saved-intent-v1', {});
      const intents = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
      write('discovery-saved-intent-v1', { ...intents, [id]: uid('saved-intent') });
      write('saved', selected ? [...previous, id] : previous.filter(value => value !== id));
      notify(selected ? t('Добавлено в ваш список', 'Added to your list') : t('Удалено из списка', 'Removed from your list'));
    } else if (button.hasAttribute('data-av-toggle')) {
      options.ride = options.ride === button.dataset.avToggle ? '' : button.dataset.avToggle;
      saveURL(true); paint();
    } else if (button.hasAttribute('data-av-filter')) {
      const fromDetail = Boolean(button.closest('.av-detail'));
      if (fromDetail) { options.q = ''; }
      options.status = button.dataset.avFilter; options.ride = ''; saveURL(true); paint();
      if (fromDetail) page.querySelector('.av-filter[data-av-filter="' + options.status + '"]')?.focus({ preventScroll: true });
    } else if (button.hasAttribute('data-av-reset')) reset();
    else if (button.hasAttribute('data-av-demo')) {
      options.demo = !options.demo; options.scenario = 'normal'; options.status = 'all'; options.ride = ''; saveURL(true); paint();
      page.querySelector('.av-toolbar').scrollIntoView({ block: 'start', behavior: 'instant' });
      page.querySelector('.av-filter[data-av-filter=all]').focus({ preventScroll: true });
    } else if (button.hasAttribute('data-av-retry')) {
      options.scenario = 'normal'; saveURL(true); paint(); page.querySelector('[data-av-demo-controls] summary').focus({ preventScroll: true });
    }
  }
  function onChange(event) {
    if (!event.target.matches('[data-av-scenario]')) return;
    options.scenario = event.target.value; options.status = 'all'; options.ride = ''; saveURL(true); paint();
  }
  function onImageError(event) { if (event.target.matches('.av-photo img')) event.target.hidden = true; }
  page.addEventListener('click', onClick);
  page.addEventListener('change', onChange);
  page.addEventListener('error', onImageError, true);
  window.addEventListener('online', paint); window.addEventListener('offline', paint);
  window.addEventListener('tmn:change', onSavedChange);
  paint(); saveURL();
  if (options.ride) revealFrame = requestAnimationFrame(() => {
    const button = rowNodes.get(options.ride)?.querySelector('[data-av-toggle]');
    button?.scrollIntoView({ block: 'center', behavior: 'instant' });
    button?.focus({ preventScroll: true });
  });
  return () => {
    cancelAnimationFrame(revealFrame);
    page.removeEventListener('click', onClick);
    page.removeEventListener('change', onChange);
    page.removeEventListener('error', onImageError, true);
    window.removeEventListener('online', paint); window.removeEventListener('offline', paint);
    window.removeEventListener('tmn:change', onSavedChange);
  };
}
