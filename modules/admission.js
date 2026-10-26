import {rideRules} from './ride-rules.js?v=r13';

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
  return fields.map(([key,label])=>`<div><dt>${label}</dt><dd>${escaped(text(rules?.[key],language)||unspecified(language))}</dd></div>`).join('');
}

export function admissionSource(ride){return rulesFor(ride)?.source||ride?.source||'';}
