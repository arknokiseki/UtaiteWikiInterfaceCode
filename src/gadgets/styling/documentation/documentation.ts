/**
 * Documentation Utility Script
 * Opens "WhatLinksHere" links in documentation tables in a new tab.
 * version 1.0.0
 */

// --- Implementation ---

(function ($: JQueryStatic): void {
    'use strict';

    $(function (): void {
        const selector = '.doctable tr.links a[href*="Special:WhatLinksHere"]';

        $(selector).each(function (this: HTMLAnchorElement): void {
            const $link = $(this);
            $link.attr('target', '_blank');
            $link.attr('rel', 'noopener noreferrer');
        });
    });

})(jQuery);