/**
 * mw:Extension:Popups like script, adapted for standard MediaWiki
 * popup on link:hover
 * Original maintainer: user:fngplg
 * classes: main: npage-preview, image not found: npage-preview-noimage
 * img: <img>, text: <div>
 */

interface MwConfig {
    wgScriptPath: string;
    wgArticlePath: string;
    wgServer: string;
    wgUserGroups?: string[];
}

interface ParsedUri {
    href: string;
    host: string;
    pathname: string;
    truepath: string;
    interwiki: string;
    islocal: boolean;
}

interface CacheEntry {
    href: string;
    data: JQuery<HTMLElement>;
    uri?: ParsedUri;
}

interface LocationData {
    left: number;
    top: number;
    lefts: number;
    tops: number;
    clientX: number;
    clientY: number;
}

interface CurrentElement {
    href: string;
    islocal?: boolean;
    interwiki?: string;
    data?: JQuery<HTMLElement>;
}

interface RegExpSettings {
    iimages: (RegExp | string)[];
    ipages: (RegExp | string)[];
    ilinks: (RegExp | string)[];
    iparents: string[];
    iclasses: string[];
    onlyinclude: string[];
    noinclude: string[];
    wiki: RegExp;
    dtag: RegExp;
    prep: RegExp[];
}

interface ProcessControl {
    sync: (string | boolean)[];
    start: (e?: string | boolean) => boolean;
    stop: (e?: string | boolean) => void;
}

interface ExportedFunctions {
    init: () => void;
    main: ($cont?: JQuery<HTMLElement>) => void;
    createuri: (href: string | URL) => ParsedUri | undefined;
    getpreview: (ev: JQuery.MouseEnterEvent, forcepath?: string, withD?: boolean) => void;
    showpreview: (data: JQuery<HTMLElement>, target: ParsedUri, force: boolean) => void;
    hidepreview: () => void;
    cache: CacheEntry[];
    ignoreimage: (name: string) => boolean;
    ignorepage: (name: string) => boolean;
    ignorelink: (name: string) => boolean;
    cacheof: (href: string) => CacheEntry | null;
    chkimagesrc: (src: string) => boolean;
    preprocess: (text: string) => string;
    elvalidate: ($el: JQuery<HTMLElement>) => boolean;
    pp?: ProcessControl;
}

type WrapperFunction = ($: JQueryStatic) => void;

interface PPreviewSettings {
    debug: boolean;
    dontrun: string | null;
    apid: boolean;
    delay: number;
    throttle: number;
    throttling: ReturnType<typeof setTimeout> | false;
    process: boolean;
    tlen: number;
    pibox: boolean;
    piboxkeepprev: boolean;
    csize: number;
    defimage: string;
    noimage: string;
    thumbwidth: number;
    minImageWidth: number;
    minImageHeight: number;
    dock: string;
    wholepage: boolean;
    RegExp: RegExpSettings;
    fixContentHook: boolean;
    version?: string;
    cache?: CacheEntry[];
    wrapper?: WrapperFunction;
    context?: unknown;
    f?: ExportedFunctions;
    pdiv?: unknown;
}

interface PageImagesResult {
    type: 'file' | 'url';
    name?: string;
    url?: string;
}

interface ParseResponse {
    parse?: {
        text?: { '*': string } | string;
        images?: string[];
        parsetree?: { '*': string } | string;
    };
}

interface QueryResponse {
    query?: {
        pages?: Record<string, {
            title?: string;
            missing?: string;
            invalid?: string;
            pageimage?: string;
            thumbnail?: { source: string };
            imageinfo?: Array<{
                url?: string;
                thumburl?: string;
                width?: number;
                height?: number;
                mime?: string;
                mediatype?: string;
            }>;
        }>;
    };
}

declare const mw: {
    config: {
        get: (keys: string[]) => MwConfig;
    };
    loader: {
        using: (modules: string[], callback: () => void) => void;
    };
    hook: (name: string) => {
        add: (callback: ($content: JQuery<HTMLElement>) => void) => void;
        remove: (callback: ($content: JQuery<HTMLElement>) => void) => void;
        fire: (data: unknown) => void;
    };
    util: unknown;
};

