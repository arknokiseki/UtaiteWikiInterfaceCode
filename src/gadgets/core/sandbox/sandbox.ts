interface CodeMirrorEditor {
    getValue: () => string;
    setValue: (value: string) => void;
    getCursor: () => { line: number; ch: number };
    setCursor: (pos: { line: number; ch: number }) => void;
    getSelection: () => string;
    replaceSelection: (replacement: string) => void;
    focus: () => void;
    refresh: () => void;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface CodeMirrorStatic {
    fromTextArea: (
        textarea: HTMLTextAreaElement,
        options: Record<string, unknown>
    ) => CodeMirrorEditor;
}

interface CodeMirrorChange {
    origin: string;
    text: string[];
    cancel: () => void;
}

interface SavedPosition {
    width: number;
    height: number;
    top: number;
    left: number;
}

interface MarkupMap {
    [key: string]: [string, string];
}

interface ParseResponse {
    parse: {
        text: {
            '*': string;
        };
    };
}

interface MwApi {
    post: (params: Record<string, unknown>) => JQuery.Promise<ParseResponse>;
}

declare const CodeMirror: CodeMirrorStatic | undefined;

declare const mw: {
    config: {
        get: (key: string) => string | number | null;
    };
    Api: new () => MwApi;
    notify: (
        message: string,
        options?: { type?: string; autoHide?: boolean }
    ) => void;
};

declare const mediaWiki: typeof mw;

(function ($: JQueryStatic, mw: typeof mediaWiki): void {
    'use strict';

    if (
        document.body.classList.contains('mw-mf') ||
        document.body.classList.contains('is-mobile-device')
    ) {
        return;
    }

    const SandboxEditor = {
        editor: null as CodeMirrorEditor | null,
        updateTimeout: null as ReturnType<typeof setTimeout> | null,
        isDragging: false,
        isResizing: false,
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0,
        startLeft: 0,
        startTop: 0,
        maxCharacters: 30000,
        parseDelay: 2000,

        /**
         * Check if we should load the sandbox
         */
        shouldLoad: function (): boolean {
            // Check if page exists
            if (mw.config.get('wgArticleId') === 0) {
                return false;
            }

            // Only load on view mode (no action parameter or action=view)
            const action = mw.config.get('wgAction') as string;
            const allowedActions = ['view', 'purge']; // purge still shows content
            if (!allowedActions.includes(action)) {
                return false;
            }

            // Additional check for URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const urlAction = urlParams.get('action');
            if (urlAction && urlAction !== 'view' && urlAction !== 'purge') {
                return false;
            }

            // Check if we're on Tutorial page or subpage
            const pageName = mw.config.get('wgPageName') as string;
            if (!pageName.startsWith('Utaite_Wiki:Tutorial')) {
                return false;
            }

            return true;
        },

        /**
         * Initialize the sandbox
         */
        init: function (): void {
            if (!this.shouldLoad()) {
                return;
            }

            this.createToggleButton();
            this.buildInterface();
            this.initializeEditor();
            this.bindEvents();
            this.loadFromStorage();
        },

        /**
         * Create toggle button
         */
        createToggleButton: function (): void {
            const self = this;
            const $button = $('<div>')
                .addClass('sandbox-toggle-btn')
                .text('📝 Sandbox Editor')
                .on('click', function (): void {
                    self.toggle();
                });

            $('body').append($button);
        },

        /**
         * Build the interface
         */
        buildInterface: function (): void {
            const html =
                '<div id="sandbox-container">' +
                '<div class="sandbox-handle">' +
                '<span class="sandbox-handle-title">📝 WikiText Sandbox</span>' +
                '<div class="sandbox-controls">' +
                '<span class="sandbox-control-btn" data-action="minimize">−</span>' +
                '<span class="sandbox-control-btn" data-action="maximize">□</span>' +
                '<span class="sandbox-control-btn" data-action="close">×</span>' +
                '</div>' +
                '</div>' +
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
                '<button data-action="reset-position">Reset Position</button>' +
                '</div>' +
                '<div class="sandbox-body">' +
                '<div class="sandbox-panels">' +
                '<div class="sandbox-panel">' +
                '<div class="sandbox-panel-header">' +
                '<span>Source</span>' +
                '<span class="sandbox-char-count" id="sandbox-char-count">0 / ' +
                this.maxCharacters +
                '</span>' +
                '<span class="sandbox-status" id="sandbox-status">Ready</span>' +
                '</div>' +
                '<div class="sandbox-panel-content">' +
                '<textarea id="sandbox-source" placeholder="Enter WikiText here... (max ' +
                this.maxCharacters +
                ' characters)"></textarea>' +
                '</div>' +
                '</div>' +
                '<div class="sandbox-panel">' +
                '<div class="sandbox-panel-header">' +
                '<span>Preview</span>' +
                '</div>' +
                '<div class="sandbox-panel-content">' +
                '<div id="sandbox-preview">Preview will appear here...</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="sandbox-resize-handle"></div>' +
                '</div>';

            $('body').append(html);

            // Load saved position with validation
            this.loadPosition();
        },

        /**
         * Initialize editor (CodeMirror or textarea)
         */
        initializeEditor: function (): void {
            const textarea = document.getElementById('sandbox-source') as HTMLTextAreaElement | null;
            const self = this;

            if (!textarea) {
                console.error('[SandboxEditor] Could not find textarea element');
                return;
            }

            if (typeof CodeMirror !== 'undefined') {
                try {
                    this.editor = CodeMirror.fromTextArea(textarea, {
                        mode: 'text/mediawiki',
                        lineNumbers: true,
                        lineWrapping: true,
                        viewportMargin: Infinity,
                        maxLength: this.maxCharacters
                    });

                    this.editor.on('change', function (cm: CodeMirrorEditor): void {
                        const text = cm.getValue();
                        self.updateCharCount(text);

                        // Check character limit
                        if (text.length > self.maxCharacters) {
                            const truncated = text.substring(0, self.maxCharacters);
                            cm.setValue(truncated);
                            self.showLimitWarning();
                            return;
                        }

                        self.scheduleUpdate(text);
                    });

                    // Prevent paste if it would exceed limit
                    this.editor.on(
                        'beforeChange',
                        function (cm: CodeMirrorEditor, change: CodeMirrorChange): void {
                            if (change.origin === 'paste') {
                                const currentLength = cm.getValue().length;
                                const pasteLength = change.text.join('\n').length;
                                if (currentLength + pasteLength > self.maxCharacters) {
                                    change.cancel();
                                    self.showLimitWarning();
                                }
                            }
                        }
                    );
                } catch (e) {
                    // Fallback to textarea
                    this.setupTextarea();
                }
            } else {
                this.setupTextarea();
            }
        },

        /**
         * Setup plain textarea
         */
        setupTextarea: function (): void {
            const self = this;
            $('#sandbox-source').on('input', function (): void {
                const text = $(this).val() as string;
                self.updateCharCount(text);

                // Check character limit
                if (text.length > self.maxCharacters) {
                    $(this).val(text.substring(0, self.maxCharacters));
                    self.showLimitWarning();
                    return;
                }

                self.scheduleUpdate(text);
            });

            // Set maxlength attribute for textarea
            $('#sandbox-source').attr('maxlength', this.maxCharacters);
        },

        /**
         * Update character count display
         */
        updateCharCount: function (text: string): void {
            const count = text.length;
            const $counter = $('#sandbox-char-count');

            $counter.text(count + ' / ' + this.maxCharacters);

            // Add warning color when approaching limit
            if (count > this.maxCharacters * 0.9) {
                $counter.css('color', '#ff6600');
            } else if (count > this.maxCharacters * 0.8) {
                $counter.css('color', '#ffaa00');
            } else {
                $counter.css('color', '');
            }
        },

        /**
         * Show character limit warning
         */
        showLimitWarning: function (): void {
            mw.notify(
                'Character limit reached! Maximum ' + this.maxCharacters + ' characters allowed.',
                {
                    type: 'warn',
                    autoHide: true
                }
            );
        },

        /**
         * Bind all events
         */
        bindEvents: function (): void {
            const $container = $('#sandbox-container');
            const self = this;

            // Dragging
            $('.sandbox-handle').on('mousedown', function (e: JQuery.MouseDownEvent): void {
                if ($(e.target).hasClass('sandbox-control-btn')) return;

                self.isDragging = true;
                self.startX = e.clientX;
                self.startY = e.clientY;

                const position = $container.position();
                self.startLeft = position.left;
                self.startTop = position.top;

                e.preventDefault();
            });

            // Resizing
            $('.sandbox-resize-handle').on('mousedown', function (e: JQuery.MouseDownEvent): void {
                self.isResizing = true;
                self.startX = e.clientX;
                self.startY = e.clientY;
                self.startWidth = $container.width() || 0;
                self.startHeight = $container.height() || 0;

                e.preventDefault();
            });

            // Mouse move
            $(document).on('mousemove', function (e: JQuery.MouseMoveEvent): void {
                if (self.isDragging) {
                    const dx = e.clientX - self.startX;
                    const dy = e.clientY - self.startY;

                    let newLeft = self.startLeft + dx;
                    let newTop = self.startTop + dy;

                    // Ensure window stays within viewport
                    const maxLeft = ($(window).width() || 0) - ($container.width() || 0);
                    const maxTop = ($(window).height() || 0) - ($container.height() || 0);

                    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                    newTop = Math.max(0, Math.min(newTop, maxTop));

                    $container.css({
                        left: newLeft + 'px',
                        top: newTop + 'px',
                        right: 'auto',
                        bottom: 'auto'
                    });
                } else if (self.isResizing) {
                    const dx = e.clientX - self.startX;
                    const dy = e.clientY - self.startY;

                    let newWidth = Math.max(400, self.startWidth + dx);
                    let newHeight = Math.max(300, self.startHeight + dy);

                    // Ensure resized window doesn't go off screen
                    const maxWidth = ($(window).width() || 0) - $container.position().left;
                    const maxHeight = ($(window).height() || 0) - $container.position().top;

                    newWidth = Math.min(newWidth, maxWidth);
                    newHeight = Math.min(newHeight, maxHeight);

                    $container.css({
                        width: newWidth + 'px',
                        height: newHeight + 'px'
                    });

                    if (self.editor && self.editor.refresh) {
                        self.editor.refresh();
                    }
                }
            });

            // Mouse up
            $(document).on('mouseup', function (): void {
                if (self.isDragging || self.isResizing) {
                    self.isDragging = false;
                    self.isResizing = false;
                    self.savePosition();
                }
            });

            // Control buttons
            $('.sandbox-control-btn').on('click', function (): void {
                const action = $(this).data('action') as string;
                switch (action) {
                    case 'minimize':
                        self.minimize();
                        break;
                    case 'maximize':
                        self.maximize();
                        break;
                    case 'close':
                        self.close();
                        break;
                }
            });

            // Toolbar buttons
            $('.sandbox-toolbar button').on('click', function (): void {
                const action = $(this).data('action') as string;
                self.handleAction(action);
            });

            // Window resize - revalidate position
            $(window).on('resize', function (): void {
                self.validatePosition();
            });
        },

        /**
         * Handle toolbar actions
         */
        handleAction: function (action: string): void {
            const markups: MarkupMap = {
                bold: ["'''", "'''"],
                italic: ["''", "''"],
                heading: ['== ', ' =='],
                link: ['[[', ']]'],
                list: ['* ', ''],
                template: ['{{', '}}'],
                table: [
                    '{| class="wikitable"\n! ',
                    '\n! Header 2\n|-\n| Cell 1\n| Cell 2\n|}'
                ]
            };

            switch (action) {
                case 'clear':
                    this.clearEditor();
                    break;
                case 'example':
                    this.loadExample();
                    break;
                case 'save':
                    this.saveContent();
                    break;
                case 'load':
                    this.loadContent();
                    break;
                case 'reset-position':
                    this.resetPosition();
                    break;
                default:
                    if (markups[action]) {
                        this.insertMarkup(markups[action][0], markups[action][1]);
                    }
            }
        },

        /**
         * Insert markup at cursor
         */
        insertMarkup: function (before: string, after: string): void {
            if (this.editor && this.editor.getValue) {
                const currentText = this.editor.getValue();
                const cursor = this.editor.getCursor();
                const selection = this.editor.getSelection();

                // Check if insertion would exceed limit
                const newLength = currentText.length + before.length + after.length;
                if (newLength > this.maxCharacters) {
                    this.showLimitWarning();
                    return;
                }

                this.editor.replaceSelection(before + selection + after);
                if (!selection) {
                    this.editor.setCursor({ line: cursor.line, ch: cursor.ch + before.length });
                }
                this.editor.focus();
            } else {
                const textarea = document.getElementById('sandbox-source') as HTMLTextAreaElement | null;
                if (!textarea) return;

                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const text = textarea.value;
                const selectedText = text.substring(start, end);

                // Check if insertion would exceed limit
                const newText =
                    text.substring(0, start) + before + selectedText + after + text.substring(end);
                if (newText.length > this.maxCharacters) {
                    this.showLimitWarning();
                    return;
                }

                textarea.value = newText;
                textarea.focus();

                if (!selectedText) {
                    textarea.selectionStart = textarea.selectionEnd = start + before.length;
                }

                this.updateCharCount(newText);
                this.scheduleUpdate(newText);
            }
        },

        /**
         * Schedule preview update with rate limiting
         */
        scheduleUpdate: function (text: string): void {
            const self = this;
            $('#sandbox-status').text('Typing...');

            if (this.updateTimeout) {
                clearTimeout(this.updateTimeout);
            }
            this.updateTimeout = setTimeout(function (): void {
                self.updatePreview(text);
            }, this.parseDelay); // Now uses 2 second delay
        },

        /**
         * Update preview
         */
        updatePreview: function (text: string): void {
            // Don't parse if text is too long
            if (text.length > this.maxCharacters) {
                $('#sandbox-status').text('Text too long');
                $('#sandbox-preview').html(
                    '<em>Text exceeds maximum length of ' + this.maxCharacters + ' characters</em>'
                );
                return;
            }

            // Don't parse empty text
            if (!text.trim()) {
                $('#sandbox-status').text('Ready');
                $('#sandbox-preview').html('Preview will appear here...');
                return;
            }

            $('#sandbox-status').text('Parsing...');

            new mw.Api()
                .post({
                    action: 'parse',
                    text: text,
                    contentmodel: 'wikitext',
                    disablelimitreport: true,
                    format: 'json'
                })
                .done(function (data: ParseResponse): void {
                    $('#sandbox-preview').html(data.parse.text['*']);
                    $('#sandbox-status').text('Ready');
                })
                .fail(function (
                    jqXHR: JQuery.jqXHR,
                    textStatus: string,
                    _errorThrown: string
                ): void {
                    $('#sandbox-status').text('Error');
                    let errorMsg = 'Error parsing WikiText';
                    if (textStatus === 'timeout') {
                        errorMsg = 'Request timed out. Text may be too complex.';
                    } else if (jqXHR.status === 429) {
                        errorMsg = 'Too many requests. Please slow down.';
                    }
                    $('#sandbox-preview').html('<em>' + errorMsg + '</em>');
                });
        },

        /**
         * Window controls
         */
        toggle: function (): void {
            $('#sandbox-container').toggle();
            if ($('#sandbox-container').is(':visible')) {
                this.validatePosition();
                if (this.editor && this.editor.refresh) {
                    this.editor.refresh();
                }
            }
        },

        minimize: function (): void {
            $('#sandbox-container').toggleClass('minimized');
        },

        maximize: function (): void {
            const $container = $('#sandbox-container');
            if ($container.css('width') === $(window).width() + 'px') {
                this.loadPosition();
            } else {
                $container.css({
                    width: $(window).width() + 'px',
                    height: $(window).height() + 'px',
                    top: 0,
                    left: 0,
                    right: 'auto',
                    bottom: 'auto'
                });
            }
            if (this.editor && this.editor.refresh) {
                this.editor.refresh();
            }
        },

        close: function (): void {
            $('#sandbox-container').hide();
        },

        /**
         * Clear editor
         */
        clearEditor: function (): void {
            if (!confirm('Clear all content?')) return;

            if (this.editor && this.editor.setValue) {
                this.editor.setValue('');
            } else {
                $('#sandbox-source').val('');
            }
            this.updateCharCount('');
            this.updatePreview('');
        },

        /**
         * Load example
         */
        loadExample: function (): void {
            const example =
                "== Example ==\n" +
                "This is '''bold''' and ''italic'' text.\n\n" +
                '* List item\n' +
                '* Another item\n\n' +
                '[[Link]] to a page\n\n' +
                '{{Template|param=value}}';

            if (this.editor && this.editor.setValue) {
                this.editor.setValue(example);
            } else {
                $('#sandbox-source').val(example);
            }
            this.updateCharCount(example);
            this.updatePreview(example);
        },

        /**
         * Storage functions
         */
        saveContent: function (): void {
            const content = this.editor
                ? this.editor.getValue()
                : ($('#sandbox-source').val() as string);

            // Check size before saving
            if (content.length > this.maxCharacters) {
                mw.notify(
                    'Content too long to save! Maximum ' + this.maxCharacters + ' characters.',
                    { type: 'error' }
                );
                return;
            }

            try {
                localStorage.setItem('mw-sandbox-content', content);
                mw.notify('Content saved! (' + content.length + ' characters)', {
                    type: 'success'
                });
            } catch (e) {
                mw.notify('Failed to save content. Storage may be full.', { type: 'error' });
            }
        },

        loadContent: function (): void {
            let saved = localStorage.getItem('mw-sandbox-content');
            if (saved) {
                // Validate saved content length
                if (saved.length > this.maxCharacters) {
                    saved = saved.substring(0, this.maxCharacters);
                    mw.notify(
                        'Loaded content was truncated to ' + this.maxCharacters + ' characters',
                        { type: 'warn' }
                    );
                }

                if (this.editor) {
                    this.editor.setValue(saved);
                } else {
                    $('#sandbox-source').val(saved);
                }
                this.updateCharCount(saved);
                this.updatePreview(saved);
                mw.notify('Content loaded! (' + saved.length + ' characters)', {
                    type: 'success'
                });
            } else {
                mw.notify('No saved content found', { type: 'info' });
            }
        },

        /**
         * Position management
         */
        savePosition: function (): void {
            const $container = $('#sandbox-container');
            const position = $container.position();

            localStorage.setItem(
                'mw-sandbox-position',
                JSON.stringify({
                    width: $container.width(),
                    height: $container.height(),
                    top: position.top,
                    left: position.left
                })
            );
        },

        loadPosition: function (): void {
            const saved = localStorage.getItem('mw-sandbox-position');
            if (saved) {
                try {
                    const pos = JSON.parse(saved) as SavedPosition;
                    this.applyPosition(pos);
                } catch (e) {
                    this.resetPosition();
                }
            } else {
                this.resetPosition();
            }
        },

        applyPosition: function (pos: SavedPosition): void {
            const $container = $('#sandbox-container');
            const windowWidth = $(window).width() || 0;
            const windowHeight = $(window).height() || 0;

            // Validate and adjust position
            const width = Math.min(pos.width, windowWidth - 20);
            const height = Math.min(pos.height, windowHeight - 20);
            const left = Math.max(0, Math.min(pos.left, windowWidth - width));
            const top = Math.max(0, Math.min(pos.top, windowHeight - height));

            $container.css({
                width: width + 'px',
                height: height + 'px',
                top: top + 'px',
                left: left + 'px',
                right: 'auto',
                bottom: 'auto'
            });
        },

        validatePosition: function (): void {
            const $container = $('#sandbox-container');
            if (!$container.is(':visible')) return;

            const position = $container.position();
            const width = $container.width() || 0;
            const height = $container.height() || 0;

            this.applyPosition({
                width: width,
                height: height,
                top: position.top,
                left: position.left
            });
        },

        resetPosition: function (): void {
            const $container = $('#sandbox-container');
            $container.css({
                width: '800px',
                height: '500px',
                top: '50px',
                right: '20px',
                left: 'auto',
                bottom: 'auto'
            });
            this.savePosition();
            mw.notify('Position reset!', { type: 'success' });
        },

        loadFromStorage: function (): void {
            let saved = localStorage.getItem('mw-sandbox-content');
            if (saved) {
                // Validate saved content length
                if (saved.length > this.maxCharacters) {
                    saved = saved.substring(0, this.maxCharacters);
                }

                if (this.editor) {
                    this.editor.setValue(saved);
                } else {
                    $('#sandbox-source').val(saved);
                }
                this.updateCharCount(saved);
            }
        }
    };

    // Initialize when ready
    $(function (): void {
        SandboxEditor.init();
    });
})(jQuery, mw);