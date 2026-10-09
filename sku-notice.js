// Quiet, accessible feedback shared by SKU search and the fulfillment cart.
(() => {
  let timer;
  window.showSkuNotice = (message, {warning = false} = {}) => {
    clearTimeout(timer);
    let notice = document.getElementById('sku-notice');
    if (!notice) {
      const style = document.createElement('style');
      style.textContent = '.sku-notice{position:fixed;bottom:calc(120px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);width:max-content;max-width:min(560px,calc(100vw - 40px));box-sizing:border-box;padding:12px 18px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:#1d1d1f;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.12);font-family:inherit;font-size:.9rem;font-weight:500;line-height:1.5;white-space:pre-line;z-index:10000;pointer-events:none}.sku-notice.is-warning{background:#fff8ed;color:#744b11;border-color:#edcf9d}.sku-notice[hidden]{display:none}';
      (document.head || document.body).appendChild(style);
      notice = document.createElement('div');
      notice.id = 'sku-notice';
      notice.className = 'sku-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.setAttribute('aria-atomic', 'true');
      document.body.appendChild(notice);
    }
    notice.classList.toggle('is-warning', warning);
    notice.textContent = message;
    notice.hidden = !message;
    if (message && !warning) timer = setTimeout(() => { notice.hidden = true; }, 5000);
  };
})();