declare global {
    interface Window {
        pPreview?: Partial<PPreviewSettings>;
        DOMParser: typeof DOMParser;
    }
}

const wrapper: WrapperFunction = function ($: JQueryStatic): void {
    'use strict';

    if (
        document.body.classList.contains('mw-mf') ||
        document.body.classList.contains('is-mobile-device')
    ) {
        return;
    }

    const urlVars = new URLSearchParams(location.search);
    const Settings: PPreviewSettings = (window.pPreview as PPreviewSettings) || {} as PPreviewSettings;
    const mwc = mw.config.get(['wgScriptPath', 'wgArticlePath', 'wgServer']);

    Settings.debug = !!(
        urlVars.get('debug') ||
        urlVars.get('debug1') ||
        (Settings.debug !== undefined ? Settings.debug : false)
    );

    // killswitch
    Settings.dontrun = urlVars.get('nolp');
    if (Settings.dontrun) return;

    // default values
    const Defaults = {
        dock: '#mw-content-text',
        defimage: 'https://static.wikitide.net/utaitewiki/4/42/Loading.gif',
        noimage: 'https://static.wikitide.net/utaitewiki/d/d8/404simple.png'
    };

    const pp: ProcessControl = {
        sync: [],
        start: function (e?: string | boolean): boolean {
            if (e && pp.sync.indexOf(e) > -1) return false;
            Settings.process = true;
            pp.sync.push(e || Settings.process);
            return true;
        },
        stop: function (e?: string | boolean): void {
            hlpaHover();
            const epos = pp.sync.indexOf(e as string | boolean);
            if (epos !== -1) pp.sync.splice(epos, 1);
            else pp.sync.splice(0, 1);
            if (pp.sync.length === 0) Settings.process = false;
        }
    };

    const ncache: CacheEntry[] = [];
    const loc: LocationData = { left: 0, top: 0, lefts: 5, tops: 5, clientX: 0, clientY: 0 };
    const currentEl: CurrentElement = { href: '' };
    let apiUri: URL;

    // exports
    Settings.wrapper = wrapper;
    Settings.context = undefined;
    Settings.f = {
        init: init,
        main: main,
        createuri: createUri,
        getpreview: ngetPreview,
        showpreview: nshowPreview,
        hidepreview: nhidePreview,
        cache: ncache,
        ignoreimage: nignoreImage,
        ignorepage: nignorePage,
        ignorelink: nignoreLink,
        cacheof: ncacheOf,
        chkimagesrc: chkImageSrc,
        preprocess: preprocess,
        elvalidate: elValidate,
        pp: pp
    };

    mw.loader.using(['mediawiki.util'], init);

    function log(...args: unknown[]): void {
        const groups = mw.config.get(['wgScriptPath', 'wgArticlePath', 'wgServer']) as unknown as { wgUserGroups?: string[] };
        const userGroups = (groups as { wgUserGroups?: string[] }).wgUserGroups || [];
        if (userGroups.indexOf('interface-admin') === -1) return;
        console.log('pp', ...args);
    }

    function init(): void {
        if (window.pPreview && window.pPreview.version) {
            log('init dbl run protection triggered');
            return;
        }
        Settings.version = '1.80-smartimg';
        log('init vrsn:', Settings.version);

        apiUri = new URL(mwc.wgScriptPath + '/api.php', mwc.wgServer);

        Settings.apid = Settings.apid !== undefined ? Settings.apid : false;
        Settings.delay = Settings.delay !== undefined ? Settings.delay : 100;
        Settings.throttle = Settings.throttle !== undefined ? Settings.throttle : 100;
        Settings.throttling = false;
        Settings.process = false;
        Settings.tlen = Settings.tlen !== undefined ? Settings.tlen : 1000;
        Settings.pibox = Settings.pibox !== undefined ? Settings.pibox : false;
        Settings.piboxkeepprev = Settings.piboxkeepprev !== undefined ? Settings.piboxkeepprev : false;
        Settings.csize = Settings.csize !== undefined ? Settings.csize : 100;
        Settings.defimage = Settings.defimage !== undefined ? Settings.defimage : Defaults.defimage;
        Settings.noimage = Settings.noimage !== undefined ? Settings.noimage : Defaults.noimage;
        Settings.thumbwidth = Settings.thumbwidth !== undefined ? Settings.thumbwidth : 350;
        Settings.minImageWidth = Settings.minImageWidth !== undefined ? Settings.minImageWidth : 80;
        Settings.minImageHeight = Settings.minImageHeight !== undefined ? Settings.minImageHeight : 80;
        Settings.dock = Settings.dock ? Settings.dock : Defaults.dock;
        Settings.wholepage = !!(urlVars.get('wholepage') || (Settings.wholepage !== undefined ? Settings.wholepage : false));

        Settings.RegExp = Settings.RegExp || {} as RegExpSettings;
        Settings.RegExp.iimages = Settings.RegExp.iimages || [];
        Settings.RegExp.ipages = Settings.RegExp.ipages || [];
        Settings.RegExp.ilinks = Settings.RegExp.ilinks || [];
        Settings.RegExp.iparents = Settings.RegExp.iparents || ['[id^=flytabs] .tabs'];
        Settings.RegExp.iclasses = Settings.RegExp.iclasses || [];
        Settings.RegExp.onlyinclude = Settings.RegExp.onlyinclude || [];
        Settings.RegExp.noinclude = Settings.RegExp.noinclude || [];
        Settings.RegExp.wiki = Settings.RegExp.wiki || new RegExp('^.*?\\/wiki\\/', 'i');
        Settings.RegExp.dtag = Settings.RegExp.dtag || new RegExp('<.*>', 'gm');
        Settings.RegExp.prep = Settings.RegExp.prep || [];

        Settings.fixContentHook = Settings.fixContentHook !== undefined ? Settings.fixContentHook : true;
        window.pPreview = Settings;

        injectDefaultIconIgnores();

        const thisPage = (createUri(location.href) || {} as Partial<ParsedUri>).truepath;
        if (!thisPage || nignorePage(thisPage)) {
            mw.hook('wikipage.content').remove(main);
            log('ignore', thisPage);
            return;
        }
        log('rmain');
        if (Settings.debug) Settings.cache = ncache;

        Settings.RegExp.ilinks.push(thisPage);
        Settings.RegExp.ilinks.push(new RegExp(apiUri.pathname));

        let r: RegExp;
        if (Settings.RegExp.prep instanceof RegExp) {
            r = Settings.RegExp.prep;
            Settings.RegExp.prep = [r];
        }
        if (!Array.isArray(Settings.RegExp.prep)) {
            Settings.RegExp.prep = [];
        }
        Settings.RegExp.prep.push(/<script>[\s\S]*?<\/script>/gim);
        Settings.RegExp.prep.push(/<ref>[\s\S]*?<\/ref>/gim);

        Settings.defimage = chkImageSrc(Settings.defimage) ? Settings.defimage : Defaults.defimage;
        Settings.noimage = chkImageSrc(Settings.noimage) ? Settings.noimage : Defaults.noimage;
        Settings.f!.pp = pp;

        mw.hook('wikipage.content').add(main);
        mw.hook('ppreview.ready').fire(Settings);
    }

    function injectDefaultIconIgnores(): void {
        const defaults: RegExp[] = [
            /^(?:Twitcast|Marshmallow|Instagram|Twitter|YouTube|Spotify|Line|NND|Niconico|TikTok|Twitch|Discord|Threads|Facebook|SoundCloud|Bandcamp|AppleMusic|iTunes|Reddit|Steam|Patreon|Pixiv|Booth|FANBOX|Gumroad|Kofi|Ko[-\s]?fi|Weibo|Bilibili|Deezer|Audius|Anchor|Genius|Mail|Email|Website|Homepage).*?\.(?:png|svg|gif|jpg|jpeg)$/i
        ];
        defaults.forEach(function (re) {
            const exists = Settings.RegExp.iimages.some(function (r) {
                return String(r) === String(re);
            });
            if (!exists) Settings.RegExp.iimages.push(re);
        });
    }

    function main($cont?: JQuery<HTMLElement>): void {
        log('main', $cont);
        if (Settings.fixContentHook && $cont && $cont.length) {
            Settings.fixContentHook = false;
            if (($cont as JQuery<HTMLElement> & { selector?: string }).selector !== '#mw-content-text') {
                log('main fixcontent', $cont);
                main($('#mw-content-text'));
            }
        }
        let $content: JQuery<HTMLElement>;
        const arr: HTMLElement[] = [];
        Settings.dock.split(',').forEach(function (v) {
            let $c: JQuery<HTMLElement> = $() as JQuery<HTMLElement>;
            if ($cont) {
                $c = ($cont.is(v) || $cont.parents(v).length) ? $cont : $() as JQuery<HTMLElement>;
            } else {
                $c = $(v) as JQuery<HTMLElement>;
            }
            $.merge(arr, $c.toArray());
        });
        $content = $(arr);
        log('main.c:', $content);
        $content.find('a').each(function () {
            const $el = $(this);
            if (elValidate($el)) {
                $el.off('mouseenter.pp mouseleave.pp');
                $el.on('mouseenter.pp', aHover);
                $el.on('mouseleave.pp', nhidePreview);
            }
        });
    }

    function elValidate($el: JQuery<HTMLElement>): boolean {
        const ahref = $el.attr('href');
        let bstop = false;
        if (!ahref) return false;
        const parsedHref = createUri(ahref);
        if (!parsedHref || (parsedHref.host !== apiUri.host) || nignoreLink(parsedHref.truepath)) return false;

        if (Array.isArray(Settings.RegExp.iclasses)) {
            Settings.RegExp.iclasses.forEach(function (v) {
                if ($el.hasClass(v)) bstop = true;
            });
        }
        if (bstop) return false;

        if (Array.isArray(Settings.RegExp.iparents)) {
            Settings.RegExp.iparents.forEach(function (v) {
                if ($el.parents(v).length) bstop = true;
            });
        }
        return !bstop;
    }

    function chkImageSrc(src: string): boolean {
        if (!src) return false;
        try {
            new URL(src, location.href);
            return true;
        } catch (e) {
            return false;
        }
    }

    function preprocess(text: string): string {
        if (!Array.isArray(Settings.RegExp.prep) || Settings.RegExp.prep.length < 1) return '';
        let s = text;
        const $s = $('<div>').html(s);

        $s.find('.blacklist-pPreview').remove();
        $s.find('figure.embedvideo').remove();

        if (Settings.RegExp.noinclude && Array.isArray(Settings.RegExp.noinclude)) {
            Settings.RegExp.noinclude.forEach(function (v) {
                $s.find(v).remove();
            });
        }
        s = $s.html() || '';
        if (Settings.RegExp.onlyinclude && Array.isArray(Settings.RegExp.onlyinclude)) {
            s = Settings.RegExp.onlyinclude
                .map(function (v) {
                    const $v = $s.find(v);
                    if ($v.length) {
                        $s.find(v).remove();
                        return $v
                            .map(function () {
                                return (this as HTMLElement).outerHTML;
                            })
                            .toArray()
                            .join();
                    }
                    return false;
                })
                .filter(Boolean)
                .join() || s;
        }
        Settings.RegExp.prep.forEach(function (v) {
            s = s.replace(v, '');
        });
        return s;
    }

    function createUri(href: string | URL): ParsedUri | undefined {
        let h: URL | undefined;
        try {
            h = href instanceof URL ? new URL(href.href) : new URL(String(href), location.href);
        } catch (e) {
            h = undefined;
        }
        if (h) {
            try {
                const parsed = h as URL & Partial<ParsedUri>;
                parsed.truepath = decodeURIComponent(h.pathname.replace(Settings.RegExp.wiki, ''));
                parsed.interwiki = h.pathname.split('/wiki/')[0];
                parsed.islocal = mwc.wgArticlePath.split('/wiki/')[0] === parsed.interwiki && h.host === apiUri.host;
                return parsed as ParsedUri;
            } catch (e) {
                return undefined;
            }
        }
        return undefined;
    }

    function hlpaHover(): void {
        if (Settings.throttling) {
            clearTimeout(Settings.throttling);
            Settings.throttling = false;
        }
    }

    function aHover(ev: JQuery.MouseEnterEvent): void {
        ev.stopPropagation();
        if (Settings.throttling || Settings.process) return;
        Settings.throttling = setTimeout(hlpaHover, Settings.throttle);
        const hel = createUri($(ev.currentTarget).attr('href') || '') || {} as Partial<ParsedUri>;
        if (hel && hel.truepath && currentEl.href === hel.truepath) return;
        currentEl.href = hel.truepath || '';
        currentEl.islocal = hel.islocal;
        currentEl.interwiki = hel.interwiki;
        if (nignoreLink(currentEl.href)) return;
        loc.left = ev.pageX;
        loc.top = ev.pageY;
        loc.clientX = ev.clientX;
        loc.clientY = ev.clientY;
        setTimeout(ngetPreview.bind(undefined, ev), Settings.delay);
    }

    function getTemplateParamValueFromNode(
        templateNode: Element,
        paramName: string,
        caseSensitive: boolean
    ): string {
        const parts = templateNode.getElementsByTagName('part');
        for (let j = 0; j < parts.length; j++) {
            const nmNode = parts[j].getElementsByTagName('name')[0];
            const valNode = parts[j].getElementsByTagName('value')[0];
            let nm = nmNode ? nmNode.textContent || '' : '';
            if (!nm) continue;
            nm = nm.trim();
            if (
                (caseSensitive && nm === paramName) ||
                (!caseSensitive && nm.toLowerCase() === String(paramName).toLowerCase())
            ) {
                return valNode ? valNode.textContent || '' : '';
            }
        }
        return '';
    }

    function normalizeFileTitle(raw: string): string | false {
        if (!raw) return false;
        let v = String(raw).replace(/<!--[\s\S]*?-->/g, '').trim();
        const m = v.match(/\[\[\s*(?:file|image)\s*:\s*([^\|\]\n\r]+)(?:[^\]]*)\]\]/i);
        if (m && m[1]) {
            v = m[1].trim();
        } else {
            v = v.replace(/^(?:file|image)\s*:\s*/i, '').trim();
            const m2 = v.match(/^\[\[\s*([^\|\]\n\r]+)(?:[^\]]*)\]\]$/);
            if (m2 && m2[1]) v = m2[1].trim();
        }
        v = v
            .replace(/^[\|\{\}\[\]]+/, '')
            .replace(/[\{\}\[\]]+$/, '')
            .replace(/\s+/g, ' ')
            .trim();
        return v || false;
    }

    function extractTemplateImageFromParsetree(ptXml: string): string | false {
        if (!ptXml || !window.DOMParser) return false;
        let xmlDoc: Document;
        try {
            xmlDoc = new window.DOMParser().parseFromString(ptXml, 'text/xml');
        } catch (e) {
            return false;
        }
        if (!xmlDoc) return false;

        const templates = xmlDoc.getElementsByTagName('template');
        let ugCandidate: string | false = false;
        let genericCandidate: string | false = false;
        const genericParamNames = [
            'image',
            'Image',
            'headerimage',
            'header image',
            'photo',
            'Photo',
            'portrait',
            'Portrait',
            'cover',
            'Cover',
            'mainimage',
            'main image',
            'logo',
            'Logo',
            'picture',
            'Picture'
        ];

        for (let i = 0; i < templates.length; i++) {
            const t = templates[i];
            const titleNode = t.getElementsByTagName('title')[0];
            let tname = titleNode ? (titleNode.textContent || '').trim() : '';
            if (!tname) continue;
            tname = tname.replace(/^\s*Template\s*:\s*/i, '').trim();
            const lname = tname.toLowerCase();

            if (lname === 'utaite') {
                const v = getTemplateParamValueFromNode(t, 'image', false);
                const norm = normalizeFileTitle(v);
                if (norm) return norm;
            } else if (lname === 'utaiteunit' || lname === 'utaitegroup') {
                if (!ugCandidate) {
                    const vU =
                        getTemplateParamValueFromNode(t, 'Image', true) ||
                        getTemplateParamValueFromNode(t, 'image', false);
                    const normU = normalizeFileTitle(vU);
                    if (normU) ugCandidate = normU;
                }
            }

            if (!genericCandidate && /\b(infobox|portable|utaite)\b/.test(lname)) {
                for (let gp = 0; gp < genericParamNames.length; gp++) {
                    const gv = getTemplateParamValueFromNode(t, genericParamNames[gp], false);
                    const gn = normalizeFileTitle(gv);
                    if (gn) {
                        genericCandidate = gn;
                        break;
                    }
                }
            }
        }
        return ugCandidate || genericCandidate || false;
    }

    function hlpPreview(
        uri: ParsedUri,
        div: JQuery<HTMLElement>,
        img: string | false,
        force: boolean
    ): void {
        const im = $('img', div);

        if (!img) {
            im.remove();

            const msg = $('<div>', {
                class: 'npage-preview-message',
                text: 'Preview currently unavailable for this page.'
            });
            msg.css({
                padding: '0.5em 0.8em',
                fontStyle: 'italic',
                color: '#ccc',
                textAlign: 'center'
            });
            div.prepend(msg);
        } else {
            im.attr('src', img);
        }

        const d: CacheEntry = { href: uri.truepath, data: div, uri: uri };
        ncache.push(d);
        if (Settings.debug && window.pPreview) {
            (window.pPreview as PPreviewSettings).pdiv = d.data;
        }
        nshowPreview(d.data, d.uri!, force);
        pp.stop(d.href);
    }

    function ngetPreview(
        ev: JQuery.MouseEnterEvent,
        forcepath?: string,
        withD?: boolean
    ): void {
        const nuri = createUri($(ev.currentTarget).attr('href') || '') || {} as Partial<ParsedUri>;
        (nuri as ParsedUri).truepath = forcepath || nuri.truepath || '';
        if (!nuri || !nuri.truepath) return;
        if (!pp.start(nuri.truepath)) return;
        if (!forcepath && !withD && nuri.truepath !== currentEl.href) {
            pp.stop(nuri.truepath);
            return;
        }

        const ndata = ncacheOf(nuri.truepath);
        if (ndata) {
            nshowPreview(ndata.data, nuri as ParsedUri, !!forcepath);
            pp.stop(nuri.truepath);
            return;
        }

        const iwrap = $('<img>', { src: Settings.defimage });
        const twrap = $('<div>');
        const div = $('<div>', { class: 'npage-preview' });

        const apiPath = nuri.interwiki + mwc.wgScriptPath + '/api.php';

        const apipage = new URL(apiPath, location.href);
        apipage.searchParams.set('action', 'parse');
        apipage.searchParams.set('page', nuri.truepath);
        apipage.searchParams.set('prop', 'images|text|parsetree');
        apipage.searchParams.set('format', 'json');
        apipage.searchParams.set('redirects', '');
        apipage.searchParams.set('smaxage', '600');
        apipage.searchParams.set('maxage', '600');
        if (!Settings.wholepage) apipage.searchParams.set('section', '0');
        log('gp apip: ', apipage.toString());

        $.getJSON(apipage.toString())
            .done(function (data: ParseResponse) {
                if (!data.parse) {
                    Settings.RegExp.ilinks.push(nuri.truepath!);
                    pp.stop(nuri.truepath!);
                    return;
                }

                const pt = data.parse.parsetree
                    ? typeof data.parse.parsetree === 'string'
                        ? data.parse.parsetree
                        : data.parse.parsetree['*'] || ''
                    : '';
                let tplImg: string | false = pt ? extractTemplateImageFromParsetree(pt) : false;
                if (tplImg && nignoreImage(tplImg)) tplImg = false;

                let text = data.parse.text
                    ? typeof data.parse.text === 'string'
                        ? data.parse.text
                        : data.parse.text['*'] || ''
                    : '';
                if (!text && !tplImg && (!data.parse.images || !data.parse.images.length)) {
                    pp.stop(nuri.truepath!);
                    return;
                }

                let suppressImage = false;
                try {
                    const $frag = $('<div>').html(text);
                    if ($frag.find('.no-image-on-preview').length) {
                        suppressImage = true;
                    }
                } catch (e) {
                    suppressImage = false;
                }

                text = preprocess(text);
                text = $('<div>').html(text).text();
                text = text ? text.replace(Settings.RegExp.dtag, '') : '';
                if (text.length > Settings.tlen) text = text.substr(0, Settings.tlen).trim() + '…';
                if (text.length > 0) {
                    twrap.text(text);
                    div.append(twrap);
                }
                div.prepend(iwrap);

                const candidates: string[] = [];
                if (tplImg) candidates.push(tplImg);

                const finishWithCandidates = function (): void {
                    if (suppressImage) {
                        hlpPreview(nuri as ParsedUri, div, false, !!forcepath);
                        return;
                    }

                    const parseImgs = (data.parse!.images || []).filter(function (v: string) {
                        return !nignoreImage(v);
                    });
                    parseImgs.forEach(function (name: string) {
                        name = String(name || '')
                            .replace(/^\s*(?:file|image)\s*:\s*/i, '')
                            .trim();
                        if (name) candidates.push(name);
                    });

                    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));

                    if (uniqueCandidates.length) {
                        pickBestImageCandidate(uniqueCandidates, apiPath)
                            .done(function (bestUrl: string | null) {
                                hlpPreview(nuri as ParsedUri, div, bestUrl || false, !!forcepath);
                            })
                            .fail(function () {
                                hlpPreview(nuri as ParsedUri, div, false, !!forcepath);
                            });
                    } else {
                        hlpPreview(nuri as ParsedUri, div, false, !!forcepath);
                    }
                };

                if (!tplImg) {
                    tryPageImages(apiPath, nuri.truepath!)
                        .done(function (pi: PageImagesResult | null) {
                            if (suppressImage) {
                                hlpPreview(nuri as ParsedUri, div, false, !!forcepath);
                                return;
                            }

                            if (pi && pi.type === 'url' && pi.url) {
                                hlpPreview(nuri as ParsedUri, div, pi.url, !!forcepath);
                            } else {
                                if (pi && pi.type === 'file' && pi.name) {
                                    candidates.push(pi.name);
                                }
                                finishWithCandidates();
                            }
                        })
                        .fail(function () {
                            finishWithCandidates();
                        });
                } else {
                    finishWithCandidates();
                }
            })
            .fail(function () {
                pp.stop(nuri.truepath!);
            });
    }

    function tryPageImages(
        apiPath: string,
        pageTitle: string
    ): JQuery.Promise<PageImagesResult | null> {
        const d = $.Deferred<PageImagesResult | null>();
        const api = new URL(apiPath, location.href);
        api.searchParams.set('action', 'query');
        api.searchParams.set('format', 'json');
        api.searchParams.set('prop', 'pageimages');
        api.searchParams.set('piprop', 'thumbnail|name');
        api.searchParams.set('pithumbsize', String(Settings.thumbwidth));
        api.searchParams.set('redirects', '');
        api.searchParams.set('titles', pageTitle);
        log('gp pageimages: ', api.toString());

        $.getJSON(api.toString())
            .done(function (res: QueryResponse) {
                try {
                    const pages = res && res.query && res.query.pages;
                    if (!pages) {
                        d.resolve(null);
                        return;
                    }
                    const pid = Object.keys(pages)[0];
                    const pg = pages[pid];
                    if (!pg) {
                        d.resolve(null);
                        return;
                    }
                    const name = pg.pageimage || '';
                    const thumb = pg.thumbnail && pg.thumbnail.source;
                    if (name) {
                        d.resolve({ type: 'file', name: name });
                    } else if (thumb) {
                        d.resolve({ type: 'url', url: thumb });
                    } else {
                        d.resolve(null);
                    }
                } catch (e) {
                    d.resolve(null);
                }
            })
            .fail(function () {
                d.resolve(null);
            });

        return d.promise();
    }

    function pickBestImageCandidate(
        names: string[],
        apiPath: string
    ): JQuery.Promise<string | null> {
        const d = $.Deferred<string | null>();
        if (!names || !names.length) {
            d.resolve(null);
            return d.promise();
        }

        const uniqueNames = Array.from(
            new Set(
                names
                    .map(function (n) {
                        return String(n || '')
                            .replace(/^\s*(?:file|image)\s*:\s*/i, '')
                            .trim();
                    })
                    .filter(Boolean)
            )
        );

        if (!uniqueNames.length) {
            d.resolve(null);
            return d.promise();
        }

        const apiimage = new URL(apiPath, location.href);
        apiimage.searchParams.set('action', 'query');
        apiimage.searchParams.set('redirects', '');
        apiimage.searchParams.set('prop', 'imageinfo');
        apiimage.searchParams.set('iiprop', 'url|size|mime|mediatype');
        apiimage.searchParams.set('format', 'json');
        apiimage.searchParams.set('iiurlwidth', String(Settings.thumbwidth));
        apiimage.searchParams.set(
            'titles',
            uniqueNames
                .map(function (n) {
                    return 'File:' + n;
                })
                .join('|')
        );
        log('gp apii (multi): ', apiimage.toString());

        $.getJSON(apiimage.toString())
            .done(function (imgData: QueryResponse) {
                const pages = (imgData && imgData.query && imgData.query.pages) || {};
                let bestUrl: string | false = false;
                let bestArea = 0;

                $.each(pages, function (_, pg) {
                    if (!pg || pg.missing === '' || pg.invalid === '') return;
                    const ii = (pg.imageinfo || [])[0];
                    if (!ii) return;
                    const title = (pg.title || '').replace(/^File:/i, '').trim();
                    if (!title || nignoreImage(title)) return;

                    const w = ii.width || 0;
                    const h = ii.height || 0;
                    if (w < Settings.minImageWidth || h < Settings.minImageHeight) return;

                    const mediatype = (ii.mediatype || '').toLowerCase();
                    const mime = (ii.mime || '').toLowerCase();
                    const isRaster =
                        mediatype === 'bitmap' || /^(image\/(jpeg|jpg|png|gif|webp))$/.test(mime);

                    const area = w * h + (isRaster ? 1000000 : 0);
                    const url = ii.thumburl || ii.url;
                    if (area > bestArea && url) {
                        bestArea = area;
                        bestUrl = url;
                    }
                });

                d.resolve(bestUrl || null);
            })
            .fail(function () {
                d.resolve(null);
            });

        return d.promise();
    }

    function nshowPreview(
        data: JQuery<HTMLElement>,
        target: ParsedUri,
        force: boolean
    ): void {
        if (!force && currentEl.href !== target.truepath) return;
        $('.npage-preview').remove();
        $('body').append($(data));
        $(data).css('left', -10000).css('top', -10000);
        $(data).show(200, function () {
            const $this = $(this);
            const thisHeight = $this.height() || 0;
            const thisWidth = $this.width() || 0;
            const windowHeight = $(window).height() || 0;
            const windowWidth = $(window).width() || 0;

            if (loc.clientY + thisHeight > windowHeight) {
                loc.top -= thisHeight + loc.tops;
            } else {
                loc.top += loc.tops;
            }
            if (loc.clientX + thisWidth > windowWidth) {
                loc.left -= thisWidth + loc.lefts;
            } else {
                loc.left += loc.lefts;
            }
            loc.left = loc.left > 0 ? loc.left : 0;
            loc.top = loc.top > 0 ? loc.top : 0;

            const leftVal = force ? ($('body').scrollLeft() || 0) : loc.left;
            const topVal = force ? ($('body').scrollTop() || 0) : loc.top;
            $this.css('left', leftVal).css('top', topVal);

            mw.hook('ppreview.show').fire(data);
        });
    }

    function nhidePreview(): void {
        currentEl.href = '';
        $('.npage-preview').remove();
        hlpaHover();
    }

    function nignoreImage(name: string): boolean {
        return Settings.RegExp.iimages.some(function (rule) {
            return rule instanceof RegExp ? rule.test(name) : rule === name;
        });
    }

    function nignorePage(name: string): boolean {
        return Settings.RegExp.ipages.some(function (rule) {
            return rule instanceof RegExp ? rule.test(name) : rule === name;
        });
    }

    function nignoreLink(name: string): boolean {
        return Settings.RegExp.ilinks.some(function (rule) {
            return rule instanceof RegExp ? rule.test(name) : rule === name;
        });
    }

    function ncacheOf(href: string): CacheEntry | null {
        if (ncache.length > Settings.csize) ncache.length = 0;
        for (let i = 0; i < ncache.length; i++) {
            if (ncache[i].href === href) return ncache[i];
        }
        return null;
    }
};

// Execute the wrapper
wrapper(jQuery);