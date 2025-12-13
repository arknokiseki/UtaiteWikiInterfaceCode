/**
 * Global MediaWiki & jQuery Definitions
 */
declare const mw: any;
declare const $: any;

// Interface for a single collected image item
interface LightboxItem {
    $a: any; // JQuery<HTMLAnchorElement>
    $img: any; // JQuery<HTMLImageElement>
    fileTitle: string | null;
    filePage: string;
    originalUrl: string;
    displayUrl: string;
    thumbUrl: string;
    width: number | null;
    height: number | null;
    caption: string;
    index: number;
}

// Interface for the central state object
interface LightboxState {
    isOpen: boolean;
    items: LightboxItem[];
    index: number;
    
    // UI References (JQuery objects)
    $overlay: any | null;
    $img: any | null;
    $spinner: any | null;
    $title: any | null;
    $caption: any | null;
    $counter: any | null;
    $btnPrev: any | null;
    $btnNext: any | null;
    $btnClose: any | null;
    $linkMore: any | null;
    $linkOriginal: any | null;
    lastActive: HTMLElement | null;

    // Carousel References
    $carousel: any | null;
    $thumbsViewport: any | null;
    $thumbsTrack: any | null;
    $thumbPrev: any | null;
    $thumbNext: any | null;

    // Config
    useFA: boolean;
    faEnabled: boolean | null;
    boundCapture: boolean;
    debug: boolean;
}

