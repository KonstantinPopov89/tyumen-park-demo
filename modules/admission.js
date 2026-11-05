import {rideRules} from './ride-rules.js?v=r24';

// Published park rules only. Synthetic discovery bands never establish admission.
const languageNow=()=>new URLSearchParams(globalThis.location?.search||'').get('lang')==='en'?'en':'ru';
const text=(value,language)=>typeof value==='string'?value:value?.[language]||'';
const escaped=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rulesFor=ride=>ride?.actualRules??rideRules[ride?.id]??null;
const unspecified=language=>language==='en'?'Not stated on the park website. Check before your visit.':'Не указано на сайте парка. Уточните перед визитом.';

export function admissionSummary(ride,language=languageNow()){
  const rules=rulesFor(ride);
  const summary=text(rules?.summary,language)||text(rules,language);
  if(summary)return summary;
  const known=['age','height','accompaniment','other'].map(key=>text(rules?.[key],language)).filter(Boolean);
  return known.length?known.join(' · '):language==='en'?'Age, height and accompanying adults: check with the park.':'Возраст, рост и сопровождение: уточните у парка.';
}

export function admissionFacts(ride,language=languageNow()){
  const rules=rulesFor(ride);
  if(typeof rules==='string'||rules?.ru||rules?.en)return `<div><dt>${language==='en'?'Age, height and accompanying adults':'Возраст, рост и сопровождение'}</dt><dd>${escaped(admissionSummary(ride,language))}</dd></div>`;
  const fields=language==='en'?[['age','Age'],['height','Height'],['accompaniment','Accompanying adults']]:[['age','Возраст'],['height','Рост'],['accompaniment','Сопровождение']];
  if(text(rules?.other,language))fields.push(['other',language==='en'?'Additional conditions':'Дополнительные условия']);
  return fields.map(([key,label])=>`<div><dt>${label}</dt><dd>${escaped(text(rules?.[key],language)||unspecified(language))}</dd></div>`).join('')+(rules?.sources?.includes('https://parktmn.ru/czenyi/')?`<div><dt>${language==='en'?'Additional source':'Дополнительный источник'}</dt><dd><a href="https://parktmn.ru/czenyi/" target="_blank" rel="noopener">${language==='en'?'Conditions in the park price list':'Условия в прайсе парка'}</a></dd></div>`:'');
}

export function admissionSource(ride){return rulesFor(ride)?.source||ride?.source||'';}

// Resolve a family-purchase uncertainty without inventing admission or price.
export function admissionHelp(ride,language=languageNow()){
  const name=text(ride?.name,language)||'';
  const ru=language!=='en';
  const prompt=ru?`Аттракцион "${name}": можно ли ребенку с его возрастом и ростом кататься одному? Если нужен взрослый, требуется ли ему отдельный билет и сколько он стоит?`:`For ${name}: can a child of this age and height ride alone? If an adult must accompany them, do they need a separate ticket and what does it cost?`;
  return `<details class="admission-help"><summary>${ru?'С ребенком: что уточнить до покупки':'With a child: what to check before buying'}</summary><p>${ru?'Оплата сопровождающего в доступных правилах не подтверждена. Сумма демозаказа не отвечает на этот вопрос.':'Payment for an accompanying adult is not confirmed by the available rules. The demo total does not resolve this question.'}</p><p>${escaped(prompt)}</p><a class="text-link" href="${escaped(admissionSource(ride)||'https://parktmn.ru/')}" target="_blank" rel="noopener">${ru?'Уточнить у парка на официальном сайте':'Check with the park on its official website'}</a></details>`;
}
