// A self-contained copy of one demo ticket. This is not a signed admission pass.
const MAX_BYTES=6144,MAX_TOKEN=8192;
const QR=/^DEMO:(?:TMN|SESSION):[A-Za-z0-9._:-]{1,144}$/;
const unsafeText=/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function text(value,max,{empty=true}={}){
  if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||unsafeText.test(value))throw new TypeError('Invalid ticket text');
  return value;
}
function snapshot(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Invalid ticket snapshot');
  const name=text(value.name,180,{empty:false}),recipient=text(value.recipient,240),detail=text(value.detail,1200),qrPayload=text(value.qrPayload,160,{empty:false}),productId=text(value.productId,80);
  if(!QR.test(qrPayload)||!/^[A-Za-z0-9_-]*$/.test(productId))throw new TypeError('Invalid demo ticket code');
  const uses=value.uses;
  if(uses!==null&&(!Number.isInteger(uses)||uses<1||uses>1000))throw new TypeError('Invalid ride allowance');
  if(!Array.isArray(value.includedRides)||value.includedRides.length>30)throw new TypeError('Invalid included rides');
  const includedRides=value.includedRides.map(ride=>text(ride,140,{empty:false}));
  return {name,recipient,detail,qrPayload,productId,uses,includedRides};
}
function base64url(bytes){
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function encodeTicketShare(value){
  const s=snapshot(value),bytes=new TextEncoder().encode(JSON.stringify([1,s.name,s.recipient,s.detail,s.qrPayload,s.productId,s.uses,s.includedRides]));
  if(bytes.length>MAX_BYTES)throw new RangeError('Demo ticket is too large to share');
  return base64url(bytes);
}
export function decodeTicketShare(token){
  try{
    if(typeof token!=='string'||!token.length||token.length>MAX_TOKEN||token.length%4===1||!/^[A-Za-z0-9_-]+$/.test(token))return null;
    const raw=atob(token.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-token.length%4)%4));
    if(raw.length>MAX_BYTES)return null;
    const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));
    if(base64url(bytes)!==token)return null;
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!Array.isArray(data)||data.length!==8||data[0]!==1)return null;
    return snapshot({name:data[1],recipient:data[2],detail:data[3],qrPayload:data[4],productId:data[5],uses:data[6],includedRides:data[7]});
  }catch{return null;}
}
function httpURL(value){
  const url=new URL(value);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new TypeError('Invalid ticket URL');
  return url;
}
export function ticketShareURL(value,baseHref){
  const url=httpURL(baseHref),language=url.searchParams.get('lang');
  url.search='';if(language==='ru'||language==='en')url.searchParams.set('lang',language);
  url.hash='/shared-ticket?'+new URLSearchParams({data:encodeTicketShare(value)});
  return url.href;
}
export function messengerShareURL(service,url,message=''){
  const ticket=httpURL(url).href,caption=text(message,1000),combined=caption?`${caption}\n${ticket}`:ticket;
  let endpoint,params;
  if(service==='vk'){endpoint='https://vk.com/share.php';params={url:ticket,title:caption,noparse:'true'};}
  else if(service==='max'){endpoint='https://max.ru/:share';params={text:combined};}
  else if(service==='whatsapp'){endpoint='https://wa.me/';params={text:combined};}
  else if(service==='telegram'){endpoint='https://t.me/share/url';params={url:ticket,text:caption};}
  else throw new TypeError('Unknown messenger');
  return endpoint+'?'+new URLSearchParams(params);
}
