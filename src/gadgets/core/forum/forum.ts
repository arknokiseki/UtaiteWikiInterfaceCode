interface MediaWiki {
  config: {
    get: (key: string) => any;
  };
  loader: {
    using: (modules: string[], callback: () => void) => void;
  };
}

// Declare mw as a global variable
declare const mw: MediaWiki | undefined;

(function (): void {
  'use strict';
  // console.log("forum helper script v1.0.5");

  /**
   * Retrieves a query parameter from the URL.
   */
  function getUrlParameter(name: string): string {
    const regex = new RegExp('[?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
  }

  /**
   * Updates the pagination page number indicators.
   */
  function updatePageIndicator(): void {
    const paginationDiv = document.querySelector('.forum-pagination');
    const pageInfoDiv = document.querySelector('.forum-page-info');

    if (!paginationDiv || !pageInfoDiv) return;

    // Get start parameter from URL
    const startParam = getUrlParameter('offset');
    const startValue = startParam ? parseInt(startParam, 10) : 0;

    // Calculate current page (pages are 1-indexed, start is 0-indexed with 5 items per page)
    const currentPage = Math.floor(startValue / 5) + 1;

    // Get total pages from data attribute
    const totalPagesAttr = paginationDiv.getAttribute('data-total-pages');
    const totalPages = totalPagesAttr ? parseInt(totalPagesAttr, 10) : 1;

    // Update page info text
    const currentPageSpan = document.getElementById('current-page-number');
    const totalPageSpan = document.getElementById('total-page-number');

    if (currentPageSpan) {
      currentPageSpan.textContent = currentPage.toString();
    }
    if (totalPageSpan) {
      totalPageSpan.textContent = totalPages.toString();
    }
  }

  /**
   * Removes target="_blank" from pagination links.
   */
  function cleanPaginationLinks(): void {
    const paginationDiv = document.querySelector('.forum-pagination');
    if (!paginationDiv) return;

    // Get all links inside pagination
    const links = paginationDiv.querySelectorAll('a');

    // Remove target="_blank" and clean up attributes
    links.forEach((link: HTMLAnchorElement) => {
      // Remove target attribute
      link.removeAttribute('target');

      // Remove rel attributes that are related to target="_blank"
      link.removeAttribute('rel');
    });
  }

  /**
   * Initializes the forum helper if on a Forum namespace.
   */
  function initForumHelper(): void {
    // Check MediaWiki config if available
    if (typeof mw !== 'undefined' && mw.config) {
      const namespace = mw.config.get('wgCanonicalNamespace');

      // If the namespace is not 'Forum', stop execution immediately.
      if (namespace !== 'Forum') {
        return;
      }
    } else {
      // Fallback: Check URL string if mw is not defined
      if (location.href.indexOf('Forum:') === -1) {
        return;
      }
    }

    updatePageIndicator();
    cleanPaginationLinks();
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initForumHelper);
  } else {
    initForumHelper();
  }

  // Also run on MediaWiki's ready event if available
  if (typeof mw !== 'undefined' && mw.loader) {
    mw.loader.using(['mediawiki.util'], function () {
      initForumHelper();
    });
  }
})();