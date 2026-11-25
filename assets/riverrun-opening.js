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
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const activeVideos = () =>
    mobileQuery.matches
      ? videos.filter((video) => video.closest('[data-rr-opening-side]')?.dataset.rrOpeningSide === 'right')
      : videos;
  const prepareActiveVideos = () => {
    const active = activeVideos();
    active.forEach((video) => {
      video.preload = 'auto';
      if (video.readyState === 0) video.load();
    });
    return active;
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** @param {HTMLVideoElement} video */
  const canPlay = (video) =>
    new Promise((resolve) => {
      if (video.readyState >= 3) return resolve();
      video.addEventListener('canplay', () => resolve(), { once: true });
      video.addEventListener('error', () => resolve(), { once: true });
    });

  const ready = () => root.setAttribute('data-ready', '');

  if (!activeVideos().length || reduceMotion) {
    ready();
    return;
  }

  let inView = true;
  const playAll = () => {
    activeVideos().forEach((video) => (video.currentTime = 0));
    activeVideos().forEach((video) => video.play().catch(() => {}));
  };

  // Start once each video can begin playback; cap the wait on slow connections.
  Promise.race([Promise.all(prepareActiveVideos().map(canPlay)), new Promise((r) => setTimeout(r, 4000))]).then(() => {
    ready();
    if (inView) playAll();
  });

  mobileQuery.addEventListener('change', () => {
    videos.filter((video) => !activeVideos().includes(video)).forEach((video) => video.pause());
    const active = prepareActiveVideos();
    if (root.hasAttribute('data-ready') && inView) {
      Promise.all(active.map(canPlay)).then(() => {
        if (inView && active.every((video) => activeVideos().includes(video))) playAll();
      });
    }
  });

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!root.hasAttribute('data-ready')) return;
    if (inView) activeVideos().forEach((video) => video.play().catch(() => {}));
    else activeVideos().forEach((video) => video.pause());
  }).observe(root);
})();
