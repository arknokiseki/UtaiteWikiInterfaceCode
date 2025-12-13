/**
 * Hide site notice when editing pages
 * Hides the site notice on action=edit and action=submit
 */
(function (): void {
  if (typeof mw === 'undefined') return;

  const action: string = mw.config.get('wgAction');

  if (action === 'edit' || action === 'submit') {
    const container = document.querySelector<HTMLElement>('.citizen-sitenotice-container');
    
    if (container) {
      container.style.display = 'none';
    }
  }
})();