/**
 * MediaWiki Mass Categorization Tool
 * v2.2.0
 * Refactored to use ModalBuilder and ToolsMenu gadgets.
 */

// --- Type Definitions ---
// interface ModalOptions {
//     toolId: string;
//     title: string;
//     contentHtml: string;
//     theme: string;
// }

interface ModalInstance {
    element: HTMLElement;
    open: () => void;
    close: () => void;
}

interface UpdateAction {
    mode: 'add' | 'remove' | 'replace';
    category: string;
    replacement?: string;
}

interface ProcessOptions {
    useNoinclude: boolean;
    caseSensitive: boolean;
}

interface ApiCategoryMember {
    title: string;
}

interface ApiCategoryResponse {
    query?: {
        categorymembers?: ApiCategoryMember[];
    };
}

interface ApiRevision {
    content: string;
}

interface ApiPage {
    pageid?: number;
    missing?: boolean;
    revisions?: ApiRevision[];
}

interface ApiQueryResponse {
    query?: {
        pages?: ApiPage[];
    };
}

interface MwApi {
    postWithToken: (tokenType: string, params: Record<string, unknown>) => JQuery.Promise<unknown>;
    get: (params: Record<string, unknown>) => JQuery.Promise<ApiQueryResponse | ApiCategoryResponse>;
}

declare global {
    interface Window {
        ensureToolsMenu?: () => HTMLElement | null;
    }
}

declare const mw: {
    loader: {
        using: (modules: string[]) => JQuery.Promise<void>;
    };
    Api: new () => MwApi;
};

