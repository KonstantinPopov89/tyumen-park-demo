// Status examples are deliberately separate from the park catalog.
// No record in this module confirms current ride operation.
export const DEMO_NOW = Date.UTC(2026, 9, 26, 7, 0);
export const STATUSES = ['all', 'open', 'unknown', 'paused', 'closed'];
export const SCENARIOS = ['normal', 'stale', 'error', 'offline'];

export function readOptions(params = new URLSearchParams()) {
  return {
    demo: params.get('demo') === '1',
    scenario: SCENARIOS.includes(params.get('scenario')) ? params.get('scenario') : 'normal',
    status: STATUSES.includes(params.get('status')) ? params.get('status') : 'all',
    q: (params.get('q') || '').slice(0, 160),
    ride: (params.get('ride') || '').slice(0, 100)
  };
}

export function routeFor(options) {
  const p = new URLSearchParams();
  if (options.demo) p.set('demo', '1');
  if (options.demo && options.scenario !== 'normal') p.set('scenario', options.scenario);
  if (options.status !== 'all') p.set('status', options.status);
  if (options.q) p.set('q', options.q);
  if (options.ride) p.set('ride', options.ride);
  return '/availability' + (p.size ? '?' + p.toString() : '');
}

export function deriveRows(catalog, options) {
  return catalog.map((ride, index) => {
    const base = { ride, status: 'unknown', reason: 'unconnected', source: 'none', checkedAt: null, expiresAt: null, stale: false };
    if (!options.demo) return base;
    if (options.scenario === 'error') return { ...base, reason: 'error' };
    const sample = index % 6;
    if (sample === 3) return { ...base, reason: 'unconfirmed' };
    const expired = options.scenario === 'stale' || sample === 4;
    const status = sample === 1 ? 'paused' : sample === 2 ? 'closed' : 'open';
    return {
      ...base,
      status: expired ? 'unknown' : status,
      reason: expired ? 'stale' : status,
      source: 'sample',
      checkedAt: DEMO_NOW - (expired ? 90 : 10) * 60_000,
      expiresAt: DEMO_NOW + (expired ? -30 : 30) * 60_000,
      stale: expired
    };
  });
}

export const normalize = value => String(value || '').trim().toLocaleLowerCase().replaceAll('ё', 'е');

export function selectRows(rows, options) {
  const q = normalize(options.q);
  const matching = rows.filter(({ ride }) => normalize(Object.values(ride.name || {}).join(' ')).includes(q));
  const counts = Object.fromEntries(STATUSES.map(key => [key, key === 'all' ? matching.length : matching.filter(row => row.status === key).length]));
  return { counts, visible: matching.filter(row => options.status === 'all' || row.status === options.status) };
}
