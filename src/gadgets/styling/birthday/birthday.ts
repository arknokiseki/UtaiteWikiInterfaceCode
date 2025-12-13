/**
 * Birthday Effects Gadget
 * Adds rainbow text and confetti to pages in the "Today's Birthdays" category.
 */

// --- Type Definitions ---

interface ConfettiOptions {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    drift?: number;
    ticks?: number;
    origin?: { x: number; y: number };
    colors?: string[];
    shapes?: string[];
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
}

type ConfettiFunction = (options?: ConfettiOptions) => Promise<null> | null;

declare global {
    interface Window {
        confetti?: ConfettiFunction;
        __confettiLibLoading?: boolean;
    }
}

declare const mw: {
    config: {
        get: <T>(key: string) => T;
    };
    loader: {
        getScript: (url: string) => JQuery.Promise<void>;
    };
};

declare const mediaWiki: typeof mw;

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
        return;
    }

    const CONFETTI_GADGET_URL = 'https://utaite.miraheze.org/wiki/MediaWiki:Gadget-confetti.js?action=raw&ctype=text/javascript';

    /**
     * Ensures the confetti library is loaded.
     * Uses a lock mechanism to prevent double loading.
     */
    function ensureConfettiLib(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (window.confetti) {
                return resolve();
            }

            if (window.__confettiLibLoading) {
                const wait = setInterval(() => {
                    if (window.confetti) {
                        clearInterval(wait);
                        resolve();
                    }
                }, 100);
                return;
            }

            window.__confettiLibLoading = true;

            mw.loader.getScript(CONFETTI_GADGET_URL).then(
                () => {
                    window.__confettiLibLoading = false;
                    resolve();
                },
                (err: unknown) => {
                    window.__confettiLibLoading = false;
                    console.error('Failed to load Confetti gadget:', err);
                    reject(err);
                }
            );
        });
    }

    /**
     * Generates a random number within a range.
     */
    function randomInRange(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    $(function () {
        // mw.config.get('wgCategories') returns null if no categories exist, or string[]
        const categories = mw.config.get<string[] | null>('wgCategories');

        if (categories && categories.indexOf("Today's Birthdays") !== -1) {

            // 1. Apply Rainbow Text Effect
            let $heading = $('.firstHeading');
            if (!$heading.length) $heading = $('h1').first();

            let $titleText = $heading.find('.mw-page-title-main');
            if (!$titleText.length) $titleText = $heading;

            // Note: Styles should be loaded via ResourceLoader/Gadget definition (BirthdayEffects.less)
            $titleText.addClass('fx-rainbow-text');

            // 2. Trigger Confetti
            ensureConfettiLib().then(() => {
                if (!window.confetti) return;

                const duration = 5000;
                const animationEnd = Date.now() + duration;
                const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

                const interval = window.setInterval(function () {
                    const timeLeft = animationEnd - Date.now();

                    if (timeLeft <= 0) {
                        return clearInterval(interval);
                    }

                    const particleCount = 50 * (timeLeft / duration);

                    // Left side burst
                    window.confetti!($.extend({}, defaults, {
                        particleCount: particleCount,
                        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
                    }));

                    // Right side burst
                    window.confetti!($.extend({}, defaults, {
                        particleCount: particleCount,
                        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
                    }));
                }, 250);
            });
        }
    });

})(mediaWiki, jQuery);