declare const mediaWiki: typeof mw;

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    mw.loader.using(['mediawiki.api']).then(function (): void {
        $(function (): void {
            if (!window.createToolModal || !window.ensureToolsMenu) {
                console.error('Mass Categorization: Missing required dependencies (ModalBuilder or ToolsMenu).');
                return;
            }

            const MassCategorization = {
                modal: null as ModalInstance | null,
                api: null as MwApi | null,
                isPaused: true,
                config: {
                    delay: 1000
                },
                categoryAliases: ['Category'],

                init: function (): void {
                    this.api = new mw.Api();
                    this.addToToolbar();
                },

                openModal: function (): void {
                    if (!this.modal) this.createModal();
                    this.modal!.open();
                },

                createModal: function (): void {
                    const content = `
                        <div class="tm-section">
                            <span class="tm-section-title">Categorization Actions</span>
                            <div id="mass-cat-updates-list"></div>
                            <button id="mass-cat-add-row" class="tm-btn tm-btn-secondary" style="margin-top: 8px;">+ Add Action</button>
                        </div>
                        <div class="tm-section">
                            <span class="tm-section-title">Pages</span>
                            <p class="tm-section-desc">One page title per line. The script will process from the top down.</p>
                            <textarea class="tm-textarea" id="mass-cat-pages" placeholder="Enter page titles..."></textarea>
                        </div>
                        <div class="tm-section">
                            <span class="tm-section-title">Options</span>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <label class="tm-label-inline">
                                    <input type="checkbox" class="tm-checkbox" id="mass-cat-noinclude">
                                    Wrap added categories in &lt;noinclude&gt; tags
                                </label>
                                <label class="tm-label-inline">
                                    <input type="checkbox" class="tm-checkbox" id="mass-cat-case-sensitive">
                                    Use case-sensitive matching for remove/replace
                                </label>
                            </div>
                        </div>
                        <div class="tm-section" style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button id="mass-cat-start-btn" class="tm-btn tm-btn-primary">Start</button>
                            <button id="mass-cat-pause-btn" class="tm-btn tm-btn-secondary" disabled>Pause</button>
                            <button id="mass-cat-add-category-btn" class="tm-btn tm-btn-secondary">Add from Category</button>
                            <button class="tm-btn tm-btn-ghost" data-action="close">Cancel</button>
                        </div>
                        <div id="mass-cat-progress-section" class="tm-section" style="display:none;">
                            <span class="tm-section-title">Progress</span>
                            <div id="mass-cat-progress-log" class="tm-log"></div>
                        </div>
                    `;
                    this.modal = window.createToolModal!({
                        toolId: 'mass-categorize',
                        title: 'Mass Categorization',
                        contentHtml: content,
                        theme: 'categorize'
                    });
                    this.addModalEventListeners();
                    this.addUpdateRow();
                },

                addUpdateRow: function (): void {
                    if (!this.modal) return;
                    const list = this.modal.element.querySelector('#mass-cat-updates-list');
                    const row = $(`
                        <div class="mass-cat-update-row" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                            <select class="mass-cat-select tm-select" style="flex: 0 0 100px;">
                                <option value="add">Add</option>
                                <option value="remove">Remove</option>
                                <option value="replace">Replace</option>
                            </select>
                            <div class="mass-cat-update-inputs" style="flex: 1; display: flex; gap: 8px;">
                                <input type="text" class="tm-input" data-input-type="old-cat" placeholder="Category to act on">
                            </div>
                            <button class="mass-cat-remove-row tm-btn tm-btn-ghost" style="padding: 8px;">−</button>
                        </div>
                    `);
                    row.find('.mass-cat-select').on('change', this.onModeChange);
                    row.find('.mass-cat-remove-row').on('click', function () { $(this).parent().remove(); });
                    $(list).append(row);
                },

                onModeChange: function (this: HTMLSelectElement): void {
                    const row = $(this).closest('.mass-cat-update-row');
                    const inputsContainer = row.find('.mass-cat-update-inputs');
                    if (this.value === 'replace') {
                        inputsContainer.html(`
                            <input type="text" class="tm-input" data-input-type="old-cat" placeholder="Category to replace">
                            <input type="text" class="tm-input" data-input-type="new-cat" placeholder="New category">
                        `);
                    } else {
                        inputsContainer.html('<input type="text" class="tm-input" data-input-type="old-cat" placeholder="Category to act on">');
                    }
                },

                addModalEventListeners: function (): void {
                    if (!this.modal) return;
                    const modalEl = this.modal.element;
                    modalEl.querySelector('#mass-cat-add-row')!.addEventListener('click', this.addUpdateRow.bind(this));
                    modalEl.querySelector('#mass-cat-start-btn')!.addEventListener('click', this.start.bind(this));
                    modalEl.querySelector('#mass-cat-pause-btn')!.addEventListener('click', this.pause.bind(this));
                    modalEl.querySelector('#mass-cat-add-category-btn')!.addEventListener('click', this.addFromCategory.bind(this));
                    modalEl.querySelector('[data-action="close"]')!.addEventListener('click', this.pause.bind(this));
                },

                logMessage: function (message: string, type: 'info' | 'success' | 'error'): void {
                    if (!this.modal) return;
                    const log = this.modal.element.querySelector('#mass-cat-progress-log');
                    if (log) {
                        log.innerHTML += `<div class="tm-log-entry tm-log-${type || 'info'}">${new Date().toLocaleTimeString()}: ${message}</div>`;
                        log.scrollTop = log.scrollHeight;
                    }
                },

                getUpdates: function (): UpdateAction[] {
                    const updates: UpdateAction[] = [];
                    if (!this.modal) return updates;

                    $(this.modal.element).find('.mass-cat-update-row').each(function (_i: number, el: HTMLElement) {
                        const $el = $(el);
                        const mode = $el.find('.mass-cat-select').val() as 'add' | 'remove' | 'replace';
                        const oldCat = ($el.find('[data-input-type="old-cat"]').val() as string).trim();
                        
                        const update: UpdateAction = { mode: mode, category: oldCat };

                        if (mode === 'replace') {
                            update.replacement = ($el.find('[data-input-type="new-cat"]').val() as string).trim();
                            if (!oldCat || !update.replacement) return;
                        } else {
                            if (!oldCat) return;
                        }
                        updates.push(update);
                    });
                    return updates;
                },

                start: function (): void {
                    if (this.getUpdates().length === 0) {
                        alert('Please specify at least one valid categorization action.');
                        return;
                    }
                    if (!this.modal) return;

                    this.isPaused = false;
                    const startBtn = this.modal.element.querySelector('#mass-cat-start-btn') as HTMLButtonElement;
                    startBtn.disabled = true;
                    startBtn.textContent = 'Resume';
                    (this.modal.element.querySelector('#mass-cat-pause-btn') as HTMLButtonElement).disabled = false;
                    (this.modal.element.querySelector('#mass-cat-progress-section') as HTMLElement).style.display = 'block';
                    
                    this.logMessage('Categorization process started...', 'info');
                    this.processQueue();
                },

                pause: function (): void {
                    if (!this.modal) return;
                    this.isPaused = true;
                    (this.modal.element.querySelector('#mass-cat-start-btn') as HTMLButtonElement).disabled = false;
                    (this.modal.element.querySelector('#mass-cat-pause-btn') as HTMLButtonElement).disabled = true;
                    this.logMessage('Categorization process paused.', 'info');
                },

                processQueue: function (): void {
                    if (this.isPaused || !this.modal) return;

                    const pagesTextArea = this.modal.element.querySelector('#mass-cat-pages') as HTMLTextAreaElement;
                    const pages = pagesTextArea.value.trim().split('\n').filter(Boolean);

                    if (pages.length === 0) {
                        this.logMessage('All pages processed.', 'success');
                        this.pause();
                        this.modal.element.querySelector('#mass-cat-start-btn')!.textContent = 'Start';
                        return;
                    }

                    const currentPage = pages[0];
                    const updates = this.getUpdates();
                    const options: ProcessOptions = {
                        useNoinclude: (this.modal.element.querySelector('#mass-cat-noinclude') as HTMLInputElement).checked,
                        caseSensitive: (this.modal.element.querySelector('#mass-cat-case-sensitive') as HTMLInputElement).checked
                    };

                    this.processPage(currentPage, updates, options).always(() => {
                        const remainingPages = pages.slice(1).join('\n');
                        pagesTextArea.value = remainingPages;
                        setTimeout(this.processQueue.bind(this), this.config.delay);
                    });
                },

                processPage: function (title: string, updates: UpdateAction[], options: ProcessOptions): JQuery.Promise<unknown> {
                    return this.api!.get({
                        action: 'query',
                        titles: title,
                        prop: 'revisions',
                        rvprop: 'content',
                        formatversion: 2
                    }).then((data: ApiQueryResponse | ApiCategoryResponse) => {
                        // Cast to QueryResponse as we know the structure from params
                        const queryData = data as ApiQueryResponse;
                        
                        if (!queryData.query || !queryData.query.pages) {
                            this.logMessage(`Error querying page: "${title}"`, 'error');
                            return $.Deferred().reject();
                        }

                        const page = queryData.query.pages[0];
                        if (page.missing) {
                            this.logMessage(`Page not found: "${title}"`, 'error');
                            return $.Deferred().reject();
                        }

                        if (!page.revisions || !page.revisions[0]) {
                            this.logMessage(`No content found: "${title}"`, 'error');
                            return $.Deferred().reject();
                        }

                        const content = page.revisions[0].content;
                        let newContent = content;
                        const changes: string[] = [];
                        const categoryNamespaceGroup = '(' + this.categoryAliases.join('|') + ')';

                        updates.forEach((update) => {
                            const flags = 'g' + (options.caseSensitive ? '' : 'i');
                            const escapedCat = this.escapeRegex(update.category);
                            const regex = new RegExp('\\[\\[' + categoryNamespaceGroup + ':' + escapedCat + '(\\|.*?)?\\]\\]', flags);

                            if (update.mode === 'remove' && newContent.match(regex)) {
                                newContent = newContent.replace(regex, '');
                                changes.push(`removed "${update.category}"`);
                            } else if (update.mode === 'replace' && newContent.match(regex) && update.replacement) {
                                const newCatSyntax = `[[${this.categoryAliases[0]}:${update.replacement}]]`;
                                newContent = newContent.replace(regex, newCatSyntax);
                                changes.push(`replaced "${update.category}" with "${update.replacement}"`);
                            }
                        });

                        const catsToAdd = updates.filter((u) => u.mode === 'add');
                        if (catsToAdd.length > 0) {
                            let appendContent = '';
                            catsToAdd.forEach((update) => {
                                const flags = 'i';
                                const escapedCat = this.escapeRegex(update.category);
                                const regex = new RegExp('\\[\\[' + categoryNamespaceGroup + ':' + escapedCat + '(\\|.*?)?\\]\\]', flags);
                                if (!newContent.match(regex)) {
                                    appendContent += `\n[[${this.categoryAliases[0]}:${update.category}]]`;
                                    changes.push(`added "${update.category}"`);
                                }
                            });

                            if (appendContent) {
                                if (options.useNoinclude) {
                                    appendContent = '\n<noinclude>' + appendContent.trim() + '\n</noinclude>';
                                }
                                newContent += appendContent;
                            }
                        }

                        if (content === newContent) {
                            this.logMessage(`No changes needed for "${title}".`, 'info');
                            return $.Deferred().resolve();
                        }

                        const summary = 'Mass Categorization: ' + changes.join(', ');
                        return this.api!.postWithToken('csrf', {
                            action: 'edit',
                            title: title,
                            text: newContent,
                            summary: summary,
                            minor: true,
                            bot: true
                        }).done(() => {
                            this.logMessage(`Successfully updated "${title}".`, 'success');
                        }).fail((code: string, result: any) => {
                            const error = result.error ? result.error.info : code;
                            this.logMessage(`Error updating "${title}": ${error}`, 'error');
                        });

                    }).fail(() => {
                        this.logMessage(`Failed to fetch content for "${title}".`, 'error');
                    });
                },

                addFromCategory: function (): void {
                    const category = prompt('Enter a category name (without the "Category:" prefix):');
                    if (!category || !category.trim()) return;

                    this.logMessage(`Fetching pages from "Category:${category}"...`, 'info');
                    this.api!.get({
                        action: 'query',
                        list: 'categorymembers',
                        cmtitle: 'Category:' + category.trim(),
                        cmlimit: 'max'
                    }).done((data: ApiQueryResponse | ApiCategoryResponse) => {
                        const catData = data as ApiCategoryResponse;
                        if (!catData.query || !catData.query.categorymembers || catData.query.categorymembers.length === 0) {
                            this.logMessage(`No pages found in "Category:${category}".`, 'info');
                            return;
                        }
                        const pages = catData.query.categorymembers.map((p) => p.title).join('\n');
                        
                        if (!this.modal) return;
                        const pagesTextArea = this.modal.element.querySelector('#mass-cat-pages') as HTMLTextAreaElement;
                        pagesTextArea.value += (pagesTextArea.value ? '\n' : '') + pages;
                        this.logMessage(`Added ${catData.query.categorymembers.length} pages to the list.`, 'success');
                    }).fail(() => {
                        this.logMessage(`Failed to fetch pages from "Category:${category}".`, 'error');
                    });
                },

                escapeRegex: function (s: string): string {
                    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                },

                addToToolbar: function (): void {
                    if (!window.ensureToolsMenu) return;
                    const targetList = window.ensureToolsMenu();
                    if (targetList && !document.getElementById('n-mass-categorize')) {
                        const link = $('<a href="#">Mass Categorize</a>').on('click', (e) => {
                            e.preventDefault();
                            this.openModal();
                        });
                        const item = $('<li id="n-mass-categorize" class="mw-list-item"></li>').append(link);
                        $(targetList).append(item);
                    }
                }
            };

            MassCategorization.init();
        });
    });
})(mediaWiki, jQuery);