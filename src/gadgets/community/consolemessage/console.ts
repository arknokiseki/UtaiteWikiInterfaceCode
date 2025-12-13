(function (): void {
    'use strict';

    if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
        return;
    }

    console.log(
        '%c歌%cい%c手',
        'color:#d04b44;font-weight:bold;',
        'color:#cfa634;font-weight:bold;',
        'color:#67a7c2;font-weight:bold;'
    );
})();