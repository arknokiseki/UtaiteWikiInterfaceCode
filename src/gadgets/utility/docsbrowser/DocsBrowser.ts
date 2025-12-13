/**
 * Documentation Browser Gadget
 * Provides a searchable modal interface for browsing template documentation pages
 */

interface DocItem {
    title: string;
    pageid?: number;
    excerpt?: string;
    fullurl?: string;
}

interface CachedIndex {
    ts: number;
    data: DocItem[];
}

interface SearchResult {
    title: string;
    pageid: number;
}

interface ApiSearchResponse {
    query?: {
        search?: SearchResult[];
    };
    continue?: {
        sroffset: number;
    };
}

interface ApiExtractsPage {
    title: string;
    pageid: number;
    extract?: string;
    fullurl?: string;
}

interface ApiExtractsResponse {
    query?: {
        pages?: ApiExtractsPage[];
    };
}

interface ApiParseResponse {
    parse?: {
        text?: string;
    };
}

interface MwApi {
    get: (params: Record<string, unknown>) => JQuery.Promise<ApiSearchResponse | ApiExtractsResponse | ApiParseResponse>;
}

interface ModalInstance {
    open: () => void;
    close: () => void;
    element: HTMLElement;
}

declare const mw: {
    config: {
        get: (key: string) => string;
    };
    util: {
        getUrl: (title: string) => string;
    };
    html: {
        escape: (text: string) => string;
    };
    Api: new () => MwApi;
    loader: {
        using: (modules: string[], callback: () => void) => void;
    };
};

declare const mediaWiki: typeof mw;

declare global {
    interface Window {
        openDocsBrowser?: () => ModalInstance | null;
    }
}

