interface MwConfig {
    get: (key: string) => unknown;
}

declare const mw: {
    config: MwConfig;
};

(function (): void {
    'use strict';

    if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
        return;
    }

    /**
     * Checks if the current page is one of the designated Main Pages.
     */
    function isMainPage(): boolean {
        // Fix: Cast result to string or fallback to empty string
        const pageName = (mw.config && mw.config.get ? mw.config.get('wgPageName') : '') as string;
        const mp = ['Utaite_Wiki', 'Utaite Wiki', 'Utaite%20Wiki', 'Main_Page'];
        
        if (mp.indexOf(pageName) !== -1) return true;

        const currentUrl = window.location.href;
        const exact = ['/wiki/Utaite_Wiki', '/wiki/Utaite%20Wiki', '/wiki/Main_Page'];
        
        return exact.some(function (p) {
            return currentUrl.indexOf(p) !== -1 &&
                currentUrl.indexOf(p + '/') === -1 &&
                currentUrl.indexOf(p + ':') === -1;
        });
    }

    if (!isMainPage()) return;

    const SELECTORS = {
        root: '#citizen-page-more-dropdown',
        details: 'details.citizen-dropdown-details',
        card: '.citizen-menu__card',
        main: 'main#content, main.mw-body, main'
    };

    const TOP_Z = 2147483647;
    // Map to store original inline styles before we modify them
    const backupMap = new WeakMap<HTMLElement, Record<string, string>>();

    /**
     * Backs up existing inline styles and applies new ones.
     */
    function backupAndSet(el: HTMLElement | null, styles: Record<string, string>): void {
        if (!el) return;
        
        const prev = backupMap.get(el) || {};
        
        for (const k in styles) {
            if (Object.prototype.hasOwnProperty.call(styles, k)) {
                // Only backup if we haven't touched this property yet in this session
                if (prev[k] === undefined) {
                    prev[k] = el.style.getPropertyValue(k);
                }
                el.style.setProperty(k, styles[k]);
            }
        }
        backupMap.set(el, prev);
    }

    /**
     * Restores the original inline styles from the backup.
     */
    function restore(el: HTMLElement | null): void {
        if (!el) return;
        
        const prev = backupMap.get(el);
        if (!prev) return;
        
        for (const k in prev) {
            if (Object.prototype.hasOwnProperty.call(prev, k)) {
                el.style.setProperty(k, prev[k]);
            }
        }
        backupMap.delete(el);
    }

    /**
     * Ensures an element has a non-static position so z-index works.
     */
    function ensurePositioned(el: HTMLElement | null): void {
        if (!el) return;
        const pos = window.getComputedStyle(el).position;
        if (pos === 'static') {
            backupAndSet(el, { position: 'relative' });
        }
    }

    /**
     * Applies the Z-Index fix when the dropdown opens.
     */
    function elevateWhileOpen(cardEl: HTMLElement): void {
        const mainEl = document.querySelector(SELECTORS.main) as HTMLElement | null;
        const headerEl = document.getElementById('citizen-page-header');
        const containerEl = document.querySelector('.citizen-page-container') as HTMLElement | null;

        // Prevent clipping
        if (containerEl) backupAndSet(containerEl, { overflow: 'visible' });
        if (mainEl) backupAndSet(mainEl, { overflow: 'visible' });

        // Lift entire main above footer
        if (mainEl) {
            ensurePositioned(mainEl);
            backupAndSet(mainEl, { zIndex: String(TOP_Z - 2) });
        }

        // Lift header even higher (covers sticky bits)
        if (headerEl) {
            ensurePositioned(headerEl);
            backupAndSet(headerEl, { zIndex: String(TOP_Z - 1) });
        }

        // Finally, lift the card itself
        if (cardEl) {
            ensurePositioned(cardEl);
            backupAndSet(cardEl, { zIndex: String(TOP_Z) });
        }
    }

    /**
     * Resets styles when the dropdown closes.
     */
    function resetAfterClose(cardEl: HTMLElement): void {
        const mainEl = document.querySelector(SELECTORS.main) as HTMLElement | null;
        const headerEl = document.getElementById('citizen-page-header');
        const containerEl = document.querySelector('.citizen-page-container') as HTMLElement | null;

        if (cardEl) restore(cardEl);
        if (headerEl) restore(headerEl);
        if (mainEl) restore(mainEl);
        if (containerEl) restore(containerEl);
    }

    function init(): void {
        const root = document.querySelector(SELECTORS.root);
        if (!root) { 
            setTimeout(init, 100); 
            return; 
        }

        const details = root.querySelector(SELECTORS.details) as HTMLDetailsElement | null;
        const card = root.querySelector(SELECTORS.card) as HTMLElement | null;
        
        if (!details || !card) return;

        details.addEventListener('toggle', function () {
            if (details.open) {
                elevateWhileOpen(card);
            } else {
                resetAfterClose(card);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();