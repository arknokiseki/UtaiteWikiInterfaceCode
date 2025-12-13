interface CodeMirrorEditor {
    getValue: () => string;
    setValue: (value: string) => void;
    getSelection: () => string;
    replaceSelection: (replacement: string) => void;
    focus: () => void;
    refresh: () => void;
    toTextArea: () => void;
    getScrollerElement: () => HTMLElement;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface CodeMirrorChange {
    origin: string;
    text: string[];
    cancel: () => void;
}

interface CodeMirrorStatic {
    fromTextArea: (
        textarea: HTMLTextAreaElement,
        options: Record<string, unknown>
    ) => CodeMirrorEditor;
}

interface ParseResponse {
    parse?: {
        text?: {
            '*': string;
        };
    };
}

interface MwApi {
    post: (params: Record<string, unknown>) => JQuery.Promise<ParseResponse>;
}

interface StyleSheetElement extends HTMLStyleElement {
    styleSheet?: {
        cssText: string;
    };
}

declare const CodeMirror: CodeMirrorStatic | undefined;

declare const mw: {
    config: {
        get: (key: string) => string | number | null;
    };
    Api: new () => MwApi;
    notify: (message: string, options?: { type?: string }) => void;
};

declare const mediaWiki: typeof mw;

(function ($: JQueryStatic, mw: typeof mediaWiki): void | false {
    'use strict';

    if (
        document.body.classList.contains('mw-mf') ||
        document.body.classList.contains('is-mobile-device')
    ) {
        return;
    }

    // === CONFIG ===
    const PREFERRED_HOST_ID = 'sandbox-page-box';
    const FALLBACK_CONTAINER_ID = 'sandbox-container';
    const MAX_CHARS = 30000;
    const PARSE_DELAY = 1500;
    const RESIZE_DEBOUNCE_MS = 150;
    const VIEWPORT_MARGIN = 40; // px: distance from bottom of viewport

    // --- Responsive & mobile config ---
    const MOBILE_BREAKPOINT = 1024; // px
    const PAGE_SIDE_GAP = 48; // px combined left+right gap fallback
    const MIN_SANDBOX_WIDTH = 320; // px
    const MAX_SANDBOX_WIDTH = 1100; // px

    // Only load on view mode (no action parameter or action=view)
    const action = mw.config.get('wgAction') as string;
    const allowedActions = ['view', 'purge'];
    if (allowedActions.indexOf(action) === -1) {
        return false;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const urlAction = urlParams.get('action');
    if (urlAction && urlAction !== 'view' && urlAction !== 'purge') {
        return false;
    }

    if (mw.config.get('wgPageName') !== 'Sandbox') {
        return;
    }

    $(function (): void {
        // === STYLES ===
        function injectSandboxStyles(): void {
            const css =
                /* base layout + improved flex & scroll handling */
                '.sandbox-container{' +
                'height: 100%!important;' +
                '}' +
                '.mw-sandbox-docked-host{' +
                'display:block!important;visibility:visible!important;' +
                'position:relative!important;z-index:600!important;' +
                'padding:6px!important;' +
                'height: 100%!important;' +
                'background:var(--body-bg,rgba(255,255,255,0.02))!important;' +
                'border:1px solid rgba(162,169,177,0.25)!important;border-radius:6px!important;' +
                'overflow-y:auto!important;overflow-x:hidden!important;' +
                'box-sizing:border-box!important;' +
                'margin:20px auto!important;' +
                '}' +
                '.sandbox-window{' +
                'display:flex!important;flex-direction:column!important;' +
                'height:auto!important;min-height:300px!important;' +
                'overflow:visible!important;position:static!important;' +
                '}' +
                '.sandbox-handle{cursor:default!important;user-select:none!important;touch-action:none!important;}' +
                '.sandbox-body{flex-grow:1!important;min-height:0!important;display:flex!important;overflow:visible!important;}' +
                /* Panels - fix flex overflow issues */
                '.sandbox-panels{display:flex!important;width:100%!important;gap:8px!important;align-items:stretch!important;min-width:0!important;}' +
                '.sandbox-panel{flex:1 1 0;display:flex!important;flex-direction:column!important;min-width:0!important;}' +
                '.sandbox-panel-header{padding:6px 4px;border-bottom:1px solid rgba(162,169,177,0.08)!important;}' +
                '.sandbox-panel-content{flex:1 1 auto!important;display:flex!important;flex-direction:column!important;min-height:0!important;min-width:0!important;overflow:visible!important;}' +
                /* Preview wrapper: the scrolling container */
                '.sandbox-panel-content .sandbox-preview-wrapper{flex:1 1 auto!important;overflow:auto!important;min-height:0!important;min-width:0!important;padding:0!important;}' +
                '#sandbox-preview{box-sizing:border-box!important;width:100%!important;min-width:0!important;word-wrap:break-word!important;word-break:break-word!important;padding:8px!important;border:1px solid #a2a9b1!important;background:transparent!important;min-height:100%!important;overflow-y:visible!important;overflow-x:visible!important;}' +
                /* Prevent visuals from causing horizontal overflow */
                '#sandbox-preview img, #sandbox-preview table { max-width:100%!important; height:auto!important; }' +
                /* Source textarea / CodeMirror area */
                '.sandbox-panel-content #sandbox-source, .sandbox-panel-content .CodeMirror { width:100%!important; height:100%!important; box-sizing:border-box!important; }' +
                /* Mobile message */
                '.mw-sandbox-mobile-message{padding:18px!important;text-align:center!important;font-weight:600!important;color:var(--primary-text-color,#333)!important;}' +
                /* Splitter styles */
                '.sandbox-splitter{width:10px;cursor:col-resize; background:transparent; position:relative; z-index:10;}' +
                '.sandbox-splitter:hover{background:rgba(162,169,177,0.06);}' +
                ".sandbox-splitter::after{content:'' ; position:absolute; left:50%; top:12px; bottom:12px; width:2px; transform:translateX(-50%); background:rgba(162,169,177,0.15); border-radius:2px; }" +
                /* Minor UI */
                '.sandbox-toolbar{display:flex;gap:6px;padding:6px 4px;border-bottom:1px solid rgba(162,169,177,0.06);}' +
                '.sandbox-toolbar button{padding:6px 8px;border-radius:4px;border:1px solid rgba(162,169,177,0.08);background:transparent;cursor:pointer;}' +
                '.sandbox-handle-title{font-weight:600;display:inline-block;padding:6px 4px;}';

            let styleEl = document.getElementById('sandbox-gadget-styles') as StyleSheetElement | null;
            if (!styleEl) {
                styleEl = document.createElement('style') as StyleSheetElement;
                styleEl.id = 'sandbox-gadget-styles';
                document.head.appendChild(styleEl);
            }
            if (styleEl.styleSheet) {
                styleEl.styleSheet.cssText = css;
            } else {
                styleEl.textContent = css;
            }
        }

        injectSandboxStyles();

        // --- host container selection / creation ---
        let $host = $('#' + PREFERRED_HOST_ID);
        if ($host.length === 0) {
            const $content = $('#mw-content-text, #bodyContent, .mw-parser-output').first();
            if ($content.length) {
                $content.prepend(
                    '<div id="' + FALLBACK_CONTAINER_ID + '" class="mw-sandbox-docked-host"></div>'
                );
            } else {
                $('body').prepend(
                    '<div id="' + FALLBACK_CONTAINER_ID + '" class="mw-sandbox-docked-host"></div>'
                );
            }
            $host = $('#' + FALLBACK_CONTAINER_ID);
        } else {
            $host.css({
                display: 'block',
                visibility: 'visible',
                position: 'relative',
                zIndex: 600
            });
            $host.addClass('mw-sandbox-docked-host');
        }

        // cleanup any prior instance
        $host.find('.sandbox-root').remove();

        try {
            $host.find('*').each(function (): void {
                const el = this as HTMLElement;
                if (el.removeAttribute) {
                    try {
                        el.removeAttribute('draggable');
                    } catch (e) {
                        /* ignore */
                    }
                }
                try {
                    el.ondragstart = null;
                } catch (e) {
                    /* ignore */
                }
                try {
                    el.onmousedown = null;
                } catch (e) {
                    /* ignore */
                }
                try {
                    el.ontouchstart = null;
                } catch (e) {
                    /* ignore */
                }
            });
            try {
                $host.off();
            } catch (e) {
                /* ignore */
            }
            try {
                $(document).off(
                    'mousemove.sandbox mouseup.sandbox mousedown.sandbox touchmove.sandbox touchend.sandbox'
                );
            } catch (e) {
                /* ignore */
            }
            try {
                $(document).off('mousemove touchmove mouseup touchend mousedown touchstart');
            } catch (e) {
                /* ignore */
            }
        } catch (e) {
            // ignore
        }

        // --- HTML template (with splitter) ---
        const fullHtml =
            '<div class="sandbox-root">' +
            '<div id="sandbox-window" class="sandbox-window">' +
            '<div class="sandbox-handle"><span class="sandbox-handle-title">📝 WikiText Sandbox</span></div>' +
            '<div class="sandbox-toolbar">' +
            '<button data-action="bold">Bold</button>' +
            '<button data-action="italic">Italic</button>' +
            '<button data-action="heading">Heading</button>' +
            '<button data-action="link">Link</button>' +
            '<button data-action="list">List</button>' +
            '<button data-action="template">Template</button>' +
            '<button data-action="table">Table</button>' +
            '<button data-action="clear">Clear</button>' +
            '<button data-action="example">Example</button>' +
            '<button data-action="save">Save</button>' +
            '<button data-action="load">Load</button>' +
            '</div>' +
            '<div class="sandbox-body">' +
            '<div class="sandbox-panels">' +
            // Left panel (source)
            '<div class="sandbox-panel">' +
            '<div class="sandbox-panel-header"><span>Source</span><span style="display:flex;gap:8px;align-items:center;margin-left:auto;"><span id="sandbox-char-count">0 / ' +
            MAX_CHARS +
            '</span><span id="sandbox-status">Ready</span></span></div>' +
            '<div class="sandbox-panel-content"><textarea id="sandbox-source" placeholder="Enter WikiText here... (max ' +
            MAX_CHARS +
            ' characters)"></textarea></div>' +
            '</div>' +
            // Splitter
            '<div class="sandbox-splitter" aria-hidden="true"></div>' +
            // Right panel (preview)
            '<div class="sandbox-panel">' +
            '<div class="sandbox-panel-header"><span>Preview — this shows a local rendering of your WikiText for testing. The layout may differ from live pages.</span></div>' +
            '<div class="sandbox-panel-content"><div class="sandbox-preview-wrapper"><div id="sandbox-preview">Preview will appear here...</div></div></div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';

        // Mobile message HTML
        const mobileMessageHtml =
            '<div class="sandbox-root"><div class="mw-sandbox-mobile-message">sandbox feature is currently not available for mobile and tablet user :(</div></div>';

        // core functionality variables
        let editor: CodeMirrorEditor | null = null;
        let updateTimeout: ReturnType<typeof setTimeout> | null = null;

        function setStatus(txt: string): void {
            $('#sandbox-status').text(txt);
        }

        function updateCharCount(text: string): void {
            $('#sandbox-char-count').text((text || '').length + ' / ' + MAX_CHARS);
        }

        function scheduleUpdate(text: string): void {
            setStatus('Typing...');
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            updateTimeout = setTimeout(function (): void {
                updatePreview(text);
            }, PARSE_DELAY);
        }

        function updatePreview(text: string): void {
            if (!text || !text.trim) {
                setStatus('Ready');
                $('#sandbox-preview').html('Preview will appear here...');
                return;
            }
            if (text.length > MAX_CHARS) {
                setStatus('Text too long');
                $('#sandbox-preview').html(
                    '<em>Text exceeds maximum length of ' + MAX_CHARS + ' characters</em>'
                );
                return;
            }
            setStatus('Parsing...');
            new mw.Api()
                .post({
                    action: 'parse',
                    text: text,
                    contentmodel: 'wikitext',
                    disablelimitreport: true,
                    format: 'json'
                })
                .done(function (data: ParseResponse): void {
                    if (data && data.parse && data.parse.text) {
                        $('#sandbox-preview').html(data.parse.text['*']);
                    } else {
                        $('#sandbox-preview').html('<em>Error: Empty response from API.</em>');
                    }
                    setStatus('Ready');
                })
                .fail(function (jqXHR: JQuery.jqXHR, textStatus: string): void {
                    setStatus('Error');
                    let err = 'Error parsing WikiText';
                    if (textStatus === 'timeout') {
                        err = 'Request timed out.';
                    } else if (jqXHR && jqXHR.status === 429) {
                        err = 'Too many requests.';
                    }
                    $('#sandbox-preview').html('<em>' + err + '</em>');
                });
        }

        function initEditor(): void {
            const ta = $('#sandbox-source').get(0) as HTMLTextAreaElement | undefined;
            if (!ta) {
                return;
            }
            if (typeof CodeMirror !== 'undefined') {
                try {
                    editor = CodeMirror.fromTextArea(ta, {
                        mode: 'text/mediawiki',
                        lineNumbers: true,
                        lineWrapping: true,
                        viewportMargin: Infinity
                    });
                    editor.on('change', function (cm: CodeMirrorEditor): void {
                        const text = cm.getValue();
                        updateCharCount(text);
                        if (text.length > MAX_CHARS) {
                            cm.setValue(text.substring(0, MAX_CHARS));
                            mw.notify('Character limit reached!', { type: 'warn' });
                            return;
                        }
                        scheduleUpdate(text);
                    });
                    editor.on(
                        'beforeChange',
                        function (cm: CodeMirrorEditor, change: CodeMirrorChange): void {
                            if (change.origin === 'paste') {
                                const currentLength = cm.getValue().length;
                                const pasteLength = change.text.join('\n').length;
                                if (currentLength + pasteLength > MAX_CHARS) {
                                    change.cancel();
                                    mw.notify('Paste would exceed maximum characters', {
                                        type: 'warn'
                                    });
                                }
                            }
                        }
                    );
                    return;
                } catch (e) {
                    editor = null;
                }
            }

            // fallback to plain textarea
            $('#sandbox-source')
                .on('input', function (): void {
                    const text = $(this).val() as string;
                    updateCharCount(text);
                    if (text.length > MAX_CHARS) {
                        $(this).val(text.substring(0, MAX_CHARS));
                        mw.notify('Character limit reached!', { type: 'warn' });
                        return;
                    }
                    scheduleUpdate(text);
                })
                .attr('maxlength', MAX_CHARS);
        }

        function insertMarkup(before: string, after: string): void {
            if (editor) {
                const sel = editor.getSelection();
                editor.replaceSelection(before + sel + after);
                editor.focus();
            } else {
                const ta = $('#sandbox-source').get(0) as HTMLTextAreaElement | undefined;
                if (!ta) return;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const text = ta.value;
                const sel = text.substring(start, end);
                const newText = text.substring(0, start) + before + sel + after + text.substring(end);
                if (newText.length > MAX_CHARS) {
                    mw.notify('Insertion would exceed max characters', { type: 'warn' });
                    return;
                }
                ta.value = newText;
                ta.focus();
                ta.selectionStart = start + before.length;
                ta.selectionEnd = start + before.length + sel.length;
                updateCharCount(newText);
                scheduleUpdate(newText);
            }
        }

        function bindUI(): void {
            $('.sandbox-toolbar button').on('click', function (): void {
                const buttonAction = $(this).data('action') as string;
                if (buttonAction === 'bold') {
                    insertMarkup("'''", "'''");
                    return;
                }
                if (buttonAction === 'italic') {
                    insertMarkup("''", "''");
                    return;
                }
                if (buttonAction === 'heading') {
                    insertMarkup('\n== ', ' ==\n');
                    return;
                }
                if (buttonAction === 'link') {
                    insertMarkup('[[', ']]');
                    return;
                }
                if (buttonAction === 'list') {
                    insertMarkup('\n* ', '');
                    return;
                }
                if (buttonAction === 'template') {
                    insertMarkup('{{', '}}');
                    return;
                }
                if (buttonAction === 'table') {
                    insertMarkup(
                        '{| class="wikitable"\n! Header 1\n! Header 2\n|-\n| Cell 1\n| Cell 2\n|}',
                        ''
                    );
                    return;
                }
                if (buttonAction === 'clear') {
                    if (confirm('Clear all content?')) {
                        if (editor && editor.setValue) editor.setValue('');
                        else $('#sandbox-source').val('');
                        scheduleUpdate('');
                    }
                    return;
                }
                if (buttonAction === 'example') {
                    const ex =
                        "== Example ==\nThis is '''bold''' and ''italic'' text.\n\n* List item\n* Another item\n\n[[Link]]\n\n{{Template|param=value}}";
                    if (editor && editor.setValue) editor.setValue(ex);
                    else $('#sandbox-source').val(ex);
                    scheduleUpdate(ex);
                    return;
                }
                if (buttonAction === 'save') {
                    const content = editor ? editor.getValue() : ($('#sandbox-source').val() as string);
                    try {
                        localStorage.setItem('mw-sandbox-content', content || '');
                        mw.notify('Content saved!', { type: 'success' });
                    } catch (e) {
                        mw.notify('Save failed', { type: 'error' });
                    }
                    return;
                }
                if (buttonAction === 'load') {
                    let saved = localStorage.getItem('mw-sandbox-content') || '';
                    if (saved.length > MAX_CHARS) saved = saved.substring(0, MAX_CHARS);
                    if (editor && editor.setValue) editor.setValue(saved);
                    else $('#sandbox-source').val(saved);
                    scheduleUpdate(saved);
                    mw.notify('Content loaded', { type: 'success' });
                    return;
                }
            });
        }

        // -------- responsive behavior & rendering --------

        function isMobile(): boolean {
            return (window.innerWidth || document.documentElement.clientWidth) < MOBILE_BREAKPOINT;
        }

        function computeAndApplyWidth(): void {
            try {
                const $contentCol = $('#mw-content-text, #bodyContent, .mw-parser-output').first();
                let contentWidth: number | null = null;
                if ($contentCol && $contentCol.length) {
                    const rect = ($contentCol.get(0) as HTMLElement).getBoundingClientRect();
                    if (rect && rect.width > 100) contentWidth = rect.width;
                }
                const viewport = window.innerWidth || document.documentElement.clientWidth;
                if (!contentWidth || contentWidth < 200) contentWidth = viewport - PAGE_SIDE_GAP;
                const desired = Math.round(
                    Math.max(
                        MIN_SANDBOX_WIDTH,
                        Math.min(MAX_SANDBOX_WIDTH, Math.floor(contentWidth * 0.92))
                    )
                );
                $host.css({
                    width: desired + 'px',
                    'max-width': '100%',
                    'box-sizing': 'border-box',
                    'margin-left': 'auto',
                    'margin-right': 'auto'
                });
            } catch (e) {
                /* ignore */
            }
        }

        function renderMobileMessage(): void {
            try {
                if (editor && editor.toTextArea) {
                    editor.toTextArea();
                    editor = null;
                }
            } catch (e) {
                /* ignore */
            }
            $host.empty().append(mobileMessageHtml);
            $host.css({ width: '100%', padding: '12px', 'box-sizing': 'border-box' });
        }

        // Modified applyMaxHeight -> explicitly set panel-content heights so preview scrollbar works
        function applyMaxHeight(): void {
            try {
                const hostEl = $host.get(0) as HTMLElement | undefined;
                if (!hostEl) return;
                const hostRect = hostEl.getBoundingClientRect();
                const top = hostRect.top;
                let avail = window.innerHeight - top - VIEWPORT_MARGIN;
                if (avail < 120) avail = 120;

                // set host height / max-height
                $host.css({ 'max-height': avail + 'px', overflow: 'hidden' });

                // For each panel, compute available area for panel-content (host avail minus header area)
                $host.find('.sandbox-panel').each(function (): void {
                    const $panel = $(this);
                    const panelHeader = $panel.find('.sandbox-panel-header').first();
                    const panelHeaderH = panelHeader.length ? panelHeader.outerHeight(true) || 0 : 0;
                    const toolbarH = $host.find('.sandbox-toolbar').first().length
                        ? $host.find('.sandbox-toolbar').first().outerHeight(true) || 0
                        : 0;
                    const handleH = $host.find('.sandbox-handle').first().length
                        ? $host.find('.sandbox-handle').first().outerHeight(true) || 0
                        : 0;

                    // available height for the panel content: avail - panelHeaderH - some padding, but ensure >= 80
                    let contentAvail = avail - panelHeaderH - toolbarH - handleH - 20;
                    if (contentAvail < 80) contentAvail = 80;

                    $panel.find('.sandbox-panel-content').css({
                        height: contentAvail + 'px',
                        'min-height': contentAvail + 'px'
                    });
                });

                if (editor && typeof editor.refresh === 'function') {
                    try {
                        editor.refresh();
                    } catch (e) {
                        /* ignore */
                    }
                }
            } catch (e) {
                /* ignore */
            }
        }

        // Splitter implementation
        function enableSplitter(): void {
            const $split = $host.find('.sandbox-splitter');
            const $left = $host.find('.sandbox-panels > .sandbox-panel').first();
            const $right = $host.find('.sandbox-panels > .sandbox-panel').last();
            if (!$split.length || !$left.length || !$right.length) return;

            let dragging = false;
            let startX = 0;
            let startLeftWidth = 0;

            $split.on('mousedown touchstart', function (e: JQuery.TriggeredEvent): void {
                e.preventDefault();
                dragging = true;
                const originalEvent = e.originalEvent as MouseEvent | TouchEvent;
                startX =
                    'touches' in originalEvent
                        ? originalEvent.touches[0].clientX
                        : (originalEvent as MouseEvent).clientX;
                startLeftWidth = $left.outerWidth() || 0;
                $('body').addClass('sandbox-splitting');
                $(document).on('mousemove.sandbox-splitter touchmove.sandbox-splitter', onDrag);
                $(document).on('mouseup.sandbox-splitter touchend.sandbox-splitter', stopDrag);
            });

            function onDrag(e: JQuery.TriggeredEvent): void {
                if (!dragging) return;
                const originalEvent = e.originalEvent as MouseEvent | TouchEvent;
                const clientX =
                    'touches' in originalEvent
                        ? originalEvent.touches[0].clientX
                        : (originalEvent as MouseEvent).clientX;
                const dx = clientX - startX;
                const hostW = $host.width() || window.innerWidth;
                const minPanel = 220;
                const newLeft = Math.max(minPanel, Math.min(startLeftWidth + dx, hostW - minPanel));
                $left.css({ flex: '0 0 ' + newLeft + 'px' });
                computeAndApplyWidth();
                applyMaxHeight();
                if (editor && typeof editor.refresh === 'function') {
                    try {
                        editor.refresh();
                    } catch (err) {
                        /* ignore */
                    }
                }
            }

            function stopDrag(): void {
                dragging = false;
                $('body').removeClass('sandbox-splitting');
                $(document).off('.sandbox-splitter');
                try {
                    localStorage.setItem('mw-sandbox-left-width', $left.css('flex-basis') || '');
                } catch (e) {
                    /* ignore */
                }
            }

            // restore saved width
            try {
                const saved = localStorage.getItem('mw-sandbox-left-width');
                if (saved) {
                    $left.css({ flex: '0 0 ' + saved });
                }
            } catch (e) {
                /* ignore */
            }
        }

        // sync editor scroll -> preview scroll (proportional)
        function enableScrollSync(): void {
            try {
                if (!editor || !editor.getScrollerElement) return;
                const cmScroller = editor.getScrollerElement();
                const $previewWrap = $host.find('.sandbox-preview-wrapper');
                if (!cmScroller || !$previewWrap.length) return;

                let last = 0;
                $(cmScroller).on('scroll', function (): void {
                    const now = Date.now();
                    if (now - last < 50) return;
                    last = now;
                    try {
                        const ratio =
                            cmScroller.scrollTop /
                            (cmScroller.scrollHeight - cmScroller.clientHeight || 1);
                        const previewEl = $previewWrap.get(0) as HTMLElement | undefined;
                        if (previewEl)
                            previewEl.scrollTop = Math.round(
                                ratio * (previewEl.scrollHeight - previewEl.clientHeight)
                            );
                    } catch (e) {
                        /* ignore */
                    }
                });
            } catch (e) {
                /* ignore */
            }
        }

        // Render full sandbox
        function renderFullSandbox(): void {
            $host.empty().append(fullHtml);
            computeAndApplyWidth();
            initEditor();
            bindUI();

            // enable splitter & scroll sync after DOM built & editor inited
            enableSplitter();
            enableScrollSync();

            // load saved content
            let savedText = localStorage.getItem('mw-sandbox-content') || '';
            if (savedText) {
                if (savedText.length > MAX_CHARS) savedText = savedText.substring(0, MAX_CHARS);
                if (editor && editor.setValue) editor.setValue(savedText);
                else $('#sandbox-source').val(savedText);
                updateCharCount(savedText);
                setTimeout(function (): void {
                    scheduleUpdate(savedText);
                }, 100);
            }

            // initial height application
            setTimeout(function (): void {
                applyMaxHeight();
            }, 50);
        }

        // initial render based on viewport
        let lastWasMobile = isMobile();
        if (lastWasMobile) {
            renderMobileMessage();
        } else {
            renderFullSandbox();
        }

        // initial apply & recompute
        applyMaxHeight();
        computeAndApplyWidth();

        // debounce resize handler - handles crossing breakpoint -> re-render appropriately
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        $(window).on('resize.sandbox', function (): void {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function (): void {
                try {
                    const nowMobile = isMobile();
                    if (nowMobile && !lastWasMobile) {
                        renderMobileMessage();
                    } else if (!nowMobile && lastWasMobile) {
                        renderFullSandbox();
                    } else {
                        if (!nowMobile) computeAndApplyWidth();
                        else $host.css({ width: '100%' });
                    }
                    lastWasMobile = nowMobile;
                    applyMaxHeight();
                } catch (e) {
                    /* ignore */
                }
            }, RESIZE_DEBOUNCE_MS);
        });

        // occasional defensive ticks
        let lateTicks = 0;
        const lateInterval = setInterval(function (): void {
            try {
                applyMaxHeight();
                if (!isMobile()) computeAndApplyWidth();
            } catch (e) {
                /* ignore */
            }
            lateTicks = lateTicks + 1;
            if (lateTicks > 6) clearInterval(lateInterval);
        }, 250);

        (function defensiveReset(): void {
            let ticks = 0;
            const interval = setInterval(function (): void {
                try {
                    $host.css({
                        left: 'auto',
                        top: 'auto',
                        right: 'auto',
                        bottom: 'auto',
                        transform: 'none',
                        position: 'relative'
                    });
                } catch (e) {
                    /* ignore */
                }
                ticks = ticks + 1;
                if (ticks > 5) clearInterval(interval);
            }, 200);
        })();
    }); // end $(function)
})(jQuery, mw);