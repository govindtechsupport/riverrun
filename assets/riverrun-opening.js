/**
 * Riverrun opening screen.
 * Both videos buffer first and then start together. Videos pause when scrolled out of
 * view, and are not played at all when the visitor prefers reduced motion.
 */
(() => {
  const root = document.querySelector('[data-rr-opening]');
  if (!root || root.dataset.rrInit) return;
  root.dataset.rrInit = 'true';

  const videos = [...root.querySelectorAll('[data-rr-video]')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** @param {HTMLVideoElement} video */
  const canPlay = (video) =>
    new Promise((resolve) => {
      if (video.readyState >= 3) return resolve();
      video.addEventListener('canplaythrough', () => resolve(), { once: true });
      video.addEventListener('error', () => resolve(), { once: true });
    });

  const ready = () => root.setAttribute('data-ready', '');

  if (!videos.length || reduceMotion) {
    ready();
    return;
  }

  let inView = true;
  const playAll = () => {
    videos.forEach((v) => (v.currentTime = 0));
    videos.forEach((v) => v.play().catch(() => {}));
  };

  // Do not wait forever on slow connections: start after 6s at the latest.
  Promise.race([Promise.all(videos.map(canPlay)), new Promise((r) => setTimeout(r, 6000))]).then(() => {
    ready();
    if (inView) playAll();
  });

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!root.hasAttribute('data-ready')) return;
    if (inView) videos.forEach((v) => v.play().catch(() => {}));
    else videos.forEach((v) => v.pause());
  }).observe(root);
})();
