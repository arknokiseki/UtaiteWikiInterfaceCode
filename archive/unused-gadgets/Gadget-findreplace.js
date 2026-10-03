/**
 * MediaWiki CodeMirror custom Find and Replace Tool
 * version 2.0.0 (ES6+ Refactor)
 */
(() => {
    'use strict';
    // console.log("FindReplace 2.0.0");

    /**
     * Waits for the necessary MediaWiki environment and dependencies to be ready.
     */
    const initFindReplace = () => {
        if (!window.mw || !window.$ || !window.CodeMirror) {
            setTimeout(initFindReplace, 100);
            return;
        }

        class FindReplaceDialog {
            constructor(codeMirror) {
                this.cm = codeMirror;
                this.searchTerm = '';
                this.replaceTerm = '';
                this.caseSensitive = false;
                this.useRegex = false;
                this.wholeWord = false;
                this.currentMatch = -1;
                this.matches = [];
                this.decorations = [];
                this.isOpen = false;
                this.searchTimeout = null;
                this.cachedRegex = null;
                this.cachedRegexKey = '';

                this.addStyles();
                this.createDialog();
                this.bindEvents();
            }

            /**
             * Adds the necessary CSS styles to the document head.
             */
            addStyles() {
                if (document.getElementById('find-replace-enhanced-css')) return;

                const css = `
                    /* Base styles */
                    #find-replace-dialog {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        font-size: 13px;
                        line-height: 1.4;
                    }
                    /* Day theme */
                    .skin-theme-clientpref-day #find-replace-dialog {
                        background: #ffffff; border: 1px solid #d0d7de; color: #24292f;
                        box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
                    }
                    .skin-theme-clientpref-day #find-replace-dialog input {
                        background: #ffffff; border: 1px solid #d0d7de; color: #24292f;
                    }
                    .skin-theme-clientpref-day #find-replace-dialog input:focus {
                        border-color: #0969da; box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
                    }
                    .skin-theme-clientpref-day #find-replace-dialog button {
                        background: #f6f8fa; border: 1px solid #d0d7de; color: #24292f;
                    }
                    .skin-theme-clientpref-day #find-replace-dialog button:hover {
                        background: #f3f4f6; border-color: #d0d7de;
                    }
                    .skin-theme-clientpref-day #find-replace-dialog button:active { background: #e5e7ea; }
                    /* Night theme */
                    .skin-theme-clientpref-night #find-replace-dialog {
                        background: #0d1117; border: 1px solid #30363d; color: #f0f6fc;
                        box-shadow: 0 8px 24px rgba(1, 4, 9, 0.8);
                    }
                    .skin-theme-clientpref-night #find-replace-dialog input {
                        background: #21262d; border: 1px solid #30363d; color: #f0f6fc;
                    }
                    .skin-theme-clientpref-night #find-replace-dialog input:focus {
                        border-color: #58a6ff; box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
                    }
                    .skin-theme-clientpref-night #find-replace-dialog button {
                        background: #21262d; border: 1px solid #30363d; color: #f0f6fc;
                    }
                    .skin-theme-clientpref-night #find-replace-dialog button:hover {
                        background: #30363d; border-color: #484f58;
                    }
                    .skin-theme-clientpref-night #find-replace-dialog button:active { background: #262c36; }
                    /* Enhanced input styles */
                    #find-replace-dialog input {
                        transition: all 0.15s ease; outline: none; padding: 8px 12px;
                        border-radius: 6px; font-size: 13px;
                    }
                    #find-replace-dialog button {
                        transition: all 0.15s ease; outline: none; padding: 8px 12px;
                        border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;
                    }
                    /* Match highlighting */
                    .cm-find-match {
                        background-color: rgba(255, 195, 0, 0.4); border: 1px solid rgba(255, 195, 0, 0.8);
                        border-radius: 2px;
                    }
                    .cm-find-current-match {
                        background-color: rgba(255, 95, 0, 0.6) !important; border: 1px solid rgba(255, 95, 0, 1) !important;
                        border-radius: 2px;
                    }
                    /* Night theme match colors */
                    .skin-theme-clientpref-night .cm-find-match {
                        background-color: rgba(255, 208, 0, 0.3); border-color: rgba(255, 208, 0, 0.6);
                    }
                    .skin-theme-clientpref-night .cm-find-current-match {
                        background-color: rgba(255, 120, 0, 0.5) !important; border-color: rgba(255, 120, 0, 0.8) !important;
                    }
                    /* Smooth animations */
                    #find-replace-dialog {
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        transform-origin: top right;
                    }
                    #find-replace-dialog[data-state="entering"] { animation: slideInScale 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
                    #find-replace-dialog[data-state="leaving"] { animation: slideOutScale 0.15s cubic-bezier(0.4, 0, 1, 1); }
                    @keyframes slideInScale {
                        from { opacity: 0; transform: scale(0.95) translateY(-10px); }
                        to { opacity: 1; transform: scale(1) translateY(0); }
                    }
                    @keyframes slideOutScale {
                        from { opacity: 1; transform: scale(1) translateY(0); }
                        to { opacity: 0; transform: scale(0.95) translateY(-10px); }
                    }
                    /* Match counter styling */
                    #match-count { font-size: 11px; opacity: 0.7; font-weight: 500; }
                    /* Icon buttons */
                    .icon-button {
                        width: 32px !important; height: 32px !important; padding: 0 !important;
                        display: flex !important; align-items: center !important; justify-content: center !important;
                        font-size: 16px !important; line-height: 1 !important;
                    }
                    /* Checkbox styling */
                    #find-replace-dialog input[type="checkbox"] {
                        width: 16px; height: 16px; margin-right: 8px; accent-color: #0969da;
                    }
                    .skin-theme-clientpref-night #find-replace-dialog input[type="checkbox"] { accent-color: #58a6ff; }
                `;
                const styleEl = document.createElement('style');
                styleEl.id = 'find-replace-enhanced-css';
                styleEl.textContent = css;
                document.head.appendChild(styleEl);
            }

            /**
             * Creates and appends the dialog HTML to the body.
             */
            createDialog() {
                const dialogHtml = `
                    <div id="find-replace-dialog" style="display: none; position: fixed; top: 60px; right: 20px; z-index: 1000; border-radius: 8px; padding: 16px; min-width: 320px; max-width: 400px;">
                        <div class="find-replace-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; font-size: 14px;">Find and Replace</span>
                            <button id="find-replace-close" class="icon-button" title="Close (Escape)">&times;</button>
                        </div>
                        <div class="find-replace-content">
                            <div class="find-section" style="margin-bottom: 12px;">
                                <div style="display: flex; margin-bottom: 8px; gap: 6px;">
                                    <input type="text" id="find-input" placeholder="Find..." style="flex: 1;">
                                    <button id="find-prev" class="icon-button" title="Previous (Shift+Enter)">↑</button>
                                    <button id="find-next" class="icon-button" title="Next (Enter)">↓</button>
                                </div>
                                <div id="match-count" style="margin-bottom: 8px; padding-left: 4px;">0 results</div>
                            </div>
                            <div class="replace-section" style="margin-bottom: 16px;">
                                <div style="display: flex; margin-bottom: 8px; gap: 6px;">
                                    <input type="text" id="replace-input" placeholder="Replace..." style="flex: 1;">
                                    <button id="replace-one" style="padding: 8px 16px; font-size: 12px;">Replace</button>
                                    <button id="replace-all" style="padding: 8px 16px; font-size: 12px;">All</button>
                                </div>
                            </div>
                            <div class="options-section" style="display: flex; flex-wrap: wrap; gap: 16px;">
                                <label style="display: flex; align-items: center; font-size: 12px; cursor: pointer;">
                                    <input type="checkbox" id="case-sensitive"> Case sensitive
                                </label>
                                <label style="display: flex; align-items: center; font-size: 12px; cursor: pointer;">
                                    <input type="checkbox" id="whole-word"> Whole word
                                </label>
                                <label style="display: flex; align-items: center; font-size: 12px; cursor: pointer;">
                                    <input type="checkbox" id="use-regex"> Regex
                                </label>
                            </div>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', dialogHtml);

                // Cache jQuery elements
                this.$dialog = $('#find-replace-dialog');
                this.$findInput = $('#find-input');
                this.$replaceInput = $('#replace-input');
                this.$matchCount = $('#match-count');
            }

            /**
             * Binds all the necessary event listeners.
             */
            bindEvents() {
                $('#find-replace-close').on('click', () => this.close());

                // Find input with debouncing
                this.$findInput.on('input', (e) => {
                    this.searchTerm = e.target.value;
                    clearTimeout(this.searchTimeout);
                    this.searchTimeout = setTimeout(() => this.performSearch(), 300);
                });

                this.$findInput.on('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        clearTimeout(this.searchTimeout);
                        this.performSearch();
                        e.shiftKey ? this.findPrevious() : this.findNext();
                    } else if (e.key === 'Escape') {
                        this.close();
                    }
                });

                // Replace input
                this.$replaceInput.on('input', (e) => {
                    this.replaceTerm = e.target.value;
                });

                this.$replaceInput.on('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.replaceOne();
                    } else if (e.key === 'Escape') {
                        this.close();
                    }
                });

                // Navigation and Replace buttons
                $('#find-prev').on('click', () => this.findPrevious());
                $('#find-next').on('click', () => this.findNext());
                $('#replace-one').on('click', () => this.replaceOne());
                $('#replace-all').on('click', () => this.replaceAll());

                // Options handling
                const optionChangeHandler = () => {
                    this.caseSensitive = $('#case-sensitive').is(':checked');
                    this.wholeWord = $('#whole-word').is(':checked');
                    this.useRegex = $('#use-regex').is(':checked');
                    this.cachedRegex = null; // Invalidate cache
                    if (this.searchTerm) {
                        clearTimeout(this.searchTimeout);
                        this.searchTimeout = setTimeout(() => this.performSearch(), 300);
                    }
                };
                $('#case-sensitive, #whole-word, #use-regex').on('change', optionChangeHandler);

                // Keyboard shortcuts
                const existingKeys = this.cm.getOption("extraKeys") || {};
                this.cm.setOption("extraKeys", Object.assign({}, existingKeys, {
				    "Ctrl-F": () => { this.open(); return false; },
				    "Cmd-F": () => { this.open(); return false; },
				    "Ctrl-H": () => { this.open(true); return false; },
				    "Cmd-H": () => { this.open(true); return false; },
				    "F3": () => { this.findNext(); return false; },
				    "Shift-F3": () => { this.findPrevious(); return false; }
				}));

                // Close on outside click
                setTimeout(() => {
                    $(document).on('click.find-replace', (e) => {
                        if (this.isOpen && !$(e.target).closest('#find-replace-dialog').length) {
                            this.close();
                        }
                    });
                }, 100);
            }

            open(focusReplace = false) {
                this.isOpen = true;
                this.$dialog.attr('data-state', 'entering').show();
                setTimeout(() => this.$dialog.removeAttr('data-state'), 200);

                const input = focusReplace ? this.$replaceInput : this.$findInput;
                setTimeout(() => {
                    input.focus();
                    if (!focusReplace) input.select();
                }, 50);

                const selection = this.cm.getSelection();
                if (selection && !focusReplace) {
                    this.$findInput.val(selection);
                    this.searchTerm = selection;
                    this.performSearch();
                }
            }

            close() {
                this.isOpen = false;
                clearTimeout(this.searchTimeout);
                this.$dialog.attr('data-state', 'leaving');
                setTimeout(() => {
                    this.$dialog.hide().removeAttr('data-state');
                    this.clearHighlights();
                    this.cm.focus();
                }, 150);
                $(document).off('click.find-replace');
            }

            performSearch() {
                this.clearHighlights();
                if (!this.searchTerm) {
                    this.updateMatchCount(0);
                    return;
                }

                try {
                    this.matches = [];
                    const content = this.cm.getValue();
                    const searchRegex = this.buildSearchRegex();
                    if (!searchRegex) {
                        this.updateMatchCount(0);
                        return;
                    }

                    let match;
                    const maxMatches = 5000;
                    while ((match = searchRegex.exec(content)) !== null && this.matches.length < maxMatches) {
                        if (match[0].length === 0) {
                            searchRegex.lastIndex++; // Avoid infinite loops on zero-length matches
                            continue;
                        }
                        const from = this.cm.posFromIndex(match.index);
                        const to = this.cm.posFromIndex(match.index + match[0].length);
                        this.matches.push({ from, to, text: match[0] });
                    }

                    this.highlightMatches();
                    this.updateMatchCount(this.matches.length);

                    if (this.matches.length > 0) {
                        this.currentMatch = 0;
                        this.jumpToMatch(0, false);
                    } else {
                        this.currentMatch = -1;
                    }

                } catch (error) {
                    console.warn('Search error:', error);
                    this.updateMatchCount(0);
                }
            }

            buildSearchRegex() {
                const cacheKey = `${this.searchTerm}|${this.caseSensitive}|${this.useRegex}|${this.wholeWord}`;
                if (this.cachedRegex && this.cachedRegexKey === cacheKey) {
                    this.cachedRegex.lastIndex = 0;
                    return this.cachedRegex;
                }

                try {
                    let pattern = this.searchTerm;
                    const flags = `g${this.caseSensitive ? '' : 'i'}`;

                    if (!this.useRegex) {
                        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    }

                    if (this.wholeWord) {
                        pattern = `\\b${pattern}\\b`;
                    }
                    
                    this.cachedRegex = new RegExp(pattern, flags);
                    this.cachedRegexKey = cacheKey;
                    return this.cachedRegex;

                } catch (e) {
                    console.warn('Invalid regex:', e.message);
                    this.$matchCount.text('Invalid regex pattern');
                    return null;
                }
            }
            
            highlightMatches() {
                this.cm.operation(() => {
                    this.decorations = this.matches.map(match =>
                        this.cm.markText(match.from, match.to, { className: 'cm-find-match' })
                    );
                });
            }

            clearHighlights() {
                if (this.decorations.length === 0) return;
                this.cm.operation(() => {
                    this.decorations.forEach(marker => marker.clear());
                });
                this.decorations = [];
            }

            jumpToMatch(index, scroll = true) {
                if (index < 0 || index >= this.matches.length) return;
                
                this.cm.operation(() => {
                    // Optimized re-highlighting
                    if (this.decorations[this.currentMatch]) {
                         this.decorations[this.currentMatch].clear();
                         this.decorations[this.currentMatch] = this.cm.markText(this.matches[this.currentMatch].from, this.matches[this.currentMatch].to, { className: 'cm-find-match' });
                    }
                    if (this.decorations[index]) {
                        this.decorations[index].clear();
                        this.decorations[index] = this.cm.markText(this.matches[index].from, this.matches[index].to, { className: 'cm-find-current-match' });
                    }
                });

                this.currentMatch = index;
                const match = this.matches[index];
                this.cm.setSelection(match.from, match.to);
                if (scroll) {
                    this.cm.scrollIntoView(match.from, 100);
                }
                this.updateMatchCount(this.matches.length, index + 1);
            }

            findNext() {
                if (this.matches.length === 0) return;
                const nextIndex = (this.currentMatch + 1) % this.matches.length;
                this.jumpToMatch(nextIndex);
            }

            findPrevious() {
                if (this.matches.length === 0) return;
                const prevIndex = (this.currentMatch - 1 + this.matches.length) % this.matches.length;
                this.jumpToMatch(prevIndex);
            }

            replaceOne() {
                if (this.matches.length === 0 || this.currentMatch === -1) return;

                const match = this.matches[this.currentMatch];
                let replacementText = this.replaceTerm;
                
                if (this.useRegex) {
                    try {
                        const searchRegex = this.buildSearchRegex();
                        if (searchRegex) {
                             const matchText = this.cm.getRange(match.from, match.to);
                             searchRegex.lastIndex = 0;
                             replacementText = matchText.replace(searchRegex, this.replaceTerm);
                        }
                    } catch (e) {
                         console.warn('Regex replacement error:', e);
                    }
                }

                this.cm.replaceRange(replacementText, match.from, match.to);
                this.cachedRegex = null; // Content changed, invalidate
                setTimeout(() => this.performSearch(), 10);
            }
            
            replaceAll() {
                if (this.matches.length === 0) return;

                const replacements = this.matches.length;
                this.cm.operation(() => {
                    for (let i = this.matches.length - 1; i >= 0; i--) {
                        const match = this.matches[i];
                        let replacementText = this.replaceTerm;
                        if (this.useRegex) {
                            try {
                                const searchRegex = this.buildSearchRegex();
                                if (searchRegex) {
                                    const matchText = this.cm.getRange(match.from, match.to);
                                    searchRegex.lastIndex = 0;
                                    replacementText = matchText.replace(searchRegex, this.replaceTerm);
                                }
                            } catch (e) {
                                console.warn('Regex replacement error:', e);
                            }
                        }
                        this.cm.replaceRange(replacementText, match.from, match.to);
                    }
                });
                
                this.cachedRegex = null;
                if (window.mw && typeof window.mw.notify === 'function') {
				    mw.notify(`Replaced ${replacements} occurrence${replacements !== 1 ? 's' : ''}`, { type: 'success' });
				}
                setTimeout(() => this.performSearch(), 20);
            }

            updateMatchCount(total, current) {
                let text;
                if (total === 0) {
                    text = this.searchTerm ? 'No results' : '0 results';
                } else if (current) {
                    text = `${current} of ${total}`;
                } else {
                    text = `${total} result${total !== 1 ? 's' : ''}`;
                }
                this.$matchCount.text(text);
            }
        }
        
        /**
         * Tries to find the main CodeMirror instance on the page.
         */
        const findCodeMirrorInstance = () => {
		    const textarea = document.getElementById('wpTextbox1');
		    if (textarea && textarea.CodeMirror) {
		        return textarea.CodeMirror;
		    }
		
		    const cmElement = document.querySelector('.CodeMirror');
		    if (cmElement && cmElement.CodeMirror) {
		        return cmElement.CodeMirror;
		    }
		
		    if (window.CodeMirror && window.CodeMirror.instances) {
		        return window.CodeMirror.instances.find(function(inst) {
		            if (inst && typeof inst.getTextArea === 'function') {
		                const editorTextArea = inst.getTextArea();
		                return editorTextArea && editorTextArea.id === 'wpTextbox1';
		            }
		            return false;
		        }) || null;
		    }
		
		    return null;
		};

        /**
         * Integrates the find/replace button into the MediaWiki toolbar.
         */
        const integrateWithToolbar = (findReplace) => {
            const $toolbar = $('#wikiEditor-ui-toolbar, .wikiEditor-ui-toolbar');
            if (!$toolbar.length) return;

            const $searchGroup = $toolbar.find('.group-search, [rel="search"]').first();
            if ($searchGroup.length) {
                $searchGroup.find('.tool[rel="replace"]').remove(); // Remove original button
                const toolHtml = `
                    <span class="tool oo-ui-widget oo-ui-widget-enabled oo-ui-buttonElement oo-ui-buttonElement-frameless oo-ui-iconElement oo-ui-buttonWidget" rel="find-replace" id="find-replace-tool">
                        <a class="oo-ui-buttonElement-button" role="button" title="Find and Replace (Ctrl+F)" tabindex="0" rel="nofollow">
                            <span class="oo-ui-iconElement-icon oo-ui-icon-articleSearch"></span>
                            <span class="oo-ui-labelElement-label"></span>
                        </a>
                    </span>
                `;
                $searchGroup.append(toolHtml);
                $('#find-replace-tool').on('click', (e) => {
                    e.preventDefault();
                    findReplace.open();
                });
            }
        };
        
        /**
         * Main initialization logic with retry mechanism.
         */
        const waitForCodeMirror = (attempt = 0) => {
            if (attempt > 20) {
                console.warn('CodeMirror not found after multiple attempts.');
                return;
            }

            const cm = findCodeMirrorInstance();
            if (cm) {
                window.findReplaceDialog = new FindReplaceDialog(cm);
                setTimeout(() => integrateWithToolbar(window.findReplaceDialog), 500);
            } else {
                const delay = Math.min(200 * 1.2 ** attempt, 2000);
                setTimeout(() => waitForCodeMirror(attempt + 1), delay);
            }
        };

        waitForCodeMirror();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFindReplace);
    } else {
        initFindReplace();
    }
})();