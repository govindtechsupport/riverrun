/**
 * Riverrun "Show more": fetches the next paginated page, appends its cards to the grid
 * and updates (or removes) the link. Falls back to a normal link without JavaScript.
 */
class RrShowMore extends HTMLElement {
  connectedCallback() {
    this.abort = new AbortController();
    this.addEventListener('click', (e) => this.onClick(e), { signal: this.abort.signal });
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.request?.abort();
  }

  /** @param {MouseEvent} event */
  async onClick(event) {
    const link = event.target instanceof Element ? event.target.closest('[data-rr-more-link]') : null;
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (link.getAttribute('aria-busy') === 'true') return;

    link.setAttribute('aria-busy', 'true');
    this.request?.abort();
    this.request = new AbortController();

    try {
      const response = await fetch(link.href, { signal: this.request.signal });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');

      const grid = this.querySelector('[data-rr-grid]');
      const nextGrid = doc.querySelector('rr-show-more [data-rr-grid]') ?? doc.querySelector('[data-rr-grid]');
      const cards = nextGrid ? [...nextGrid.querySelectorAll('[data-rr-card]')] : [];
      const imported = cards.map((card) => document.importNode(card, true));
      grid.append(...imported);

      const nextLink = (doc.querySelector('rr-show-more [data-rr-more-link]') ?? doc.querySelector('[data-rr-more-link]'));
      if (nextLink) {
        link.href = nextLink.getAttribute('href');
        link.removeAttribute('aria-busy');
      } else {
        this.querySelector('[data-rr-more]')?.remove();
      }
      imported[0]?.focus({ preventScroll: true });
    } catch (error) {
      if (error.name === 'AbortError') return;
      // Let the browser follow the link normally.
      window.location.href = link.href;
    }
  }
}

if (!customElements.get('rr-show-more')) customElements.define('rr-show-more', RrShowMore);
