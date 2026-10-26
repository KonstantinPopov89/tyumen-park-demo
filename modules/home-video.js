import {t} from './shared.js';

// The clip is an illustration, not footage of the Tyumen park.
export function bindHomeVideo(root) {
  const video=root.querySelector('[data-home-video]');
  const button=root.querySelector('[data-home-video-toggle]');
  if(!video||!button)return ()=>{};
  const poster=root.querySelector('[data-home-video-poster]');
  const label=button.querySelector('[data-video-label]');
  const status=root.querySelector('[data-video-status]');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const connection=navigator.connection;
  let disposed=false, loaded=false, inView=false, failed=false, manuallyPaused=false, attempt=0, timeout;
  const on=(target,name,fn)=>{target.addEventListener(name,fn);listeners.push(()=>target.removeEventListener(name,fn));};
  const listeners=[];
  const clearWatchdog=()=>{clearTimeout(timeout);timeout=null;};
  function update(){
    const playing=!video.paused&&!failed;
    const text=failed?t('Повторить видео','Retry video'):playing?t('Пауза','Pause'):t('Смотреть видео','Play video');
    label.textContent=text;button.setAttribute('aria-label',text);button.dataset.playing=String(playing);
    button.setAttribute('aria-pressed',String(playing));
  }
  function pause(){++attempt;clearWatchdog();video.pause();update();}
  function fail(){
    if(disposed)return;
    failed=true;pause();poster.hidden=false;video.style.visibility='hidden';
    status.textContent=t('Видео не загрузилось. Попробуйте еще раз.','Video could not load. Please try again.');status.hidden=false;update();
  }
  const allowed=()=>!motion.matches&&!connection?.saveData&&!manuallyPaused&&!failed;
  async function play(userInitiated=false){
    if(disposed||document.hidden||!inView||failed&&!userInitiated)return;
    if(!video.paused&&!failed)return;
    const retry=failed||Boolean(video.error),token=++attempt;
    failed=false;status.hidden=true;
    video.muted=true;
    if(!loaded){video.src=video.dataset.src;loaded=true;}
    else if(retry)video.load();
    clearWatchdog();timeout=setTimeout(()=>{if(token===attempt)fail();},8000);
    try{await video.play();}
    catch(error){
      if(disposed||token!==attempt)return;
      clearWatchdog();
      if(error.name!=='AbortError'&&error.name!=='NotAllowedError')fail();
    }
    if(!disposed&&token===attempt)update();
  }
  function visibility(){
    if(disposed)return;
    if(document.hidden||!inView)pause();
    else if(allowed())play();
  }
  on(button,'click',()=>{
    if(!video.paused&&!failed){manuallyPaused=true;pause();}
    else{manuallyPaused=false;inView=true;play(true);}
  });
  on(video,'playing',()=>{
    if(disposed||document.hidden||!inView){pause();return;}
    clearWatchdog();failed=false;poster.hidden=true;status.hidden=true;video.style.visibility='';update();
  });
  on(video,'pause',update);
  on(video,'error',fail);
  on(document,'visibilitychange',visibility);
  on(motion,'change',()=>{if(motion.matches)pause();else visibility();});
  if(connection?.addEventListener)on(connection,'change',()=>{if(connection.saveData)pause();else visibility();});
  const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>{
    inView=entries[0].isIntersecting&&entries[0].intersectionRatio>=.1;visibility();
  },{threshold:[0,.1]}):null;
  if(observer)observer.observe(video);else{inView=true;visibility();}
  update();
  return ()=>{disposed=true;++attempt;clearWatchdog();observer?.disconnect();listeners.forEach(off=>off());video.pause();};
}
