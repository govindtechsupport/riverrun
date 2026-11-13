/**
 * Riverrun header behaviour.
 * - Home page (has #rr-opening): header appears once the big opening logo has scrolled
 *   up under the top edge. Other pages: always visible.
 * - Header logo fades out while the footer logo ([data-rr-footer-logo]) is in view.
 * - Mobile menu toggle.
 */
class RrHeader extends HTMLElement {
  connectedCallback() {
    this.abort = new AbortController();
    const { signal } = this.abort;

    this.opening = document.querySelector('#rr-opening');
    this.openingLogo = this.opening?.querySelector('[data-rr-opening-logo]') ?? this.opening;
    this.toggle = this.querySelector('[data-rr-toggle]');
    this.mobile = this.querySelector('.rr-header__mobile');

    this.toggle?.addEventListener('click', () => this.setMenu(this.mobile.hidden), { signal });
    this.mobile?.addEventListener('click', (e) => e.target.closest('a') && this.setMenu(false), { signal });
    this.addEventListener('keydown', (e) => e.key === 'Escape' && this.setMenu(false), { signal });

    this.update();
    // Horizon scrolls inside `.page-wrapper` on desktop (the window itself never scrolls),
    // and scroll events do not bubble, so listen on the document in the capture phase.
    document.addEventListener('scroll', () => this.update(), { passive: true, capture: true, signal });
    window.addEventListener('resize', () => this.update(), { passive: true, signal });

    const footerLogo = document.querySelector('[data-rr-footer-logo]');
    if (footerLogo && 'IntersectionObserver' in window) {
      this.footerObserver = new IntersectionObserver(([entry]) => {
        this.toggleAttribute('data-on-footer', entry.isIntersecting);
      });
      this.footerObserver.observe(footerLogo);
    }
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.footerObserver?.disconnect();
  }

  update() {
    const visible = this.openingLogo ? this.openingLogo.getBoundingClientRect().bottom < 0 : true;
    this.toggleAttribute('data-visible', visible);
    if (!visible) this.setMenu(false);
  }

  /** @param {boolean} open */
  setMenu(open) {
    if (!this.mobile || !this.toggle) return;
    this.mobile.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }
}

if (!customElements.get('rr-header')) customElements.define('rr-header', RrHeader);
