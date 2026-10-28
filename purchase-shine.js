/* One shared clock keeps SPA rerenders from restarting decorative feedback. */
(() => {
  const selector = 'a.primary[href^="#/quick"],a.primary[href^="#/checkout"],a.primary[href^="#/session?"],button.primary[data-qp-pay],button.primary[data-co-pay],button.primary[data-session-pay]';
  const blocked = '[disabled],[aria-disabled="true"],[aria-busy="true"],[data-state="loading"],[data-state="processing"],.is-loading,.is-processing';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let next = 0;
  let finish = 0;
  let active = [];
  function clearPulse() {
    clearTimeout(finish);
    active.forEach(button => button.classList.remove('is-purchase-shining'));
    active = [];
  }
  function stop() {
    clearTimeout(next);
    clearPulse();
  }
  function available(button) {
    if (button.matches(':disabled') || button.closest(blocked)) return false;
    const box = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth && style.visibility === 'visible' && style.opacity !== '0';
  }
  function pulse() {
    clearPulse();
    if (document.hidden || reduced.matches) return;
    active = [...document.querySelectorAll(selector)].filter(available);
    active.forEach(button => button.classList.add('is-purchase-shining'));
    finish = setTimeout(clearPulse, 850);
    next = setTimeout(pulse, 6000);
  }
  function resume() {
    stop();
    if (!document.hidden && !reduced.matches) next = setTimeout(pulse, 1000);
  }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', resume);
  reduced.addEventListener('change', resume);
  resume();
})();
