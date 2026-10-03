/**
 * CustomIconGlobal.js
 * Generates and injects CSS masks for custom SVG icons based on MediaWiki:CustomIcon.json.
 * Caches the CSS in localStorage for 15 minutes.
 */
mw.loader.using(['mediawiki.api', 'mediawiki.util']).then(function () {
    const CACHE_KEY = 'uw_custom_icons_css';
    const CACHE_TIME_KEY = 'uw_custom_icons_time';
    const CACHE_TTL = 900000;

    function injectCSS(cssString: any) {
        const style = document.createElement('style');
        style.id = 'uw-custom-icon-styles';
        style.textContent = cssString;
        document.head.appendChild(style);
    }

    function generateAndCacheCSS(jsonData: any) {
        let css = `
            .uw-icon {
                display: inline-block;
                background-color: currentColor;
                -webkit-mask-size: contain; mask-size: contain;
                -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
                -webkit-mask-position: center; mask-position: center;
                width: 1em;   
                height: 1em;  
                vertical-align: -0.125em;
            }
            
            .uw-2xs { font-size: 0.625em; }
            .uw-xs  { font-size: 0.75em; }
            .uw-sm  { font-size: 0.875em; }
            .uw-lg  { font-size: 1.25em; }
            .uw-xl  { font-size: 1.5em; }
            .uw-2xl { font-size: 2em; }

            .uw-flip-horizontal { transform: scaleX(-1); }
            .uw-flip-vertical   { transform: scaleY(-1); }
            .uw-flip-both       { transform: scale(-1, -1); }
            .uw-rotate-90       { transform: rotate(90deg); }
            .uw-rotate-180      { transform: rotate(180deg); }
            .uw-rotate-270      { transform: rotate(270deg); }
            .uw-rotate-by       { transform: rotate(var(--uw-rotate-angle, 0deg)); }

            .uw-spin          { animation: uw-spin         var(--uw-anim-duration, 2s) var(--uw-anim-iteration, infinite) linear; }
            .uw-spin-reverse  { animation: uw-spin-reverse var(--uw-anim-duration, 2s) var(--uw-anim-iteration, infinite) linear; }
            .uw-spin-pulse    { animation: uw-spin         var(--uw-anim-duration, 1s) var(--uw-anim-iteration, infinite) steps(8); }
            .uw-beat          { animation: uw-beat         var(--uw-anim-duration, 1s) var(--uw-anim-iteration, infinite) ease-in-out; }
            .uw-beat-fade     { animation: uw-beat-fade    var(--uw-anim-duration, 1s) var(--uw-anim-iteration, infinite) ease-in-out; }
            .uw-bounce        { animation: uw-bounce       var(--uw-anim-duration, 1s) var(--uw-anim-iteration, infinite) ease-in-out; }
            .uw-fade          { animation: uw-fade         var(--uw-anim-duration, 1s) var(--uw-anim-iteration, infinite) ease-in-out; }
            .uw-flip          { animation: uw-flip         var(--uw-anim-duration, 3s) var(--uw-anim-iteration, infinite) ease-in-out; }
            .uw-shake         { animation: uw-shake        var(--uw-anim-duration, 1s) var(--uw-anim-iteration, infinite) ease-in-out; }

            @keyframes uw-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            @keyframes uw-spin-reverse { 0% { transform: rotate(360deg); } 100% { transform: rotate(0deg); } }
            @keyframes uw-beat { 0%, 90% { transform: scale(1); } 45% { transform: scale(1.25); } }
            @keyframes uw-beat-fade { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.125); } }
            @keyframes uw-bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-0.25em); } 60% { transform: translateY(-0.125em); } }
            @keyframes uw-fade { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
            @keyframes uw-flip { 50% { transform: rotate3d(0, 1, 0, -180deg); } 100% { transform: rotate3d(0, 1, 0, -360deg); } }
            @keyframes uw-shake { 0%, 100% { transform: rotate(0deg); } 20%, 60% { transform: rotate(-8deg); } 40%, 80% { transform: rotate(8deg); } }
        `;

        const entries = Object.entries(jsonData);
        if (entries.length === 0) {
            localStorage.setItem(CACHE_KEY, css);
            localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
            injectCSS(css);
            return;
        }

        new mw.Api().get({
            action: 'query',
            titles: entries.map(([, f]) => 'File:' + f).join('|'),
            prop: 'imageinfo',
            iiprop: 'url',
            formatversion: 2
        }).then(function (data) {
            const urlMap = {};
            (data.query.pages || []).forEach(function (page: any) {
                if (page.imageinfo && page.imageinfo[0]) {
                    var fname = page.title.replace(/^File:/, '');
                    (urlMap as any)[fname] = page.imageinfo[0].url;
                }
            });

            entries.forEach(function (entry) {
                var className = entry[0].replace(/[^a-zA-Z0-9_-]/g, '');
                var fileName = entry[1];
                var directUrl = (urlMap as any)[(fileName as any)];
                if (directUrl) {
                    css += '.' + className + ' { -webkit-mask-image: url("' + directUrl + '"); mask-image: url("' + directUrl + '"); }\n';
                }
            });

            localStorage.setItem(CACHE_KEY, css);
            localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
            injectCSS(css);
        });
    }

    const cachedCSS = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);

    if (cachedCSS && cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_TTL) {
        injectCSS(cachedCSS);
    } else {
        new mw.Api().get({
            action: 'query',
            titles: 'MediaWiki:CustomIcon.json',
            prop: 'revisions',
            rvprop: 'content',
            rvslots: 'main',
            formatversion: 2
        }).then(data => {
            const page = data.query.pages[0];
            if (!page.missing) {
                try {
                    generateAndCacheCSS(JSON.parse(page.revisions[0].slots.main.content));
                } catch (e) {
                    console.error('[CustomIconGlobal] Failed to parse JSON:', e);
                }
            } else {
                generateAndCacheCSS({});
            }
        }).catch(err => console.error('[CustomIconGlobal] Failed to fetch JSON:', err));
    }
});

export {};
