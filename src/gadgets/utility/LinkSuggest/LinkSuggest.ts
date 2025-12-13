/**
 * LinkSuggest Gadget
 * * Provides autocompletion suggestions for [[wikilinks]] and {{templates}}
 * in both CodeMirror 6 and plain textarea editors.
 * * @author [[User:Makudoumee]]
 * @converted-to-ts 2025-12-13
 * @license CC BY-SA 4.0
 */

// --- Interfaces for Data Structures ---

interface LinkSuggestConfig {
    minLength: number;
    delay: number;
    maxResults: number;
    namespaces: number[];
}

interface NamespaceInfo {
    id: number;
    name: string;
    displayTitle: string;
}

interface SuggestContext {
    type: 'link' | 'template';
    start: number;
    end: number;
    query: string;
    searchQuery: string;
    format: string;
    stripPrefix: boolean;
}

interface SuggestionItem {
    label: string;
    value: string;
    context: SuggestContext;
    fullTitle: string;
    nsId: number;
    nsName: string;
}

interface Coordinates {
    left: number;
    top: number;
    bottom?: number;
}

// --- Interfaces for MediaWiki API ---

interface ApiPageInfo {
    pageid: number;
    ns: number;
    title: string;
    index: number;
}

interface ApiRedirectInfo {
    from: string;
    to: string;
}

interface ApiPrefixSearchResponse {
    query?: {
        pages?: Record<string, ApiPageInfo>;
        redirects?: ApiRedirectInfo[];
    };
    error?: {
        code: string;
        info: string;
    };
}

// MediaWiki API Promises act like jQuery promises but have an abort method
// and pass specific arguments to .fail()
interface MwApiPromise<T> extends JQuery.Promise<T> {
    abort: () => void;
}

interface MwApi {
    get: (params: Record<string, unknown>) => MwApiPromise<ApiPrefixSearchResponse>;
}

// --- Interfaces for CodeMirror 6 (Mocking internal structures) ---

interface CM6SelectionRange {
    from: number;
    to: number;
    head: number;
    anchor: number;
}

interface CM6Selection {
    main: CM6SelectionRange;
}

interface CM6Doc {
    length: number;
    toString: () => string;
}

interface CM6State {
    doc: CM6Doc;
    selection: CM6Selection;
}

interface CM6TransactionSpec {
    changes?: { from: number; to: number; insert: string };
    selection?: { anchor: number };
}

interface CM6View {
    state: CM6State;
    dispatch: (spec: CM6TransactionSpec) => void;
    focus: () => void;
    // Methods optional to allow for existence checks (if (view.coordsAtPos))
    coordsAtPos?: (pos: number, side?: number) => Coordinates | null;
}

// We use an intersection type instead of 'extends HTMLElement' to avoid conflicts 
// with existing environment types for CodeMirror elements.
type CM6Element = HTMLElement & {
    cmView?: {
        view: CM6View;
    };
    view?: CM6View; 
};

// --- Global Declarations ---

declare const mw: {
    config: {
        get: <T>(key: string, fallback?: T) => T;
    };
    hook: (name: string) => {
        add: (handler: (param?: unknown) => void) => void;
    };
    Api: new () => MwApi;
};

declare const mediaWiki: typeof mw;

interface LinkSuggestDebugController {
    on: () => void;
    off: () => void;
    status: () => void;
}

