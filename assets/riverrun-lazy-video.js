/**
 * Riverrun lazy video.
 * Looping background videos that sit below the fold start empty: their file and still frame are
 * only fetched when the video comes within 200px of the screen, and they pause again when they
 * scroll well out of view. With reduced motion only the still frame is loaded, never the video.
 *
 * Markup: `<video data-rr-lazy-video data-poster="still.jpg" preload="none" muted loop playsinline>`
 * with `<source data-src="clip.mp4" type="video/mp4">` children. Videos inside an element that
 * has `data-rr-lazy-frame` also set `--rr-lazy-poster` on it (used as the frame's still background).
 */
(() => {
  if (window.__rrLazyVideo) return;
  window.__rrLazyVideo = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** @param {HTMLVideoElement} video */
  function loadStill(video) {
    const poster = video.dataset.poster;
    if (!poster || video.getAttribute('poster')) return;
    video.setAttribute('poster', poster);
    const frame = video.closest('[data-rr-lazy-frame]');
    if (frame instanceof HTMLElement) frame.style.setProperty('--rr-lazy-poster', `url("${poster}")`);
  }

  /** @param {HTMLVideoElement} video */
  function loadClip(video) {
    if (video.dataset.rrLoaded) return;
    video.dataset.rrLoaded = 'true';
    video.querySelectorAll('source[data-src]').forEach((source) => {
      source.setAttribute('src', source.getAttribute('data-src') ?? '');
      source.removeAttribute('data-src');
    });
    video.preload = 'auto';
    video.load();
  }

  /** @param {HTMLVideoElement} video */
  function play(video) {
    const result = video.play();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = entry.target;
        const video = /** @type {HTMLVideoElement | null} */ (
          target instanceof HTMLVideoElement ? target : target.querySelector('video[data-rr-lazy-video]')
        );
        if (!video) continue;
        if (entry.isIntersecting) {
          loadStill(video);
          if (reduceMotion.matches) continue;
          loadClip(video);
          play(video);
        } else if (video.dataset.rrLoaded) {
          video.pause();
        }
      }
    },
    { rootMargin: '200px 0px' }
  );

  function scan() {
    document.querySelectorAll('video[data-rr-lazy-video]').forEach((video) => {
      if (video.dataset.rrObserved) return;
      video.dataset.rrObserved = 'true';
      // Watch the frame when there is one: with reduced motion the video itself is hidden.
      observer.observe(video.closest('[data-rr-lazy-frame]') ?? video);
    });
  }

  scan();
  // Pick up videos from sections added in the theme editor.
  document.addEventListener('shopify:section:load', scan);
})();
