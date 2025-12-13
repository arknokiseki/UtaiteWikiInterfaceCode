/**
 * Protection Indicators Gadget
 * Displays lock icons with details about page protection levels using OOUI.
 */

// --- Type Definitions ---

interface ProtectionConfig {
    showLogInPopup: boolean;
    showIconsOnMainPage: boolean;
    popupWidth: number;
    popupWidthMobile: number;
    debug: boolean;
}

interface ProtectionItem {
    type: string;
    level: string;
    expiry: string;
    source?: string;
}

interface ProtectionData {
    action: string;
    level: string;
    expiry: string;
    isCascading: boolean;
    isFlaggedRevs: boolean;
    source: string | null;
}

interface ApiPageInfo {
    protection?: ProtectionItem[];
    [key: string]: unknown;
}

interface ApiProtectionResponse {
    query?: {
        pages?: Record<string, ApiPageInfo>;
    };
}

interface ApiLogItem {
    user: string;
    timestamp: string;
    comment: string;
}

interface ApiLogResponse {
    query?: {
        logevents?: ApiLogItem[];
    };
}

// OOUI Type Definitions (Partial)
interface OOUIWidget {
    $element: JQuery;
    toggle: (visible: boolean) => void;
    isVisible: () => boolean;
}

interface IconWidgetConfig {
    icon: string;
    title: string;
    classes: string[];
}

interface PopupWidgetConfig {
    $content: JQuery;
    padded: boolean;
    anchor: boolean;
    autoClose: boolean;
    width: number;
    classes: string[];
}

declare const OO: {
    ui: {
        IconWidget: new (config: IconWidgetConfig) => OOUIWidget;
        PopupWidget: new (config: PopupWidgetConfig) => OOUIWidget;
    };
};

// --- Global Declarations ---

declare const mw: {
    config: {
        get: <T>(key: string) => T;
    };
    util: {
        getUrl: (title: string) => string;
    };
    html: {
        escape: (text: string) => string;
    };
    Api: new () => {
        get: (params: Record<string, unknown>) => JQuery.Promise<unknown>;
    };
    loader: {
        using: (modules: string[]) => JQuery.Promise<void>;
    };
};

