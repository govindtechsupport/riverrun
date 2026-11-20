/**
 * Riverrun product gallery.
 * - Clicking a thumbnail shows that photo in the main frame.
 * - Clicking the main frame (or pressing Enter / Space / arrow keys on it) shows the next photo.
 *
 * Listeners sit on the document in the capture phase, so they run before other scripts and keep
 * working if the section is re-rendered. Photos are switched with inline opacity on `.rr-pd__img` layers.
 */
(() => {
  if (window.__rrGalleryBound) return;
  window.__rrGalleryBound = true;

  /**
   * @param {Element} media - The `.rr-pd__media` gallery wrapper.
   * @param {number} index - Photo to show (wraps around).
   */
  function show(media, index) {
    const layers = [...media.querySelectorAll('.rr-pd__img')];
    if (layers.length < 2) return;
    const next = ((index % layers.length) + layers.length) % layers.length;
    media.setAttribute('data-index', String(next));
    layers.forEach((layer, i) => {
      layer.style.opacity = i === next ? '1' : '0';
    });
    media.querySelectorAll('.rr-pd__thumb').forEach((thumb, i) => {
      thumb.setAttribute('aria-pressed', String(i === next));
    });
  }

  /** @param {Element} media */
  const current = (media) => Number(media.getAttribute('data-index') || 0);

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const thumb = target.closest('.rr-pd__thumb');
      if (thumb) {
        const media = thumb.closest('.rr-pd__media');
        const thumbs = media ? [...media.querySelectorAll('.rr-pd__thumb')] : [];
        if (media) show(media, thumbs.indexOf(thumb));
        return;
      }

      const frame = target.closest('.rr-pd__main');
      const media = frame?.closest('.rr-pd__media');
      if (media) show(media, current(media) + 1);
    },
    true
  );

  document.addEventListener(
    'keydown',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.matches('.rr-pd__main')) return;
      const media = target.closest('.rr-pd__media');
      if (!media) return;
      if (['Enter', ' ', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        show(media, current(media) + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(media, current(media) - 1);
      }
    },
    true
  );
})();
