'use strict';
// No automatic page reload: an update must not discard an unfinished form.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
      .catch(error => console.warn('Офлайн-кеш пока недоступен:', error));
  });
}
