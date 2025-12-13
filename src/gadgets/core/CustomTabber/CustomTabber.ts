export {};

declare global {
    interface Window {
        CustomTabberInit: boolean;
    }
}

interface TabChangeDetail {
    panelId: string;
}

(function ($, mw) {
    'use strict';

    if (window.CustomTabberInit) {
        return;
    }
    window.CustomTabberInit = true;

    const stripLabelPrefixes = ($root: any) => {
        ($root || $(document)).find('.js-custom-tabber').each(function (this: HTMLElement) {
            const $tabber = $(this);
            const tabberId = $tabber.data('tabber-id');
            if (!tabberId) return;

            const prefixToRemove = String(tabberId) + '-';

            $tabber.find('.tabber__tab').each(function (this: HTMLElement) {
                const $tabLink = $(this);
                const currentText = $tabLink.text() || '';
                if (currentText.indexOf(prefixToRemove) === 0) {
                    $tabLink.text(currentText.substring(prefixToRemove.length));
                }
            });
        });
    };

    const bindStopPropagation = ($root: any) => {
        ($root || $(document)).find('header.tabber__header').each(function (this: HTMLElement) {
            const $h = $(this);
            if ($h.data('customTabberBound')) return;
            
            $h.data('customTabberBound', true).on('click', (e: any) => {
                e.stopPropagation();
            });
        });
    };

    $(function () {
        bindStopPropagation($(document));
        stripLabelPrefixes($(document));
    });

    if (mw && mw.hook) {
        mw.hook('wikipage.content').add(($content: any) => {
            bindStopPropagation($content);
            stripLabelPrefixes($content);
        });
    }

    document.documentElement.addEventListener('tabber:tabchange', (e: Event) => {
        const customEvent = e as CustomEvent<TabChangeDetail>;

        if (!customEvent.detail.panelId) return;
        
        const panel = document.getElementById(customEvent.detail.panelId);
        if (!panel) return;

        const $panelScope = $(panel).closest('.tabber');
        bindStopPropagation($panelScope);
        stripLabelPrefixes($panelScope);
    }, true);

})(jQuery, mediaWiki);