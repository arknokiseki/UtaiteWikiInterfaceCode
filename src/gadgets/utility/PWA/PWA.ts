/**
 * PWA Installer & Manager Gadget
 * Handles manifest injection, Service Worker registration, and Install/Update UI.
 */

// --- Type Definitions ---

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Extend Navigator for non-standard iOS properties
interface NavigatorIOS extends Navigator {
    standalone?: boolean;
}

// Minimal mw.config definition
interface MwConfig {
    get: (key: string) => unknown;
}

declare const mw: {
    config: MwConfig;
    hook: (name: string) => {
        add: (handler: (content: JQuery<HTMLElement>) => void) => void;
    };
};

declare const mediaWiki: typeof mw;

declare global {
    interface Window {
        // Event fired by Chrome/Edge for PWA installation
        onbeforeinstallprompt: ((this: Window, ev: BeforeInstallPromptEvent) => any) | null;
        MSStream?: unknown;
    }
}

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    // --- 1. CONFIGURATION & LOGGING ---
    const rawUserGroups = mw.config.get('wgUserGroups') as string[] | null;
    const userGroups = rawUserGroups || [];
    
    const isDebug = userGroups.indexOf('interface-admin') !== -1;

    const Log = {
        debug: (...args: unknown[]): void => { if (isDebug) console.debug(...args); },
        log: (...args: unknown[]): void => { if (isDebug) console.log(...args); },
        warn: (...args: unknown[]): void => { if (isDebug) console.warn(...args); },
        error: (...args: unknown[]): void => { if (isDebug) console.error(...args); }
    };

    // --- 2. MANIFEST SWAPPER ---
    const rawScriptPath = mw.config.get('wgScriptPath') as string | null;
    const scriptPath = rawScriptPath || '';

    const customManifestUrl = scriptPath + '/index.php?' + $.param({
        title: 'MediaWiki:default-manifest.json',
        action: 'raw',
        ctype: 'application/json'
    });

    const $manifestLink = $('link[rel="manifest"]');
    if ($manifestLink.length) {
        $manifestLink.attr('href', customManifestUrl);
    } else {
        $('head').append('<link rel="manifest" href="' + customManifestUrl + '">');
    }

    // --- 3. VARIABLES ---
    let deferredPrompt: BeforeInstallPromptEvent | null = null;
    const btnSelector = '.utaite-pwa-install-btn';
    let swRegistration: ServiceWorkerRegistration | null = null;

    const nav = navigator as NavigatorIOS;
    // Basic iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    // Standalone detection
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        nav.standalone === true;

    const chipHtml = '<span class="pwa-chip">PWA</span>';

    // --- 4. SERVICE WORKER ---
    function initServiceWorker(): void {
        if (!('serviceWorker' in navigator)) { return; }

        const swUrl = scriptPath + '/index.php?' + $.param({
            title: 'MediaWiki:PWA-default-serviceWorker.js',
            action: 'raw',
            ctype: 'text/javascript'
        });

        navigator.serviceWorker.register(swUrl)
            .then(function (reg) {
                Log.debug('[PWA] SW Registered:', reg.scope);
                swRegistration = reg;

                reg.onupdatefound = function (): void {
                    const installingWorker = reg.installing;
                    if (!installingWorker) return;

                    installingWorker.onstatechange = function (): void {
                        if (installingWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                Log.log('[PWA] Update found!');
                                showUpdateNotification();
                            }
                        }
                    };
                };
            })
            .catch(function (err) {
                Log.error('[PWA] SW Failed:', err);
            });

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            window.location.reload();
        });
    }

    // --- 5. UPDATE CHECKER ---
    function checkForUpdates(): void {
        if (!swRegistration) {
            alert("Service worker is not active yet. Try again in a moment.");
            return;
        }

        const $btn = $(btnSelector);
        const originalHtml = $btn.html();

        // Loading State
        $btn.html('<i class="fa-solid fa-circle-notch pwa-spin"></i>&nbsp;Checking... ' + chipHtml)
            .css('opacity', '0.7');

        swRegistration.update()
            .then(function () {
                setTimeout(function () {
                    if (swRegistration && swRegistration.waiting) {
                        showUpdateNotification();
                    } else {
                        // Success - No update
                        $btn.html('<i class="fa-solid fa-check"></i>&nbsp;Up to date ' + chipHtml);
                        setTimeout(function () {
                            $btn.html(originalHtml).css('opacity', '1');
                        }, 2000);
                    }
                }, 1000);
            })
            .catch(function (err) {
                Log.error('[PWA] update failed:', err);
                $btn.html('<i class="fa-solid fa-xmark"></i> Error');
                setTimeout(function () {
                    $btn.html(originalHtml).css('opacity', '1');
                }, 2000);
            });
    }

    function showUpdateNotification(): void {
        $(btnSelector)
            .removeClass('pwa-btn-standalone pwa-btn-installed')
            .addClass('pwa-btn-update')
            .removeAttr('style')
            .html('<span><i class="fa-solid fa-bolt"></i> Update Ready!</span>' + chipHtml)
            .off('click')
            .on('click', function () {
                if (swRegistration && swRegistration.waiting) {
                    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
                } else {
                    window.location.reload();
                }
            });
    }

    // --- 6. UI SETUP ---
    function handleInstallClick(): void {
        if (isIOS) {
            alert("To install on iOS:\n1. Tap 'Share'\n2. Select 'Add to Home Screen'");
            return;
        }
        if (!deferredPrompt) { return; }

        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (result) {
            deferredPrompt = null;
            if (result.outcome === 'accepted') {
                // User accepted
                const successHtml =
                    '<div>' +
                    '<span><i class="fa-solid fa-check"></i> Installed!</span>' +
                    '<span class="pwa-subtext">Running...</span>' +
                    '</div>' +
                    chipHtml;

                $(btnSelector)
                    .removeAttr('style')
                    .removeClass('pwa-btn-standalone pwa-btn-update')
                    .addClass('pwa-btn-installed')
                    .html(successHtml);
            }
        });
    }

    function setupInterface($content: JQuery<HTMLElement>): void {
        const $btn = $content.find(btnSelector);
        if ($btn.length === 0) return;

        $btn.off('click');

        // CASE 1: STANDALONE APP
        if (isStandalone) {
            $btn.removeAttr('style')
                .removeClass('pwa-btn-installed pwa-btn-update')
                .addClass('pwa-btn-standalone')
                .html('<span><i class="fa-solid fa-rotate-right"></i> Check Updates</span>' + chipHtml)
                .on('click', function (e) {
                    e.preventDefault();
                    checkForUpdates();
                });
            return;
        }

        // CASE 2: BROWSER MODE
        $btn.show().css('opacity', '1');

        if (deferredPrompt || (isIOS && !isStandalone)) {
            // SUB-CASE: INSTALLABLE
            $btn.css('cursor', 'pointer');
        } else {
            // SUB-CASE: ALREADY INSTALLED ... OR NOT SUPPORTED
            const fallbackHtml =
                '<div>' +
                '<span><i class="fa-solid fa-check"></i> App Active</span>' +
                '<span class="pwa-subtext">...or not installable</span>' +
                '</div>' +
                chipHtml;

            $btn.removeAttr('style')
                .removeClass('pwa-btn-standalone pwa-btn-update')
                .addClass('pwa-btn-installed')
                .html(fallbackHtml);
            return;
        }

        // Bind Install Click (only if not handled above)
        if (!$('body').data('pwa-click-bound')) {
            $('body')
                .on('click', btnSelector, function (e) {
                    const $target = $(this);
                    if (!$target.hasClass('pwa-btn-standalone') && !$target.hasClass('pwa-btn-installed')) {
                        e.preventDefault();
                        handleInstallClick();
                    }
                })
                .data('pwa-click-bound', true);
        }
    }

    // --- 7. INITIALIZATION ---
    window.addEventListener('beforeinstallprompt', function (e: Event) {
        e.preventDefault();
        deferredPrompt = e as BeforeInstallPromptEvent;
        $(btnSelector).show();
    });

    $(function () {
        initServiceWorker();

        // Hack for link navigation in Standalone mode on iOS/Mobile
        // to prevent jumping out to Safari/Chrome
        if (isStandalone) {
            $(document).on('click', 'a', function (e) {
                const href = $(this).attr('href');
                if (href && href.indexOf('/wiki/') === 0) {
                    e.preventDefault();
                    const title = href.replace('/wiki/', '');
                    window.location.href = scriptPath + '/index.php?title=' + title;
                }
            });
        }

        mw.hook('wikipage.content').add(setupInterface);
    });

})(mediaWiki, jQuery);