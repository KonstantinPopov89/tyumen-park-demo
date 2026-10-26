// Pure unified discovery state. Gestures and teaching never write browser data here.
const copy=value=>JSON.parse(JSON.stringify(value));
const validObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const DISCOVERY_VERSION=3;
export function normalizeView(source,listIds,allowEnd=true){
  const found=listIds.indexOf(source?.rideId),atEnd=!!(allowEnd&&source?.atEnd&&listIds.length);
  const index=atEnd?listIds.length:found>=0?found:0;
  const undo=Array.isArray(source?.undo)?source.undo.filter(x=>x&&listIds.includes(x.id)&&['yes','skip'].includes(x.decision)).slice(-100).map(copy):[];
  return {index,rideId:listIds[index]||null,atEnd,undo};
}
export function resolveDiscovery({stored,legacy,requestedMode,explicitRide,listIds,signature}){
  const unified=stored?.version===DISCOVERY_VERSION&&validObject(stored.views);
  const journal=unified?copy(stored):{version:DISCOVERY_VERSION,views:{},active:signature};
  let source=unified?journal.views[signature]:null,allowEnd=!!source;
  if(!source&&unified)source={rideId:journal.views[journal.active]?.rideId,undo:[]};
  if(!unified){
    const mode=requestedMode==='swipe'?'swipe':'feed',views=validObject(legacy?.views)?legacy.views:{};
    const candidates=[legacy?.active?.[mode],mode+':'+signature,legacy?.active?.feed,'feed:'+signature,legacy?.active?.swipe,'swipe:'+signature];
    const selectedKey=candidates.find(key=>key&&views[key])||'feed:'+signature;
    source=views[selectedKey]||{};allowEnd=selectedKey.endsWith(':'+signature);
    source={...source,undo:[]};journal.migratedFrom=views[selectedKey]?selectedKey:null;
  }
  const view=normalizeView(source,listIds,allowEnd);
  if(explicitRide&&listIds.includes(explicitRide)){view.index=listIds.indexOf(explicitRide);view.rideId=explicitRide;view.atEnd=false;}
  return {journal,view};
}
export function saveDiscovery(journal,signature,view){
  const views={...(validObject(journal?.views)?copy(journal.views):{}),[signature]:copy(view)};
  for(const key of Object.keys(views).slice(0,Math.max(0,Object.keys(views).length-32)))if(key!==signature)delete views[key];
  return {...(validObject(journal)?copy(journal):{}),version:DISCOVERY_VERSION,views,active:signature};
}
export function classifyAxis(dx,dy,locked=null){
  if(locked==='x'||locked==='y')return locked;
  const x=Math.abs(dx),y=Math.abs(dy);
  if(Math.max(x,y)<10||Math.abs(x-y)<6)return null;
  return x>=y*1.35?'x':y>=x*1.35?'y':null;
}
export function gestureDecision({axis,dx,dy,velocity=0,width=1,height=1}){
  if(axis!=='x'&&axis!=='y')return null;
  const travel=axis==='x'?dx:dy,cross=axis==='x'?dy:dx,size=axis==='x'?width:height;
  if(Math.abs(cross)>Math.abs(travel)*.85)return null;
  const commit=Math.abs(travel)>Math.min(96,size*.16)||(Math.abs(travel)>32&&Math.abs(velocity)>.55&&Math.sign(velocity)===Math.sign(travel));
  return !commit?null:axis==='x'?(travel>0?'yes':'skip'):(travel>0?'prev':'next');
}
export function recordDecision(view,action){
  return {...copy(view),undo:[...(view.undo||[]),copy(action)].slice(-100)};
}
export function undoDiscovery(view,listIds,savedIds,intents={}){
  const next=copy(view),action=next.undo.pop();
  if(!action||!listIds.includes(action.id))return {view:next,saved:[...savedIds],action:null,reverted:false};
  const reverted=!!(action.added&&action.token&&intents[action.id]===action.token&&savedIds.includes(action.id));
  next.index=listIds.indexOf(action.id);next.rideId=action.id;next.atEnd=false;
  return {view:next,saved:reverted?savedIds.filter(id=>id!==action.id):[...savedIds],action,reverted};
}