(function(mw, $) {
    'use strict';

    // 1. Guard Clauses: Mobile & Dependencies
    if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
        return;
    }

    if (!mw || !mw.util || !$) return;

    // 2. State Initialization
    const LB: LightboxState = {
        isOpen: false,
        items: [],
        index: -1,
        
        $overlay: null,
        $img: null,
        $spinner: null,
        $title: null,
        $caption: null,
        $counter: null,
        $btnPrev: null,
        $btnNext: null,
        $btnClose: null,
        $linkMore: null,
        $linkOriginal: null,
        lastActive: null,

        $carousel: null,
        $thumbsViewport: null,
        $thumbsTrack: null,
        $thumbPrev: null,
        $thumbNext: null,

        useFA: true,
        faEnabled: null,
        boundCapture: false,
        debug: true
    };

    // -------------------------------------------------------------------------
    // Utility Functions
    // -------------------------------------------------------------------------

    /**
     * Parses File: title from various URL formats (Wiki, CDN thumb, CDN original, REST)
     */
    function extractFileTitle(url: string | undefined | null): string | null {
        if (!url) return null;
        try {
            const u = decodeURIComponent(url.split('#')[0]);
            
            // 1) Normal wiki links
            let m = u.match(/(?:\/wiki\/|[?&]title=)File:([^?#]+)/i);
            if (m && m[1]) return m[1].replace(/_/g, ' ');

            // 2) REST-style
            m = u.match(/\/File:([^/?#]+)/i);
            if (m && m[1]) return m[1].replace(/_/g, ' ');

            // 3) Upload CDN thumbs
            m = u.match(/\/thumb\/[^/]+\/[^/]+\/([^/]+)/i);
            if (m && m[1]) return m[1].replace(/_/g, ' ');

            // 4) Upload CDN originals
            m = u.match(/\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)$/i);
            if (m && m[1]) return m[1].replace(/_/g, ' ');

        } catch (e) {
            console.error('Error extracting file title', e);
        }
        return null;
    }

    /**
     * Finds the caption from figcaption, gallerytext, alt, or title attributes.
     */
    function getCaption($a: any, $img: any): string {
        const $fig = $img.closest('figure, .thumb, .tfigure, .gallerybox');
        if ($fig.length) {
            const $cap = $fig.find('figcaption, .thumbcaption, .gallerytext').first();
            if ($cap.length) {
                const txt = $.trim($cap.text());
                if (txt) return txt;
            }
        }
        const alt = $.trim($img.attr('alt') || '');
        if (alt) return alt;
        const t = $.trim($a.attr('title') || '');
        if (t) return t;
        return '';
    }

    /**
     * converts thumbnail URL to original/latest revision URL
     */
    function thumbToOriginal(url: string): string {
        if (!url) return url;
        try {
            const q = url.split('?')[0];

            // For thumbnail URLs
            if (q.indexOf('/thumb/') !== -1) {
                const m = q.match(/\/thumb\/[^/]+\/[^/]+\/([^/]+)/);
                if (m && m[1]) {
                    // Use Special:Redirect for reliability
                    return '/wiki/Special:Redirect/file/' + encodeURIComponent(m[1]);
                }
                // Fallback regex
                return q.replace(/\/thumb\/([^/]+\/[^/]+)\/([^/]+)\/[^/]+$/, '/$1/$2');
            }

            // For scale-to-width URLs
            if (/\/revision\/latest\/scale-to-width-down\/\d+/.test(q)) {
                return q.replace(/\/revision\/latest\/scale-to-width-down\/\d+.*$/, '/revision/latest');
            }
        } catch (e) {}
        return url;
    }

    /**
     * Parses `srcset` to find the largest available image version.
     */
    function largestFromImg($img: any): string {
        const srcset = $img.attr('srcset');
        if (srcset) {
            let best: string | null = null;
            let bestW = 0;
            let bestX = 0;
            const parts = srcset.split(',');
            
            for (let i = 0; i < parts.length; i++) {
                const p = $.trim(parts[i]).split(/\s+/);
                const u = p[0];
                const d = p[1] || '';
                if (!u) continue;
                
                let w = 0;
                let x = 0;
                const mW = d.match(/(\d+)w/);
                const mX = d.match(/([\d.]+)x/);
                
                if (mW) w = parseInt(mW[1], 10);
                if (mX) x = parseFloat(mX[1]);
                
                if (w && w > bestW) {
                    bestW = w;
                    best = u;
                } else if (!w && x && x > bestX) {
                    bestX = x;
                    best = u;
                }
            }
            if (best) return best;
        }
        return $img.attr('src') || '';
    }

    /**
     * Constructs a LightboxItem from an anchor element containing an image.
     */
    function buildItem($a: any): LightboxItem | null {
        const $img = $a.find('img.mw-file-element, img').first();
        if (!$img.length) return null;

        const rawThumbUrl = $img.attr('data-src') || $img.attr('src') || largestFromImg($img) || '';
        let originalUrl = thumbToOriginal(rawThumbUrl) || rawThumbUrl;

        const fileTitle =
            extractFileTitle($a.attr('href')) ||
            ($img.attr('data-file-name') || null) ||
            extractFileTitle(originalUrl) ||
            extractFileTitle(rawThumbUrl) ||
            '';

        if (fileTitle) {
            originalUrl = mw.util.getUrl('Special:Redirect/file/' + fileTitle.replace(/ /g, '_'));
        }

        const filePage = fileTitle ?
            mw.util.getUrl('File:' + fileTitle.replace(/ /g, '_')) :
            ($a.attr('href') || '');

        const width = parseInt($img.attr('data-file-width'), 10) || null;
        const height = parseInt($img.attr('data-file-height'), 10) || null;
        const caption = getCaption($a, $img);

        return {
            $a: $a,
            $img: $img,
            fileTitle: fileTitle,
            filePage: filePage,
            originalUrl: originalUrl,
            displayUrl: originalUrl,
            thumbUrl: rawThumbUrl,
            width: width,
            height: height,
            caption: caption,
            index: -1 // Set later
        };
    }

    /**
     * Scans the scope for valid image links and dedupes them.
     */
    function collectItems($scope: any): LightboxItem[] {
        const items: LightboxItem[] = [];
        const seen: HTMLElement[] = [];
        const seenFiles: { [key: string]: boolean } = {};

        const sel =
            'a.mw-file-description, ' +
            'a.image, ' +
            '.image > a, ' +
            'a[href^="/wiki/File:"], ' +
            'a[href*="title=File:"], ' +
            'figure a.mw-file-description, ' +
            '.gallerybox .thumb a';

        $scope.find(sel).each(function(this: HTMLElement) {
            if (seen.indexOf(this) !== -1) return;
            seen.push(this);

            const $a = $(this);

            if (!$a.find('img.mw-file-element, img').length && !$a.closest('span[typeof="mw:File"]').length) {
                return;
            }

            const item = buildItem($a);
            // Validation & Deduplication
            if (item && item.fileTitle) {
                const normalizedTitle = item.fileTitle.trim().toLowerCase().replace(/\s+/g, ' ');

                if (seenFiles[normalizedTitle]) {
                    return; 
                }
                seenFiles[normalizedTitle] = true;

                item.index = items.length;
                $a.attr('data-mhlb-index', item.index)
                  .attr('data-mhlb-ready', '1');
                items.push(item);
            }
        });
        return items;
    }

    // -------------------------------------------------------------------------
    // Icon & UI Helpers
    // -------------------------------------------------------------------------

    function isFALoaded(): boolean {
        try {
            const test = document.createElement('i');
            test.className = 'fa-solid fa-xmark';
            test.style.position = 'absolute';
            test.style.left = '-9999px';
            document.body.appendChild(test);

            const content = window
                .getComputedStyle(test, '::before')
                .getPropertyValue('content');

            document.body.removeChild(test);

            return !!content &&
                content !== 'none' &&
                content !== 'normal' &&
                content !== '""';
        } catch (e) {
            return false;
        }
    }

    function faIcon(name: string) {
        const map: { [key: string]: string } = {
            close: 'fa-xmark',
            'chevron-left': 'fa-chevron-left',
            'chevron-right': 'fa-chevron-right',
            share: 'fa-share-nodes',
            question: 'fa-circle-question',
            external: 'fa-up-right-from-square'
        };
        const cls = map[name] || 'fa-circle';
        return $('<i class="fa-solid ' + cls + '" aria-hidden="true"></i>');
    }

    function svgIcon(name: string) {
        let path = '';
        switch (name) {
            case 'close':
                path = '<path d="M6 6 L18 18 M6 18 L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
                break;
            case 'chevron-left':
                path = '<path d="M14 6 L8 12 L14 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>';
                break;
            case 'chevron-right':
                path = '<path d="M10 6 L16 12 L10 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>';
                break;
            case 'share':
                path = '<path d="M16 8a3 3 0 1 0-2.83-4H13a3 3 0 1 0 0 6h.17A3 3 0 0 0 16 8Zm-8 4a3 3 0 1 0-2.83-4H5a3 3 0 1 0 0 6h.17A3 3 0 0 0 8 12Zm8 4a3 3 0 1 0-2.83 4H13a3 3 0 1 0 0-6h.17A3 3 0 0 0 16 16ZM8 12l4-2m-4 2l4 2m0-6l4-2m-4 2l4 2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
                break;
            case 'question':
                path = '<path d="M9 9a3 3 0 1 1 3 3v1m0 3h.01" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
                break;
            case 'external':
                path = '<path d="M14 3h7v7m-1-6-9 9M21 14v5a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
                break;
        }
        return $('<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + '</svg>');
    }

    function icon(name: string) {
        if (LB.faEnabled === null) {
            LB.faEnabled = LB.useFA && isFALoaded();
        }
        return LB.faEnabled ? faIcon(name) : svgIcon(name);
    }

    function logCollected(context: string, items: LightboxItem[]) {
        if (!LB.debug || typeof console === 'undefined') return;
        const groups = (mw && mw.config && typeof mw.config.get === 'function') ? (mw.config.get('wgUserGroups') || []) : [];
        if (groups.indexOf('interface-admin') === -1) return;

        try {
            const rows = items.map((item, i) => ({
                index: i,
                title: item.fileTitle || '',
                caption: (item.caption || '').slice(0, 80),
                href: item.filePage || '',
                thumb: item.thumbUrl || '',
                original: item.originalUrl || ''
            }));
            
            if (console.groupCollapsed) console.groupCollapsed(`[mhlb] ${context} — ${items.length} item(s)`);
            if (console.table) console.table(rows);
            else console.log(rows);
            if (console.groupEnd) console.groupEnd();
        } catch (err) {
            console.log(`[mhlb] ${context}`, items);
        }
    }

    // -------------------------------------------------------------------------
    // DOM & Render Logic
    // -------------------------------------------------------------------------

    function buildOverlay(): void {
        if (LB.$overlay) return;

        const $ov = $('<div class="mhlb-overlay" role="dialog" aria-modal="true" aria-label="Image lightbox" tabindex="-1"></div>');
        const $sh = $('<div class="mhlb-shell"></div>');

        // Header
        const $head = $('<div class="mhlb-header"></div>');
        const $headLeft = $('<div class="mhlb-head-left"></div>');
        const $headRight = $('<div class="mhlb-head-right"></div>');

        const $title = $('<div class="mhlb-title" aria-live="polite"></div>');
        const $close = $('<button type="button" class="mhlb-btn mhlb-close" aria-label="Close"></button>')
            .append(icon('close'));

        const $actions = $('<div class="mhlb-actions"></div>');
        const $more = $('<a class="mhlb-btn" target="_blank" rel="noopener" href="#"><span>More info</span></a>')
            .prepend(icon('question'));
        const $orig = $('<a class="mhlb-btn" target="_blank" rel="noopener" href="#"><span>Open original</span></a>')
            .prepend(icon('external'));
        const $share = $('<button type="button" class="mhlb-btn"><span>Share</span></button>')
            .prepend(icon('share'));

        $actions.append($more, $orig, $share);
        $headLeft.append($title);
        $headRight.append($actions, $close);
        $head.append($headLeft, $headRight);

        // Stage
        const $stage = $('<div class="mhlb-stage"></div>');
        const $img = $('<img class="mhlb-img" alt="">');
        const $spinner = $('<div class="mhlb-spinner" aria-hidden="true"></div>');
        const $btnPrev = $('<button type="button" class="mhlb-arrow left" aria-label="Previous"></button>').append(icon('chevron-left'));
        const $btnNext = $('<button type="button" class="mhlb-arrow right" aria-label="Next"></button>').append(icon('chevron-right'));

        $stage.append($img, $spinner, $btnPrev, $btnNext);

        // Carousel
        const $carousel = $('<div class="mhlb-carousel" aria-label="Thumbnails"></div>');
        const $thumbsViewport = $('<div class="mhlb-thumbs-viewport"></div>');
        const $thumbsTrack = $('<ul class="mhlb-thumbs-track" role="list"></ul>');
        const $thumbPrev = $('<button type="button" class="mhlb-arrow thumb left" aria-label="Scroll thumbnails left"></button>').append(icon('chevron-left'));
        const $thumbNext = $('<button type="button" class="mhlb-arrow thumb right" aria-label="Scroll thumbnails right"></button>').append(icon('chevron-right'));

        $thumbsViewport.append($thumbsTrack);
        $carousel.append($thumbsViewport, $thumbPrev, $thumbNext);

        // Footer
        const $foot = $('<div class="mhlb-footer"></div>');
        const $caption = $('<div class="mhlb-caption" aria-live="polite"></div>');
        const $counter = $('<div class="mhlb-counter"></div>');
        $foot.append($caption, $counter);

        $sh.append($head, $stage, $carousel, $foot);
        $ov.append($sh);
        $('body').append($ov);

        // Save refs
        LB.$overlay = $ov;
        LB.$img = $img;
        LB.$spinner = $spinner;
        LB.$title = $title;
        LB.$caption = $caption;
        LB.$counter = $counter;
        LB.$btnPrev = $btnPrev;
        LB.$btnNext = $btnNext;
        LB.$btnClose = $close;
        LB.$linkMore = $more;
        LB.$linkOriginal = $orig;

        LB.$carousel = $carousel;
        LB.$thumbsViewport = $thumbsViewport;
        LB.$thumbsTrack = $thumbsTrack;
        LB.$thumbPrev = $thumbPrev;
        LB.$thumbNext = $thumbNext;

        // Events
        $btnPrev.on('click', () => navigate(-1));
        $btnNext.on('click', () => navigate(1));
        $close.on('click', () => close());

        // Click outside closes
        $ov.on('mousedown', (e: MouseEvent) => {
            if ($(e.target).closest('.mhlb-shell').length === 0) {
                close();
            }
        });

        // Share
        $share.on('click', () => {
            if (!LB.items.length || LB.index < 0) return;
            const url = LB.items[LB.index].filePage || LB.items[LB.index].originalUrl || location.href;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(() => flash($share, 'Copied!'), () => legacyCopy(url, $share));
            } else {
                legacyCopy(url, $share);
            }
        });

        // Keyboard
        $(document).on('keydown.mhlb', (e: any) => {
            if (!LB.isOpen) return;
            const key = e.which || e.keyCode;
            const target = e.target as HTMLElement;
            const targetTag = (target.tagName || '').toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea') return;

            if (key === 27) {
                e.preventDefault();
                close();
            } else if (key === 37) {
                e.preventDefault();
                navigate(-1);
            } else if (key === 39) {
                e.preventDefault();
                navigate(1);
            } else if (key === 13 && $(e.target).is(LB.$overlay)) {
                e.preventDefault();
                navigate(1);
            }
        });

        // Simple swipe (mobile)
        (function enableSwipe() {
            let x0: number | null = null;
            let t0 = 0;

            $stage.on('touchstart', (e: any) => {
                const oe = e.originalEvent || e;
                const t = oe.touches[0];
                x0 = t.clientX;
                t0 = Date.now();
            });

            $stage.on('touchend', (e: any) => {
                if (x0 === null) return;
                const dt = Date.now() - t0;
                const oe = e.originalEvent || e;
                const t = oe.changedTouches[0];
                const dx = t.clientX - x0;
                const abs = Math.abs(dx);
                x0 = null;
                if (dt < 500 && abs > 40) {
                    if (dx < 0) navigate(1);
                    else navigate(-1);
                }
            });
        }());

        // Carousel scrolling
        function scrollThumbs(dir: number) {
            const step = Math.round(LB.$thumbsViewport.innerWidth() * 0.8);
            const target = Math.max(0, LB.$thumbsViewport.scrollLeft() + (dir < 0 ? -step : step));
            LB.$thumbsViewport.stop().animate({
                scrollLeft: target
            }, 180, updateCarouselArrows);
        }
        $thumbPrev.on('click', () => scrollThumbs(-1));
        $thumbNext.on('click', () => scrollThumbs(1));
        LB.$thumbsViewport.on('scroll', updateCarouselArrows);
        $(window).on('resize.mhlb', updateCarouselArrows);
    }

    function flash($btn: any, text: string) {
        const $t = $('<span style="margin-left:6px;opacity:.9;">' + text + '</span>');
        $btn.append($t);
        setTimeout(() => {
            $t.fadeOut(300, () => $t.remove());
        }, 800);
    }

    function legacyCopy(text: string, $btn: any) {
        const $ta = $('<textarea readonly style="position:fixed;left:-9999px;top:-9999px;"></textarea>');
        $ta.val(text);
        $('body').append($ta);
        $ta[0].select();
        try {
            document.execCommand('copy');
        } catch (e) {}
        $ta.remove();
        flash($btn, 'Copied!');
    }

    function openAt(index: number) {
        if (!LB.items.length) return;

        buildOverlay();

        LB.index = Math.max(0, Math.min(index, LB.items.length - 1));
        LB.isOpen = true;

        LB.lastActive = document.activeElement as HTMLElement;
        $('body').addClass('mhlb-open');

        LB.$overlay.show().focus();

        buildCarousel();
        render();
    }

    function close() {
        if (!LB.isOpen) return;
        LB.isOpen = false;
        $('body').removeClass('mhlb-open');
        if (LB.$overlay) LB.$overlay.hide();
        if (LB.lastActive && LB.lastActive.focus) {
            try {
                LB.lastActive.focus();
            } catch (e) {}
        }
    }

    function navigate(delta: number) {
        if (!LB.items.length) return;
        const next = LB.index + delta;
        if (next < 0 || next >= LB.items.length) return;
        LB.index = next;
        render();
    }

    function preloadNeighbor(idx: number) {
        const i = LB.items[idx];
        if (!i) return;
        const img = new Image();
        img.src = i.displayUrl || i.originalUrl;
    }

    function updateCarouselArrows() {
        if (!LB.$thumbsViewport || !LB.$thumbsTrack) return;
        const el = LB.$thumbsViewport[0];
        const max = Math.max(0, el.scrollWidth - el.clientWidth);
        const sl = LB.$thumbsViewport.scrollLeft();
        LB.$thumbPrev.prop('disabled', sl <= 2);
        LB.$thumbNext.prop('disabled', sl >= max - 2);
    }

    function buildCarousel() {
        if (!LB.$thumbsTrack) return;
        LB.$thumbsTrack.empty();

        LB.items.forEach((it, i) => {
            const label = it.caption || it.fileTitle || ('Image ' + (i + 1));
            const $btn = $('<button type="button" class="mhlb-thumb-btn" aria-label="' + label.replace(/"/g, '&quot;') + '"></button>')
                .attr('data-idx', i);
            const src = it.thumbUrl || it.displayUrl || it.originalUrl;
            const $im = $('<img class="mhlb-thumb" alt="">').attr('src', src);
            $btn.append($im);
            const $li = $('<li role="listitem"></li>').append($btn);
            LB.$thumbsTrack.append($li);
        });

        // Delegate click
        LB.$thumbsTrack.off('click.mhlb').on('click.mhlb', '.mhlb-thumb-btn', function(this: HTMLElement) {
            const idx = parseInt($(this).attr('data-idx') || '', 10);
            if (!isNaN(idx)) {
                LB.index = idx;
                render();
            }
        });

        // Hide strip if only one image
        if (LB.items.length <= 1) {
            LB.$carousel.hide();
        } else {
            LB.$carousel.show();
        }

        LB.$thumbsViewport.scrollLeft(0);
        updateCarouselArrows();
        markActiveThumb();
    }

    function markActiveThumb() {
        if (!LB.$thumbsTrack) return;
        LB.$thumbsTrack.find('.mhlb-thumb-btn').removeClass('is-active').attr('aria-current', 'false');
        const $btn = LB.$thumbsTrack.find('.mhlb-thumb-btn[data-idx="' + LB.index + '"]');
        $btn.addClass('is-active').attr('aria-current', 'true');
    }

    function ensureThumbVisible() {
        if (!LB.$thumbsViewport || !LB.$thumbsTrack) return;
        const $btn = LB.$thumbsTrack.find('.mhlb-thumb-btn[data-idx="' + LB.index + '"]');
        if (!$btn.length) return;

        const wrap = LB.$thumbsViewport;
        const curLeft = wrap.scrollLeft();
        const wrapLeft = wrap.offset().left;
        const btnLeft = $btn.offset().left;
        const btnWidth = $btn.outerWidth(true);
        const viewWidth = wrap.innerWidth();

        const leftInView = btnLeft - wrapLeft;
        const rightInView = leftInView + btnWidth;

        let target = curLeft;
        if (leftInView < 0) {
            target = curLeft + leftInView - 10;
        } else if (rightInView > viewWidth) {
            target = curLeft + (rightInView - viewWidth) + 10;
        }

        if (target !== curLeft) {
            wrap.stop().animate({
                scrollLeft: target
            }, 160, updateCarouselArrows);
        } else {
            updateCarouselArrows();
        }
    }

    function render() {
        const item = LB.items[LB.index];
        if (!item) return;

        // Update header/footer text
        const titleText = item.fileTitle || (item.caption || '').slice(0, 80) || 'Image';
        LB.$title.text(titleText);
        LB.$caption.text(item.caption || '');
        LB.$counter.text((LB.index + 1) + ' / ' + LB.items.length);

        // Update action links
        LB.$linkMore.attr('href', item.filePage || '#');
        LB.$linkOriginal.attr('href', item.originalUrl || item.displayUrl || '#');

        // Disable arrows if needed
        LB.$btnPrev.prop('disabled', LB.index <= 0);
        LB.$btnNext.prop('disabled', LB.index >= LB.items.length - 1);

        // Show spinner
        LB.$spinner.show();
        LB.$img.removeClass('is-ready');
        LB.$img.attr('alt', item.caption || item.fileTitle || '');

        // Load the image
        const temp = new Image();
        temp.onload = function() {
            LB.$img.attr('src', item.displayUrl || item.originalUrl || '');
            LB.$spinner.hide();
            LB.$img.addClass('is-ready');
            preloadNeighbor(LB.index + 1);
            preloadNeighbor(LB.index - 1);
        };
        temp.onerror = function() {
            LB.$spinner.hide();
            LB.$img.removeClass('is-ready');
        };
        temp.src = item.displayUrl || item.originalUrl || '';

        // Sync carousel
        markActiveThumb();
        ensureThumbVisible();
    }

    // -------------------------------------------------------------------------
    // Event Capture
    // -------------------------------------------------------------------------

    function bindCaptureInterception() {
        if (LB.boundCapture) return;
        LB.boundCapture = true;

        const handler = function(e: MouseEvent) {
            // Only plain left-clicks
            if ((typeof e.button === 'number' && e.button !== 0) ||
                e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
                return;
            }

            const $t = $(e.target);
            const $a = $t.closest('a');
            if (!$a.length) return;

            // Candidate check
            const href = $a.attr('href') || '';
            const isCandidate = $a.is('.mw-file-description, .image, .image > a, figure a.mw-file-description, .gallerybox .thumb a') ||
                href.indexOf('/wiki/File:') === 0 ||
                href.indexOf('title=File:') !== -1;
            if (!isCandidate) return;

            // Must be an image anchor
            const isImageAnchor = $a.find('img.mw-file-element, img').length > 0 || $a.closest('span[typeof="mw:File"]').length > 0;
            if (!isImageAnchor) return;

            const inContent = $a.closest('.mw-parser-output, #mw-content-text').length > 0;
            if (!inContent) return;

            // Block native navigation
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();

            // Refresh items and open
            const $content = mw.util.$content || $('.mw-parser-output, #mw-content-text').first() || $(document);
            LB.items = collectItems($content);
            logCollected('click', LB.items);

            let idx = parseInt($a.attr('data-mhlb-index') || '', 10);
            if (isNaN(idx)) {
                idx = -1;
                for (let i = 0; i < LB.items.length; i++) {
                    if (LB.items[i].$a && LB.items[i].$a[0] === $a[0]) {
                        idx = i;
                        break;
                    }
                }
                if (idx === -1) {
                    const item = buildItem($a);
                    if (item) {
                        item.index = LB.items.length;
                        LB.items.push(item);
                        idx = item.index;
                    } else {
                        return;
                    }
                }
                $a.attr('data-mhlb-index', idx).attr('data-mhlb-ready', '1');
            }
            openAt(idx);
        };

        try {
            document.addEventListener('click', handler, {
                capture: true,
                passive: false
            });
        } catch (err) {
            document.addEventListener('click', handler, true);
        }
    }

    function init($content: any) {
        $content = $content || (mw.util.$content || $(document));
        LB.items = collectItems($content);
        logCollected('init', LB.items);
        bindCaptureInterception();
    }

    // Expose dump helper
    (window as any).mhlbDump = function() {
        return (LB.items || []).map((it, i) => ({
            index: i,
            title: it.fileTitle,
            href: it.filePage,
            thumb: it.thumbUrl,
            original: it.originalUrl,
            caption: it.caption
        }));
    };

    // Run on ready and on VE / live updates
    $(function() {
        init(mw.util.$content || $(document));
    });
    mw.hook('wikipage.content').add(init);

}(mw, $));