declare const mediaWiki: typeof mw;

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
        return;
    }

    const config: ProtectionConfig = {
        showLogInPopup: true,
        showIconsOnMainPage: true,
        popupWidth: 600,
        popupWidthMobile: 320,
        debug: false
    };

    function getCurrentPageTitle(): string {
        return mw.config.get<string>('wgPageName');
    }

    function getCurrentNamespace(): number {
        return mw.config.get<number>('wgNamespaceNumber');
    }

    function isMainPage(): boolean {
        return mw.config.get<boolean>('wgIsMainPage');
    }

    function shouldShowIndicators(): boolean {
        const namespace = getCurrentNamespace();
        const action = mw.config.get<string>('wgAction');

        if (namespace === -1) return false;
        if (action !== 'view') return false;
        if (!config.showIconsOnMainPage && isMainPage()) return false;

        return true;
    }

    function fetchProtectionData(callback: (err: unknown, data: ApiProtectionResponse | null) => void): void {
        const pageTitle = getCurrentPageTitle();
        const api = new mw.Api();

        api.get({
            action: 'query',
            format: 'json',
            prop: 'info|revisions',
            inprop: 'protection',
            titles: pageTitle,
            rvprop: 'timestamp',
            rvlimit: 1
        }).then(function (data: unknown) {
            callback(null, data as ApiProtectionResponse);
        }).catch(function (error: unknown) {
            callback(error, null);
        });
    }

    function fetchProtectionLog(callback: (err: unknown, data: ApiLogResponse | null) => void): void {
        const pageTitle = getCurrentPageTitle();
        const api = new mw.Api();

        api.get({
            action: 'query',
            format: 'json',
            list: 'logevents',
            letype: 'protect',
            letitle: pageTitle,
            lelimit: 1,
            leprop: 'user|timestamp|comment|details'
        }).then(function (data: unknown) {
            callback(null, data as ApiLogResponse);
        }).catch(function () {
            callback(null, null);
        });
    }

    function parseProtectionData(apiData: ApiProtectionResponse): ProtectionData[] {
        const protections: ProtectionData[] = [];

        if (!apiData.query || !apiData.query.pages) {
            return protections;
        }

        const pages = apiData.query.pages;
        const pageId = Object.keys(pages)[0];
        const page = pages[pageId];

        if (!page.protection || page.protection.length === 0) {
            return protections;
        }

        const seen: Record<string, boolean> = {};

        page.protection.forEach(function (prot: ProtectionItem) {
            const key = prot.type + '-' + prot.level + '-' + (prot.source ? 'cascade' : 'normal');

            if (!seen[key]) {
                seen[key] = true;
                protections.push({
                    action: prot.type,
                    level: prot.level,
                    expiry: prot.expiry,
                    isCascading: !!prot.source,
                    isFlaggedRevs: false,
                    source: prot.source || null
                });
            }
        });

        return protections;
    }

    function formatExpiry(expiry: string): string {
        if (!expiry || expiry === 'infinity' || expiry === 'infinite') {
            return 'infinite';
        }

        try {
            const date = new Date(expiry);
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

            return ('0' + date.getHours()).slice(-2) + ':' +
                ('0' + date.getMinutes()).slice(-2) + ', ' +
                date.getDate() + ' ' + monthNames[date.getMonth()] + ' ' +
                date.getFullYear();
        } catch (e) {
            return 'infinite';
        }
    }

    function formatLogData(logData: ApiLogResponse): string {
        if (!logData.query || !logData.query.logevents || logData.query.logevents.length === 0) {
            return '<p style="font-size: 0.9em; color: #666; margin: 5px 0;">No recent log entries.</p>';
        }

        const log = logData.query.logevents[0];
        const date = new Date(log.timestamp);
        const formattedDate = ('0' + date.getHours()).slice(-2) + ':' +
            ('0' + date.getMinutes()).slice(-2) + ', ' +
            date.getDate() + ' ' +
            ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'][date.getMonth()] + ' ' +
            date.getFullYear();

        let html = '<div style="font-size: 0.9em; margin-top: 5px; line-height: 1.6;">';
        html += '<span style="color: #666;">' + formattedDate + '</span> ';
        html += '<a href="' + mw.util.getUrl('User:' + log.user) + '">' + mw.html.escape(log.user) + '</a> ';

        if (log.comment) {
            html += '<span style="color: #666;">(<em>' + mw.html.escape(log.comment) + '</em>)</span>';
        }

        html += '</div>';
        return html;
    }

    function generateExplanation(protection: ProtectionData, logData: ApiLogResponse | null): string {
        const action = protection.action;
        const level = protection.level;
        const expiry = protection.expiry;
        const isCascading = protection.isCascading;

        const timestamp = formatExpiry(expiry);
        let message = '';

        if (isCascading) {
            message = '<p><strong>Cascading Protection</strong></p>';
            message += '<p>This page is protected from <strong>' + action +
                '</strong> because it is transcluded on a cascading protected page.</p>';
            message += '<p>Only users with <strong>' + level + '</strong> rights can ' +
                action + ' this page.</p>';
        } else {
            if (timestamp !== 'infinite') {
                message = '<p><strong>Page Protection</strong></p>';
                message += '<p>This page is protected from <strong>' + action + '</strong>. ' +
                    'Only users with <strong>' + level + '</strong> rights can ' +
                    action + ' this page until <strong>' + timestamp + '</strong>.</p>';
            } else {
                message = '<p><strong>Page Protection</strong></p>';
                message += '<p>This page is protected from <strong>' + action + '</strong>. ' +
                    'Only users with <strong>' + level + '</strong> rights can ' +
                    action + ' this page.</p>';
            }
        }

        if (config.showLogInPopup && logData) {
            message += '<div class="protectionindicator-log">';
            message += '<hr style="margin: 10px 0; border: none; border-top: 1px solid #ccc;">';
            message += '<p style="margin: 5px 0; font-weight: bold;">Protection log:</p>';
            message += formatLogData(logData);
            message += '</div>';
        }

        return message;
    }

    function createLockIcon(protection: ProtectionData, explanation: string): OOUIWidget {
        const classes = ['protectionindicator-icon'];

        if (protection.isCascading) {
            classes.push('protectionindicator-cascading');
        }

        classes.push('protectionindicator-' + protection.level + '-' + protection.action);

        const icon = new OO.ui.IconWidget({
            icon: 'lock',
            title: 'Protected page - click for details',
            classes: classes
        });

        icon.$element.data('protection-explanation', explanation);
        icon.$element.data('protection-data', protection);

        icon.$element.css({
            cursor: 'pointer',
            opacity: '0.8',
            transition: 'opacity 0.2s'
        });

        icon.$element.on('mouseenter', function () {
            icon.$element.css('opacity', '1');
        });

        icon.$element.on('mouseleave', function () {
            icon.$element.css('opacity', '0.8');
        });

        return icon;
    }

    function createPopupWidget(content: string, _$anchor: JQuery): OOUIWidget {
        return new OO.ui.PopupWidget({
            $content: $(content),
            padded: true,
            anchor: true,
            autoClose: true,
            width: window.innerWidth > 600 ? config.popupWidth : config.popupWidthMobile,
            classes: ['protectionindicator-popup']
        });
    }

    function initProtectionIndicator(protection: ProtectionData, $container: JQuery, logData: ApiLogResponse | null): void {
        const explanation = generateExplanation(protection, logData);
        const icon = createLockIcon(protection, explanation);
        let popup: OOUIWidget | null = null;

        icon.$element.on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Close others
            $('.protectionindicator-popup').each(function () {
                const widget = $(this).data('ooui-widget');
                if (widget && widget !== popup) {
                    widget.toggle(false);
                }
            });

            if (!popup) {
                popup = createPopupWidget(explanation, icon.$element);
                popup.$element.data('ooui-widget', popup);
                icon.$element.after(popup.$element);
                popup.toggle(true);

                setTimeout(function () {
                    $(document).on('click.protectionindicator', function (evt) {
                        if (!$(evt.target).closest(icon.$element[0]).length &&
                            !$(evt.target).closest(popup!.$element[0]).length) {
                            popup!.toggle(false);
                            $(document).off('click.protectionindicator');
                        }
                    });
                }, 10);
            } else {
                const isVisible = popup.isVisible();
                popup.toggle(!isVisible);

                if (!isVisible) {
                    setTimeout(function () {
                        $(document).on('click.protectionindicator', function (evt) {
                            if (!$(evt.target).closest(icon.$element[0]).length &&
                                !$(evt.target).closest(popup!.$element[0]).length) {
                                popup!.toggle(false);
                                $(document).off('click.protectionindicator');
                            }
                        });
                    }, 10);
                } else {
                    $(document).off('click.protectionindicator');
                }
            }
        });

        $container.append(icon.$element);
    }

    function injectStyles(): void {
        if ($('#protectionindicator-styles').length > 0) return;

        const css = `
            .protectionindicator-icon { margin-left: 5px; display: inline-block; }
            .protectionindicator-popup { z-index: 1000; }
            .protectionindicator-popup .oo-ui-popupWidget-popup { max-height: 400px; overflow-y: auto; }
            .protectionindicator-log { margin-top: 10px; }
            .mw-indicators { z-index: 1; }
        `;

        $('<style>')
            .attr('id', 'protectionindicator-styles')
            .text(css)
            .appendTo('head');
    }

    function displayIndicators(protections: ProtectionData[], logData: ApiLogResponse | null): void {
        if ($('.protectionindicator-icon').length > 0) return;

        injectStyles();

        let $container = $('#mw-indicator-protectionindicator, .mw-indicators').first();

        if ($container.length === 0) {
            $container = $('<div>')
                .attr('id', 'mw-indicator-protectionindicator')
                .addClass('mw-indicator')
                .css({
                    'float': 'right',
                    'margin-left': '0.5em',
                    'line-height': '0'
                });

            const $heading = $('#firstHeading, .firstHeading, h1').first();
            if ($heading.length > 0) {
                const $indicators = $heading.find('.mw-indicators');
                if ($indicators.length > 0) {
                    $indicators.prepend($container);
                } else {
                    $heading.prepend($container);
                }
            } else {
                return;
            }
        }

        protections.forEach(function (prot) {
            initProtectionIndicator(prot, $container, logData);
        });
    }

    function init(): void {
        if (!shouldShowIndicators()) return;
        if ($('suppressProtectionIndicator').length > 0) return;

        fetchProtectionData(function (err, data) {
            if (err || !data) return;

            const protections = parseProtectionData(data);
            if (protections.length === 0) return;

            if (config.showLogInPopup) {
                fetchProtectionLog(function (_logErr, logData) {
                    displayIndicators(protections, logData);
                });
            } else {
                displayIndicators(protections, null);
            }
        });
    }

    if (mw.loader) {
        mw.loader.using([
            'mediawiki.util',
            'mediawiki.api',
            'oojs-ui-core',
            'oojs-ui-widgets',
            'oojs-ui.styles.icons-moderation'
        ]).then(function () {
            $(init);
        });
    }

})(mediaWiki, jQuery);