declare global {
    interface Window {
        LinkSuggestDebug: LinkSuggestDebugController;
    }
}

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
        return;
    }

    const wgUserGroups = mw.config.get<string[]>('wgUserGroups', []);
    const isInterfaceAdmin = wgUserGroups.indexOf('interface-admin') !== -1;
    let debugEnabled = false;

    // Debug Controller
    window.LinkSuggestDebug = {
        on: function (): void {
            if (!isInterfaceAdmin) {
                console.warn('[LinkSuggest] Debug mode is only available for interface-admin users.');
                return;
            }
            debugEnabled = true;
            console.info('[LinkSuggest] Debug mode enabled.');
        },
        off: function (): void {
            debugEnabled = false;
            console.info('[LinkSuggest] Debug mode disabled.');
        },
        status: function (): void {
            console.info('[LinkSuggest] Debug mode is ' + (debugEnabled ? 'ON' : 'OFF') +
                (isInterfaceAdmin ? ' (interface-admin)' : ' (not interface-admin)'));
        }
    };

    function log(...args: unknown[]): void {
        if (debugEnabled && isInterfaceAdmin && window.console && console.debug) {
            const logArgs = Array.prototype.slice.call(args);
            logArgs.unshift('[LinkSuggest]');
            console.debug.apply(console, logArgs);
        }
    }

    const CONFIG: LinkSuggestConfig = {
        minLength: 3,
        delay: 300,
        maxResults: 10,
        namespaces: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 110, 111, 828, 829, 3000, 3004, 3005, 3006, 3007]
    };

    // Namespace mappings
    const namespaceNames: Record<number, string> = {};
    const namespaceIds = mw.config.get<Record<string, number>>('wgNamespaceIds', {});
    const formattedNamespaces = mw.config.get<Record<string, string>>('wgFormattedNamespaces', {});

    // Build reverse mapping: ID -> Name
    (function (): void {
        for (const idStr in formattedNamespaces) {
            if (Object.prototype.hasOwnProperty.call(formattedNamespaces, idStr)) {
                const name = formattedNamespaces[idStr];
                const id = parseInt(idStr, 10);
                if (id === 0) {
                    namespaceNames[0] = 'Page';
                } else if (name) {
                    namespaceNames[id] = name;
                }
            }
        }
    })();

    function getNamespaceFromTitle(title: string): NamespaceInfo {
        const colonPos = title.indexOf(':');

        if (colonPos === -1) {
            return { id: 0, name: 'Page', displayTitle: title };
        }

        const prefix = title.substring(0, colonPos);
        const prefixLower = prefix.toLowerCase().replace(/ /g, '_');

        if (Object.prototype.hasOwnProperty.call(namespaceIds, prefixLower)) {
            const nsId = namespaceIds[prefixLower];
            const nsName = namespaceNames[nsId] || prefix;
            return {
                id: nsId,
                name: nsName,
                displayTitle: title.substring(colonPos + 1)
            };
        }

        return { id: 0, name: 'Page', displayTitle: title };
    }

    // State
    let dropdown: JQuery<HTMLElement> | null = null;
    let selectedIndex = -1;
    let suggestions: SuggestionItem[] = [];
    let searchTimeout: number | null = null;
    let currentMode: 'codemirror' | 'textarea' | null = null;
    let boundElement: HTMLElement | null = null;
    let isInserting = false;
    let currentRequest: MwApiPromise<ApiPrefixSearchResponse> | null = null;
    let cachedCM6View: CM6View | null = null;

    function createDropdown(): JQuery<HTMLElement> {
        if (dropdown) {
            dropdown.remove();
        }
        dropdown = $('<ul>')
            .attr('id', 'linksuggest-dropdown')
            .addClass('linksuggest-dropdown')
            .appendTo('body');
        log('Dropdown created');
        return dropdown;
    }

    function hideDropdown(): void {
        if (dropdown) {
            dropdown.hide().empty();
        }
        selectedIndex = -1;
        suggestions = [];
    }

    function showDropdown(items: SuggestionItem[], position: Coordinates): void {
        if (!dropdown) {
            createDropdown();
        }
        if (!dropdown) return; // TS guard

        dropdown.empty();
        suggestions = items;

        items.forEach((item, i) => {
            const $item = $('<li>').attr('data-index', i);
            const $label = $('<span>').addClass('linksuggest-label').text(item.label);
            const nsClass = 'linksuggest-ns-' + item.nsId;
            const $chip = $('<span>').addClass('linksuggest-chip').addClass(nsClass).text(item.nsName);

            $item.append($label).append($chip);
            dropdown?.append($item);
        });

        selectedIndex = 0;
        updateSelection();

        const viewportWidth = $(window).width() || 1000;
        const viewportHeight = $(window).height() || 800;

        let left = position.left;
        let top = position.top;

        // Measure
        dropdown.css({ left: 0, top: 0, visibility: 'hidden' }).show();
        const dropdownWidth = dropdown.outerWidth() || 200;
        const dropdownHeight = dropdown.outerHeight() || 300;
        dropdown.css('visibility', '');

        // Horizontal adjust
        if (left + dropdownWidth > viewportWidth - 10) {
            left = viewportWidth - dropdownWidth - 10;
        }
        if (left < 10) {
            left = 10;
        }

        // Vertical adjust
        const spaceBelow = viewportHeight - position.top;
        const spaceAbove = position.top;

        if (spaceBelow < dropdownHeight + 20 && spaceAbove > dropdownHeight) {
            top = position.top - dropdownHeight - 20;
            dropdown.addClass('linksuggest-above');
        } else {
            dropdown.removeClass('linksuggest-above');
        }

        dropdown.css({
            left: left + 'px',
            top: top + 'px'
        }).show();

        log('Dropdown shown with', items.length, 'items at', left, top);

        dropdown.find('li').off('mouseenter click').on('mouseenter', function () {
            selectedIndex = parseInt($(this).attr('data-index') || '0', 10);
            updateSelection();
        }).on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const idx = parseInt($(this).attr('data-index') || '0', 10);
            if (suggestions[idx]) {
                selectItem(suggestions[idx]);
            }
        });
    }

    function updateSelection(): void {
        if (!dropdown) return;
        dropdown.find('li').removeClass('linksuggest-selected');
        dropdown.find('li').eq(selectedIndex).addClass('linksuggest-selected');

        const $selected = dropdown.find('li.linksuggest-selected');
        if ($selected.length && dropdown[0]) {
            const container = dropdown[0];
            const element = $selected[0];
            if (element.offsetTop < container.scrollTop) {
                container.scrollTop = element.offsetTop;
            } else if (element.offsetTop + element.offsetHeight > container.scrollTop + container.clientHeight) {
                container.scrollTop = element.offsetTop + element.offsetHeight - container.clientHeight;
            }
        }
    }

    function moveSelection(delta: number): void {
        if (suggestions.length === 0) return;

        selectedIndex += delta;
        if (selectedIndex < 0) {
            selectedIndex = suggestions.length - 1;
        } else if (selectedIndex >= suggestions.length) {
            selectedIndex = 0;
        }
        updateSelection();
    }

    function parseContext(text: string, caret: number): SuggestContext | null {
        let i, c, c1, query, searchQuery, format;
        let stripPrefix = false;

        // Scan forward
        for (i = caret; i < text.length; i++) {
            c = text.charAt(i);
            c1 = i > 0 ? text.charAt(i - 1) : '';

            if (c === '\n') break;
            if (c === '[' && c1 === '[') break;
            if (c === ']' && c1 === ']') return null;
            if (c === '{' && c1 === '{') break;
            if (c === '}' && c1 === '}') return null;
        }

        // Scan backward
        for (i = caret - 1; i >= 0; i--) {
            c = text.charAt(i);

            if (c === '\n') break;
            if (c === ']' || c === '}' || c === '|' || c === '#') return null;

            // Link detection
            if (c === '[' && i > 0 && text.charAt(i - 1) === '[') {
                query = text.substring(i + 1, caret);
                stripPrefix = false;

                if (query.charAt(0) === ':') {
                    searchQuery = query.slice(1);
                    format = '[[:$1]]';
                } else {
                    searchQuery = query;
                    format = '[[$1]]';
                }

                log('Link context found, query:', searchQuery);
                return {
                    type: 'link',
                    start: i - 1,
                    end: caret,
                    query: query,
                    searchQuery: searchQuery,
                    format: format,
                    stripPrefix: stripPrefix
                };
            }

            // Template detection
            if (c === '{' && i > 0 && text.charAt(i - 1) === '{') {
                if (i > 1 && text.charAt(i - 2) === '{') return null; // Avoid {{{param}}}

                query = text.substring(i + 1, caret);
                stripPrefix = false;

                if (query.length >= 6 && query.toLowerCase().substring(0, 6) === 'subst:') {
                    if (query.length >= 7 && query.charAt(6) === ':') {
                        searchQuery = query.slice(7);
                        format = '{{subst::$1}}';
                    } else {
                        searchQuery = 'Template:' + query.slice(6);
                        stripPrefix = true;
                        format = '{{#invoke:$var|$1}}'; 
                    }
                } else if (query.charAt(0) === ':') {
                    searchQuery = query.slice(1);
                    format = '{{:$1}}';
                } else if (query.charAt(0) === '#') {
                    return null;
                } else {
                    searchQuery = 'Template:' + query;
                    stripPrefix = true;
                    format = '{{$1}}';
                }

                log('Template context found, query:', searchQuery);
                return {
                    type: 'template',
                    start: i - 1,
                    end: caret,
                    query: query,
                    searchQuery: searchQuery,
                    format: format,
                    stripPrefix: stripPrefix
                };
            }
        }

        return null;
    }

    function performSearch(context: SuggestContext, callback: (results: SuggestionItem[]) => void): void {
        if (currentRequest) {
            currentRequest.abort();
            currentRequest = null;
        }

        log('API search for:', context.searchQuery);

        const api = new mw.Api();

        currentRequest = api.get({
            action: 'query',
            generator: 'prefixsearch',
            gpsnamespace: CONFIG.namespaces.join('|'),
            gpssearch: context.searchQuery,
            gpslimit: CONFIG.maxResults,
            redirects: true
        });

        // mw.Api fail callback is (code, result) not (jqXHR, textStatus, errorThrown)
        currentRequest.done(function (data: ApiPrefixSearchResponse) {
            currentRequest = null;
            log('API response received');
            const results = processResults(data, context);
            callback(results);
        }).fail(function (code: string) {
            currentRequest = null;
            if (code !== 'abort') {
                log('API error:', code);
                callback([]);
            }
        });
    }

    function processResults(data: ApiPrefixSearchResponse, context: SuggestContext): SuggestionItem[] {
        const titles: string[] = [];
        const redirectsTo: Record<string, string[]> = {};
        const pageIndexes: Record<string, number> = {};

        if (!data || !data.query || !data.query.pages) {
            return [];
        }

        if (data.query.redirects) {
            data.query.redirects.forEach(function (redirect) {
                if (!redirectsTo[redirect.to]) {
                    redirectsTo[redirect.to] = [];
                }
                redirectsTo[redirect.to].push(redirect.from);
            });
        }

        for (const index in data.query.pages) {
            if (Object.prototype.hasOwnProperty.call(data.query.pages, index)) {
                const page = data.query.pages[index];
                pageIndexes[page.title] = page.index;
                titles.push(page.title);

                const redirects = redirectsTo[page.title] || [];
                redirects.forEach(function (r) {
                    pageIndexes[r] = page.index + 0.5;
                    titles.push(r);
                });
            }
        }

        titles.sort(function (a, b) {
            return (pageIndexes[a] || 0) - (pageIndexes[b] || 0);
        });

        return titles.map(function (title) {
            const nsInfo = getNamespaceFromTitle(title);
            let displayTitle = title;

            if (context.stripPrefix) {
                const colonPos = title.indexOf(':');
                if (colonPos !== -1) {
                    displayTitle = title.substring(colonPos + 1);
                }
            }

            return {
                label: displayTitle,
                value: context.format.replace('$1', displayTitle),
                context: context,
                fullTitle: title,
                nsId: nsInfo.id,
                nsName: nsInfo.name
            };
        });
    }

    function selectItem(item: SuggestionItem): void {
        log('Selecting:', item.label);

        isInserting = true;

        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        if (currentRequest) {
            currentRequest.abort();
            currentRequest = null;
        }

        hideDropdown();

        if (currentMode === 'codemirror') {
            selectItemCodeMirror(item);
        } else {
            selectItemTextarea(item);
        }

        setTimeout(function () {
            isInserting = false;
        }, 100);
    }

    // --- CodeMirror 6 Helpers ---

    function getCodeMirror6View(): CM6View | null {
        if (cachedCM6View && cachedCM6View.state && cachedCM6View.coordsAtPos) {
            return cachedCM6View;
        }

        cachedCM6View = null;
        let view: CM6View | null = null;

        // Method 1: .cm-content
        const cmContent = document.querySelector('.cm-content') as CM6Element;
        if (cmContent && cmContent.cmView && cmContent.cmView.view) {
            view = cmContent.cmView.view;
            log('CM6 view found via .cm-content.cmView.view');
        }

        // Method 2: .cm-editor
        if (!view) {
            const cmEditor = document.querySelector('.cm-editor') as CM6Element;
            if (cmEditor) {
                if (cmEditor.cmView && cmEditor.cmView.view) {
                    view = cmEditor.cmView.view;
                    log('CM6 view found via .cm-editor.cmView.view');
                } else if (cmEditor.view && cmEditor.view.state) {
                    view = cmEditor.view;
                    log('CM6 view found via .cm-editor.view');
                }
            }
        }

        // Method 3: contenteditable
        if (!view) {
            const contentEditable = document.querySelector('.cm-editor [contenteditable="true"]') as CM6Element;
            if (contentEditable && contentEditable.cmView && contentEditable.cmView.view) {
                view = contentEditable.cmView.view;
                log('CM6 view found via contenteditable.cmView.view');
            }
        }

        if (view && view.state && view.coordsAtPos) {
            cachedCM6View = view;
            return view;
        }

        log('CM6 view not found or missing required methods');
        return null;
    }

    function selectItemCodeMirror(item: SuggestionItem): void {
        const view = getCodeMirror6View();

        if (!view || !view.state) {
            log('CM6 view not available, falling back to textarea');
            selectItemTextarea(item);
            return;
        }

        try {
            const cursorPos = view.state.selection.main.head;
            const text = view.state.doc.toString();
            const prefix = item.value.substring(0, 2);
            let startPos = cursorPos;

            for (let i = cursorPos - 2; i >= 0; i--) {
                if (text.substring(i, i + 2) === prefix) {
                    startPos = i;
                    break;
                }
            }

            log('CM6 replacing from', startPos, 'to', cursorPos, 'with:', item.value);

            view.dispatch({
                changes: {
                    from: startPos,
                    to: cursorPos,
                    insert: item.value
                },
                selection: { anchor: startPos + item.value.length }
            });

            view.focus();
            log('CM6 insertion successful');

        } catch (e) {
            log('CM6 insertion error:', e);
            selectItemTextarea(item);
        }
    }

    function selectItemTextarea(item: SuggestionItem): void {
        const textarea = document.getElementById('wpTextbox1') as HTMLTextAreaElement;
        if (!textarea) return;

        const text = textarea.value;
        const caret = textarea.selectionStart;
        const prefix = item.value.substring(0, 2);
        let startPos = caret;

        for (let i = caret - 2; i >= 0; i--) {
            if (text.substring(i, i + 2) === prefix) {
                startPos = i;
                break;
            }
        }

        const newText = text.substring(0, startPos) + item.value + text.substring(caret);
        const newPos = startPos + item.value.length;

        textarea.value = newText;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
    }

    function getCodeMirrorText(): string {
        const view = getCodeMirror6View();
        if (view && view.state) {
            return view.state.doc.toString();
        }

        const cmContent = document.querySelector('.cm-content');
        if (!cmContent) return '';

        // Fallback reading DOM lines if view unavailable (rare)
        const lines = cmContent.querySelectorAll('.cm-line');
        let text = '';
        lines.forEach((line, i) => {
            if (i > 0) text += '\n';
            text += line.textContent || '';
        });
        return text;
    }

    function getCodeMirrorCaret(): number {
        const view = getCodeMirror6View();
        if (view && view.state && view.state.selection) {
            return view.state.selection.main.head;
        }

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;

        const range = sel.getRangeAt(0);
        const cmContent = document.querySelector('.cm-content');
        if (!cmContent || !cmContent.contains(range.startContainer)) return 0;

        const lines = cmContent.querySelectorAll('.cm-line');
        let pos = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.contains(range.startContainer)) {
                const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null);
                let node: Node | null;
                while ((node = walker.nextNode())) {
                    if (node === range.startContainer) {
                        pos += range.startOffset;
                        return pos;
                    }
                    pos += (node.textContent || '').length;
                }
                return pos;
            }
            pos += (line.textContent || '').length + 1;
        }

        return pos;
    }

    function getCaretPixelPosition(context: SuggestContext): Coordinates {
        const view = getCodeMirror6View();

        if (view && view.coordsAtPos && view.state) {
            try {
                let targetPos = context.start;
                const docLength = view.state.doc.length;
                if (targetPos < 0) targetPos = 0;
                if (targetPos > docLength) targetPos = docLength;

                const coords = view.coordsAtPos(targetPos, 1);

                if (coords && coords.bottom !== undefined && coords.bottom > 0) {
                    log('coordsAtPos success at position', targetPos, ':', coords.left, coords.bottom);
                    return {
                        left: coords.left,
                        top: coords.bottom + 4
                    };
                }
            } catch (e) {
                log('coordsAtPos error:', e);
            }
        }

        return getCaretPositionFallback();
    }

    function getCaretPositionFallback(): Coordinates {
        // Method 1: Cursor element styles
        const cursor = (document.querySelector('.cm-cursor-primary') || document.querySelector('.cm-cursor')) as HTMLElement;
        if (cursor) {
            const cursorStyle = cursor.style;
            const left = parseFloat(cursorStyle.left);
            const top = parseFloat(cursorStyle.top);
            const height = parseFloat(cursorStyle.height) || 15;

            if (left > 0 || top > 0) {
                const scroller = document.querySelector('.cm-scroller');
                if (scroller) {
                    const scrollerRect = scroller.getBoundingClientRect();
                    log('Fallback: using cursor inline styles');
                    return {
                        left: scrollerRect.left + left,
                        top: scrollerRect.top + top + height + 4
                    };
                }
            }
        }

        // Method 2: Selection API marker
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            try {
                const range = sel.getRangeAt(0).cloneRange();
                range.collapse(true);

                const cmContent = document.querySelector('.cm-content');
                if (cmContent && cmContent.contains(range.startContainer)) {
                    const marker = document.createElement('span');
                    marker.textContent = '\u200B';
                    range.insertNode(marker);

                    const rect = marker.getBoundingClientRect();
                    const pos = {
                        left: rect.left,
                        top: rect.bottom + 4
                    };

                    if (marker.parentNode) marker.parentNode.removeChild(marker);
                    cmContent.normalize();

                    if (rect.left > 0 || rect.top > 0) {
                        log('Fallback: using marker insertion');
                        return pos;
                    }
                }
            } catch (e) {
                log('Selection fallback error:', e);
            }
        }

        // Method 3: Last resort
        const cmEditor = document.querySelector('.cm-editor');
        if (cmEditor) {
            const editorRect = cmEditor.getBoundingClientRect();
            log('Fallback: using editor rect (last resort)');
            return {
                left: editorRect.left + 50,
                top: editorRect.top + 100
            };
        }

        return { left: 100, top: 100 };
    }

    function getTextareaCaretPosition(context: SuggestContext): Coordinates {
        const $textarea = $('#wpTextbox1');
        const textarea = $textarea[0] as HTMLTextAreaElement;
        if (!textarea) return { left: 100, top: 100 };

        const text = textarea.value;
        const caret = textarea.selectionStart;
        let bracketPos = caret - context.query.length - 2;
        if (bracketPos < 0) bracketPos = 0;

        const textareaRect = textarea.getBoundingClientRect();

        const $mirror = $('<div>').css({
            position: 'absolute',
            top: '-9999px',
            left: '-9999px',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            visibility: 'hidden',
            width: $textarea.width() + 'px',
            fontFamily: $textarea.css('font-family'),
            fontSize: $textarea.css('font-size'),
            fontWeight: $textarea.css('font-weight'),
            lineHeight: $textarea.css('line-height'),
            padding: $textarea.css('padding'),
            border: $textarea.css('border'),
            boxSizing: $textarea.css('box-sizing')
        }).appendTo('body');

        const textBefore = text.substring(0, bracketPos).replace(/\n$/, '\n\u00a0');
        const $marker = $('<span>').text('\u200b');
        $mirror.text(textBefore).append($marker);

        const markerPos = $marker.position();
        const lineHeight = parseInt($textarea.css('line-height') || '20', 10);

        $mirror.remove();

        return {
            left: textareaRect.left + markerPos.left + parseInt($textarea.css('padding-left') || '0', 10),
            top: textareaRect.top + markerPos.top - textarea.scrollTop + lineHeight + 4
        };
    }

    function scheduleSearch(): void {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        searchTimeout = window.setTimeout(doSearch, CONFIG.delay);
    }

    function doSearch(): void {
        if (isInserting) {
            log('Skipping search - insertion in progress');
            return;
        }

        let text = '';
        let caret = 0;

        if (currentMode === 'codemirror') {
            text = getCodeMirrorText();
            caret = getCodeMirrorCaret();
            log('CM search - caret:', caret, 'text length:', text.length);
        } else {
            const textarea = document.getElementById('wpTextbox1') as HTMLTextAreaElement;
            if (!textarea) return;
            text = textarea.value;
            caret = textarea.selectionStart;
            log('Textarea search - caret:', caret);
        }

        const context = parseContext(text, caret);

        if (!context) {
            hideDropdown();
            return;
        }

        const effectiveQuery = context.stripPrefix ? context.query : context.searchQuery;
        if (effectiveQuery.length < CONFIG.minLength) {
            log('Query too short:', effectiveQuery.length, '< minLength:', CONFIG.minLength);
            hideDropdown();
            return;
        }

        let position: Coordinates;
        if (currentMode === 'codemirror') {
            position = getCaretPixelPosition(context);
        } else {
            position = getTextareaCaretPosition(context);
        }

        performSearch(context, function (results) {
            if (isInserting) {
                log('Skipping dropdown - insertion in progress');
                return;
            }
            if (results.length > 0) {
                showDropdown(results, position);
            } else {
                hideDropdown();
            }
        });
    }

    // Using 'any' for event here simplifies the intersection of 
    // JQuery.TriggeredEvent, KeyboardEvent, and the nuances of defaultPrevented
    // across different environments/jQuery versions.
    function handleKeydown(e: any): boolean | void {
        if (!dropdown || !dropdown.is(':visible')) {
            return;
        }

        switch (e.keyCode) {
            case 38: // Up
                if (e.defaultPrevented || (e.isDefaultPrevented && e.isDefaultPrevented())) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                moveSelection(-1);
                return false;
            case 40: // Down
                if (e.defaultPrevented || (e.isDefaultPrevented && e.isDefaultPrevented())) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                moveSelection(1);
                return false;
            case 13: // Enter
            case 9: // Tab
                if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                    if (e.defaultPrevented || (e.isDefaultPrevented && e.isDefaultPrevented())) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    selectItem(suggestions[selectedIndex]);
                    return false;
                }
                break;
            case 27: // Escape
                if (e.defaultPrevented || (e.isDefaultPrevented && e.isDefaultPrevented())) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                hideDropdown();
                return false;
        }
    }

    function bindCodeMirror(): boolean {
        const cmContent = document.querySelector('.cm-content') as HTMLElement;
        if (!cmContent) {
            log('ERROR: .cm-content not found');
            return false;
        }

        if (boundElement === cmContent) {
            log('Already bound to this CodeMirror');
            return true;
        }

        log('Binding to CodeMirror');
        currentMode = 'codemirror';
        boundElement = cmContent;
        cachedCM6View = null;

        $(cmContent).off('.linksuggest');

        cmContent.addEventListener('input', function () {
            if (!isInserting) {
                log('CM input event');
                scheduleSearch();
            }
        }, false);

        cmContent.addEventListener('keyup', function (e: KeyboardEvent) {
            if (!isInserting && [37, 38, 39, 40, 13, 27, 9].indexOf(e.keyCode) === -1) {
                log('CM keyup event');
                scheduleSearch();
            }
        }, false);

        cmContent.addEventListener('keydown', function (e: KeyboardEvent) {
            handleKeydown(e);
        }, true);

        const cmScroller = document.querySelector('.cm-scroller');
        if (cmScroller) {
            $(cmScroller).off('.linksuggest').on('scroll.linksuggest', hideDropdown);
        }

        log('CodeMirror bound successfully');
        return true;
    }

    function bindTextarea(): boolean {
        const $textarea = $('#wpTextbox1');
        if (!$textarea.length) {
            log('ERROR: #wpTextbox1 not found');
            return false;
        }

        if (!$textarea.is(':visible')) {
            log('Textarea is hidden, probably CodeMirror is active');
            return false;
        }

        if (boundElement === $textarea[0]) {
            log('Already bound to textarea');
            return true;
        }

        log('Binding to textarea');
        currentMode = 'textarea';
        boundElement = $textarea[0];

        $textarea.off('.linksuggest');

        $textarea.on('input.linksuggest', function () {
            if (!isInserting) {
                log('Textarea input event');
                scheduleSearch();
            }
        });

        $textarea.on('keydown.linksuggest', function (e) {
            handleKeydown(e);
        });

        $textarea.on('scroll.linksuggest', hideDropdown);

        log('Textarea bound successfully');
        return true;
    }

    function detectAndBind(): boolean {
        log('detectAndBind called');

        cachedCM6View = null;

        const cmContent = document.querySelector('.cm-content');
        const cmEditor = document.querySelector('.cm-editor');

        log('.cm-editor exists:', !!cmEditor);
        log('.cm-content exists:', !!cmContent);

        if (cmContent) {
            return bindCodeMirror();
        }

        return bindTextarea();
    }

    function init(): void {
        log('init() called');

        const action = mw.config.get<string>('wgAction', '');
        if (action !== 'edit' && action !== 'submit') {
            log('Not an edit page, exiting');
            return;
        }

        createDropdown();

        $(document).off('click.linksuggest').on('click.linksuggest', function (e) {
            if (!$(e.target).closest('#linksuggest-dropdown, #wpTextbox1, .cm-content').length) {
                hideDropdown();
            }
        });

        if (!detectAndBind()) {
            log('Initial bind failed, will retry...');
        }

        const observer = new MutationObserver(function (mutations) {
            let shouldCheck = false;
            for (let i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 0) {
                    for (let j = 0; j < mutations[i].addedNodes.length; j++) {
                        const node = mutations[i].addedNodes[j] as Element;
                        if (node.nodeType === 1) {
                            if (node.classList && (
                                node.classList.contains('cm-editor') ||
                                node.classList.contains('cm-content') ||
                                node.classList.contains('ext-codemirror-wrapper')
                            )) {
                                shouldCheck = true;
                                break;
                            }
                            if (node.querySelector && node.querySelector('.cm-editor, .cm-content')) {
                                shouldCheck = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldCheck) break;
            }

            if (shouldCheck) {
                log('CodeMirror detected via MutationObserver');
                cachedCM6View = null;
                setTimeout(function () {
                    detectAndBind();
                }, 100);
            }
        });

        const editForm = document.getElementById('editform');
        if (editForm) {
            observer.observe(editForm, { childList: true, subtree: true });
            log('MutationObserver started on #editform');
        }

        let pollCount = 0;
        const pollInterval = setInterval(function () {
            pollCount++;
            const cmContent = document.querySelector('.cm-content');

            if (cmContent && currentMode !== 'codemirror') {
                log('CodeMirror detected via polling');
                detectAndBind();
                clearInterval(pollInterval);
            } else if (pollCount > 30) {
                clearInterval(pollInterval);
                log('Polling stopped');
            }
        }, 100);

        if (mw.hook) {
            mw.hook('ext.CodeMirror.ready').add(function () {
                log('ext.CodeMirror.ready hook fired');
                cachedCM6View = null;
                setTimeout(detectAndBind, 100);
            });

            mw.hook('ext.CodeMirror.switch').add(function (enabled) {
                log('ext.CodeMirror.switch hook fired, enabled:', enabled);
                hideDropdown();
                boundElement = null;
                cachedCM6View = null;
                setTimeout(detectAndBind, 100);
            });
        }

        log('init() complete');
    }

    $(function () {
        log('Document ready, waiting for page to settle...');
        setTimeout(init, 300);
    });

}(mediaWiki, jQuery));