(function (mw: typeof mediaWiki, document: Document): void {
    'use strict';

    if (
        document.body.classList.contains('mw-mf') ||
        document.body.classList.contains('is-mobile-device')
    ) {
        return;
    }

    const CACHE_KEY = 'docsIndex_v1';
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
    const BATCH_SIZE = 50; // titles per extracts request

    // Ensure ModalBuilder exists
    if (!window.ModalBuilder) {
        console.warn('ModalBuilder missing — Docs Browser gadget inert.');
        return;
    }

    window.ModalBuilder.themes.docs = { accent: '#06b6d4' };

    function isMobileViewport(): boolean {
        return !!(window.matchMedia && window.matchMedia('(max-width: 1023px)').matches);
    }

    function showMobileDisabledModal(): void {
        const message =
            'This gadget has been disabled on mobile and tablet devices to preserve performance and layout. Please open this site on a desktop to use the Documentation Browser.';
        if (window.createToolModal) {
            const modal = window.createToolModal({
                toolId: 'docs-browser-mobile-disabled',
                title: 'Unavailable Gadget',
                contentHtml: `
                    <div class="tm-section">
                        <p class="tm-section-desc" style="margin: 0;">${mw.html.escape(message)}</p>
                    </div>
                    <div class="tm-section" style="text-align: right;">
                        <button id="docs-mobile-ok" class="tm-btn tm-btn-primary">OK</button>
                    </div>
                `,
                theme: 'docs',
                onClose: function (): void {}
            });
            modal.open();
            const btn = modal.element.querySelector('#docs-mobile-ok');
            if (btn) {
                btn.addEventListener('click', function (): void {
                    modal.close();
                });
            }
            return;
        }
        alert(message);
    }

    function nowMs(): number {
        return new Date().getTime();
    }

    function getCachedIndex(): DocItem[] | null {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as CachedIndex;
            if (!parsed || !parsed.ts || !parsed.data) return null;
            if (nowMs() - parsed.ts > CACHE_TTL_MS) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            return parsed.data;
        } catch (e) {
            console.warn('Docs Browser cache parse error', e);
            try {
                localStorage.removeItem(CACHE_KEY);
            } catch (ee) {
                /* ignore */
            }
            return null;
        }
    }

    function setCachedIndex(data: DocItem[]): void {
        try {
            const payload: CachedIndex = { ts: nowMs(), data: data };
            localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('Docs Browser cache write failed', e);
        }
    }

    // API helper using the efficient list=search
    function fetchAllPagesWithDoc(onProgress?: (msg: string) => void): JQuery.Promise<DocItem[]> {
        const api = new mw.Api();
        const allMatches: SearchResult[] = [];

        function walk(sroffset?: number): JQuery.Promise<SearchResult[]> {
            const params: Record<string, unknown> = {
                action: 'query',
                list: 'search',
                srsearch: 'intitle:"/doc"',
                srnamespace: '10',
                srlimit: 'max',
                srprop: ''
            };
            if (sroffset) params.sroffset = sroffset;

            return (api.get(params) as JQuery.Promise<ApiSearchResponse>).then(function (
                res: ApiSearchResponse
            ): JQuery.Promise<SearchResult[]> | SearchResult[] {
                const pages = res.query?.search ?? [];
                pages.forEach(function (p: SearchResult): void {
                    allMatches.push({ title: p.title, pageid: p.pageid });
                });

                if (res.continue?.sroffset) {
                    if (typeof onProgress === 'function') {
                        onProgress(allMatches.length + ' found, continuing...');
                    }
                    return walk(res.continue.sroffset);
                }
                return allMatches;
            });
        }

        function fetchExtractsBatched(hits: SearchResult[]): JQuery.Promise<DocItem[]> {
            const out: DocItem[] = [];
            let i = 0;

            function nextBatch(): JQuery.Promise<DocItem[]> {
                if (i >= hits.length) {
                    return $.Deferred<DocItem[]>().resolve(out).promise();
                }
                const slice = hits.slice(i, i + BATCH_SIZE).map(function (h: SearchResult): string {
                    return h.title;
                });
                i += BATCH_SIZE;

                return (
                    api.get({
                        action: 'query',
                        prop: 'extracts|info',
                        exchars: 200,
                        explaintext: true,
                        titles: slice.join('|'),
                        inprop: 'url',
                        redirects: true,
                        formatversion: 2
                    }) as JQuery.Promise<ApiExtractsResponse>
                ).then(function (res: ApiExtractsResponse): JQuery.Promise<DocItem[]> {
                    if (res.query?.pages) {
                        res.query.pages.forEach(function (p: ApiExtractsPage): void {
                            out.push({
                                title: p.title,
                                pageid: p.pageid,
                                excerpt: p.extract || '',
                                fullurl: p.fullurl || mw.util.getUrl(p.title)
                            });
                        });
                    }
                    if (typeof onProgress === 'function') {
                        onProgress('Indexed ' + out.length + ' / ' + hits.length);
                    }
                    return nextBatch();
                });
            }

            return nextBatch();
        }

        return walk().then(function (matches: SearchResult[]): JQuery.Promise<DocItem[]> | DocItem[] {
            if (matches.length === 0) return [];
            return fetchExtractsBatched(matches);
        });
    }

    // Build modal HTML template
    function buildModalHtml(): string {
        return `
            <div class="docs-book">
                <div class="docs-left">
                    <div class="docs-search-wrap">
                        <input class="tm-input docs-search-input" placeholder="Filter indexed docs..." aria-label="Search docs">
                    </div>
                    <div class="docs-list" role="navigation" tabindex="0"></div>
                </div>
                <div class="docs-right">
                    <div class="docs-preview-header">
                        <h3 class="docs-preview-title">Select a doc to preview</h3>
                        <div class="docs-preview-actions">
                            <a class="tm-btn tm-btn-secondary docs-open-wiki" target="_blank" rel="noopener noreferrer">Open in New Tab</a>
                            <button class="tm-btn tm-btn-ghost docs-copy-title" title="Copy title">Copy</button>
                        </div>
                    </div>
                    <div class="docs-preview-body">
                        <div class="docs-preview-content">No document selected</div>
                    </div>
                </div>
            </div>
            <div class="docs-log tm-log hidden" aria-live="polite"></div>
        `;
    }

    function injectExtraCss(): void {
        const id = 'gadget-docs-browser-styles';
        if (document.getElementById(id)) return;
        const css = `
            /* moved to DocsBrowser.css */
        `;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = css;
        document.head.appendChild(s);
    }

    function openDocsModal(): ModalInstance | null {
        if (isMobileViewport()) {
            showMobileDisabledModal();
            return null;
        }

        if (!window.createToolModal) {
            console.warn('createToolModal not available');
            return null;
        }

        injectExtraCss();

        const modal = window.createToolModal({
            toolId: 'docs-browser',
            title: 'Documentation Browser',
            contentHtml: buildModalHtml(),
            theme: 'docs',
            onClose: function (): void {}
        });

        const el = modal.element;
        const searchInput = el.querySelector('.docs-search-input') as HTMLInputElement | null;
        const list = el.querySelector('.docs-list') as HTMLElement | null;
        const previewTitle = el.querySelector('.docs-preview-title') as HTMLElement | null;
        const previewContent = el.querySelector('.docs-preview-content') as HTMLElement | null;
        const openWikiLink = el.querySelector('.docs-open-wiki') as HTMLAnchorElement | null;
        const copyTitleBtn = el.querySelector('.docs-copy-title') as HTMLButtonElement | null;
        const logEl = el.querySelector('.docs-log') as HTMLElement | null;

        if (!searchInput || !list || !previewTitle || !previewContent || !openWikiLink || !copyTitleBtn) {
            console.error('DocsBrowser: Required elements not found');
            return null;
        }

        let indexData: DocItem[] | null = getCachedIndex();
        const sessionPreviewCache: Record<string, string> = {};

        function log(msg: string, show?: boolean): void {
            if (!logEl) return;
            logEl.innerHTML =
                '<div class="tm-log-entry tm-log-info">' + mw.html.escape(msg) + '</div>';
            if (show) logEl.classList.remove('hidden');
        }

        function renderList(items: DocItem[] | null): void {
            if (!list) return;
            list.innerHTML = '';
            if (!items || items.length === 0) {
                list.innerHTML = '<div class="docs-item">No docs found.</div>';
                return;
            }
            items.forEach(function (item: DocItem): void {
                const d = document.createElement('div');
                d.className = 'docs-item';
                d.setAttribute('data-title', item.title);
                d.innerHTML =
                    '<strong>' +
                    mw.html.escape(item.title) +
                    '</strong><div style="font-size:13px;color: #6b7280; margin-top:6px;">' +
                    mw.html.escape(item.excerpt || '') +
                    '</div>';
                d.addEventListener('click', function (): void {
                    selectDoc(item);
                });
                list.appendChild(d);
            });
        }

        function selectDoc(item: DocItem): void {
            if (!item || !previewTitle || !previewContent || !openWikiLink || !copyTitleBtn) return;

            previewTitle.textContent = item.title;
            openWikiLink.href = item.fullurl || mw.util.getUrl(item.title);
            copyTitleBtn.onclick = function (): void {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(item.title);
                }
            };

            if (sessionPreviewCache[item.title]) {
                previewContent.innerHTML = sessionPreviewCache[item.title];
                return;
            }

            previewContent.innerHTML = '<em>Loading preview…</em>';
            const api = new mw.Api();

            (
                api.get({
                    action: 'parse',
                    page: item.title,
                    prop: 'text|externallinks',
                    disablelimitreport: true,
                    formatversion: 2
                }) as JQuery.Promise<ApiParseResponse>
            )
                .then(function (res: ApiParseResponse): void {
                    if (res.parse?.text) {
                        const html = res.parse.text;
                        sessionPreviewCache[item.title] = html;
                        previewContent.innerHTML = html;
                    } else {
                        previewContent.innerHTML = '<em>No preview available.</em>';
                    }
                })
                .catch(function (err: unknown): void {
                    previewContent.innerHTML = '<em>Error loading preview.</em>';
                    console.error('Docs preview error', err);
                });
        }

        // Local filtering
        function filterIndex(q: string): DocItem[] {
            if (!indexData) return [];
            const lower = q.toLowerCase();
            return indexData.filter(function (it: DocItem): boolean {
                return (
                    it.title.toLowerCase().indexOf(lower) !== -1 ||
                    (it.excerpt !== undefined && it.excerpt.toLowerCase().indexOf(lower) !== -1)
                );
            });
        }

        searchInput.addEventListener('input', function (): void {
            const q = searchInput.value.trim();
            const results = filterIndex(q);
            renderList(results);
        });

        searchInput.addEventListener('keydown', function (e: KeyboardEvent): void {
            if (e.key === 'Enter') {
                e.preventDefault();
                const first = list?.querySelector('.docs-item') as HTMLElement | null;
                if (first) first.click();
            } else if (e.key === 'Escape') {
                searchInput.value = '';
                renderList(indexData || []);
            }
        });

        function populateFromIndex(idx: DocItem[]): void {
            indexData = idx || [];
            renderList(indexData);
            log('Indexed ' + indexData.length + ' doc(s).', true);
        }

        if (indexData) {
            populateFromIndex(indexData);
        } else {
            // Immediately inform user that index is missing and will be built now
            log('Index not found in cache — building index…', true);
        }

        modal.open();

        // If there's no index in localStorage, automatically build it
        if (!indexData) {
            fetchAllPagesWithDoc(function (progress: string): void {
                log(progress, true);
            })
                .then(function (docs: DocItem[]): void {
                    setCachedIndex(docs);
                    populateFromIndex(docs);
                })
                .catch(function (err: unknown): void {
                    console.error('Docs indexing failed', err);
                    log('Indexing failed. Check browser console (F12) for details.', true);
                });
        }

        // Double-click on title forces re-index
        previewTitle.addEventListener('dblclick', function (): void {
            log('Forcing re-index…', true);
            fetchAllPagesWithDoc(function (p: string): void {
                log(p, true);
            })
                .then(function (docs: DocItem[]): void {
                    setCachedIndex(docs);
                    populateFromIndex(docs);
                })
                .catch(function (err: unknown): void {
                    console.error('Docs reindex error', err);
                    log('Reindex failed', true);
                });
        });

        el.addEventListener('keydown', function (e: KeyboardEvent): void {
            if (e.key === 'Escape') modal.close();
        });

        return modal;
    }

    // Expose as gadget button
    function addToolbarEntry(): void {
        const entryId = 'p-docs-browser';
        if (document.getElementById(entryId)) return;

        $(function (): void {
            const $li = $(
                '<li id="' + entryId + '"><a href="#" id="mw-docs-browser-launch">Docs</a></li>'
            );
            $('#p-personal ul, #p-views > .body > ul').first().append($li);
            $('#mw-docs-browser-launch').on('click', function (e: JQuery.ClickEvent): void {
                e.preventDefault();
                if (isMobileViewport()) {
                    showMobileDisabledModal();
                    return;
                }
                openDocsModal();
            });
        });
    }

    // Add a global shortcut (Ctrl+Shift+D)
    function addShortcut(): void {
        document.addEventListener('keydown', function (e: KeyboardEvent): void {
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
                e.preventDefault();
                if (isMobileViewport()) {
                    showMobileDisabledModal();
                    return;
                }
                openDocsModal();
            }
        });
    }

    // Initialize gadget
    mw.loader.using(['mediawiki.api', 'mediawiki.util'], function (): void {
        addToolbarEntry();
        addShortcut();
        window.openDocsBrowser = openDocsModal;
    });
})(mw, document);