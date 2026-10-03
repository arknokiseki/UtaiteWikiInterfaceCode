(function() {
    'use strict';

    function isMainPage() {
        var pageName = mw.config && mw.config.get ? mw.config.get('wgPageName') : '';
        var mp = ['Utaite_Wiki', 'Utaite Wiki', 'Utaite%20Wiki', 'Main_Page'];
        if (mp.indexOf(pageName) !== -1) return true;

        var currentUrl = window.location.href;
        var exact = ['/wiki/Utaite_Wiki', '/wiki/Utaite%20Wiki', '/wiki/Main_Page'];
        return exact.some(function(p) {
            return currentUrl.indexOf(p) !== -1 &&
                currentUrl.indexOf(p + '/') === -1 &&
                currentUrl.indexOf(p + ':') === -1;
        });
    }

    function isMobileFrontend() {
        var body = document.body;
        return body.className.indexOf('mw-mf') !== -1 || 
               body.className.indexOf('is-mobile-device') !== -1;
    }

    function destroyDesktopContent() {
        var desktopDivs = document.querySelectorAll('div.mainpage-desktop');
        for (var i = 0; i < desktopDivs.length; i++) {
            desktopDivs[i].innerHTML = '';
        }
    }

    function renderMobileTemplate() {
        mw.loader.using('mediawiki.api').done(function() {
            new mw.Api().get({
                action: 'parse',
                page: 'Template:MP-Mobile',
                prop: 'text',
                disablelimitreport: 1,
                disableeditsection: 1,
                wrapoutputclass: ''
            }).done(function(data) {
                if (data.parse && data.parse.text && data.parse.text['*']) {
                    var desktopDivs = document.querySelectorAll('div.mainpage-desktop');
                    for (var i = 0; i < desktopDivs.length; i++) {
                        desktopDivs[i].innerHTML = data.parse.text['*'];
                    }
                }
            }).fail(function() {
                mw.log.error('Failed to load Template:MP-Mobile');
            });
        });
    }

    function init() {
        if (!isMainPage()) return;
        if (!isMobileFrontend()) return;

        destroyDesktopContent();
        renderMobileTemplate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();