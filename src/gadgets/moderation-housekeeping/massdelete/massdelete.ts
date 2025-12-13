/**
 * MediaWiki Mass Deletion Tool
 * v2.1.0
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

interface ApiCategoryMember {
    title: string;
}

interface ApiCategoryResponse {
    query?: {
        categorymembers?: ApiCategoryMember[];
    };
}

interface MwApi {
    postWithToken: (tokenType: string, params: Record<string, unknown>) => JQuery.Promise<unknown>;
    get: (params: Record<string, unknown>) => JQuery.Promise<ApiCategoryResponse>;
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
                console.error('Mass Delete: Missing required dependencies (ModalBuilder or ToolsMenu).');
                return;
            }

            const MassDelete = {
                modal: null as ModalInstance | null,
                api: null as MwApi | null,
                isPaused: true,
                config: {
                    delay: 1000
                },

                init: function (): void {
                    this.api = new mw.Api();
                    this.addToNavigation();
                },

                openModal: function (): void {
                    if (!this.modal) {
                        this.createModal();
                    }
                    this.modal!.open();
                },

                createModal: function (): void {
                    const content = `
                        <div class="tm-section">
                            <span class="tm-section-title">Pages to Delete</span>
                            <p class="tm-section-desc">One page title per line. The script will process from the top down.</p>
                            <textarea class="tm-textarea" id="mass-delete-pages" placeholder="Enter page titles to delete..."></textarea>
                        </div>
                        <div class="tm-section">
                            <span class="tm-section-title">Options</span>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <input type="text" class="tm-input" id="mass-delete-reason" placeholder="Reason for deletion (required)">
                                <label class="tm-label-inline">
                                    <input type="checkbox" class="tm-checkbox" id="mass-delete-protect">
                                    Protect pages after deletion (sysop only)
                                </label>
                            </div>
                        </div>
                        <div class="tm-section" style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button id="mass-delete-start-btn" class="tm-btn tm-btn-primary">Start</button>
                            <button id="mass-delete-pause-btn" class="tm-btn tm-btn-secondary" disabled>Pause</button>
                            <button id="mass-delete-add-category-btn" class="tm-btn tm-btn-secondary">Add from Category</button>
                            <button class="tm-btn tm-btn-ghost" data-action="close">Cancel</button>
                        </div>
                        <div id="mass-delete-progress-section" class="tm-section" style="display:none;">
                            <span class="tm-section-title">Progress</span>
                            <div id="mass-delete-progress-log" class="tm-log"></div>
                        </div>
                    `;

                    this.modal = window.createToolModal!({
                        toolId: 'mass-delete',
                        title: 'Mass Page Deletion',
                        contentHtml: content,
                        theme: 'delete',
                    });

                    this.addModalEventListeners();
                },

                addModalEventListeners: function (): void {
                    if (!this.modal) return;
                    const modalEl = this.modal.element;
                    modalEl.querySelector('#mass-delete-start-btn')!.addEventListener('click', this.start.bind(this));
                    modalEl.querySelector('#mass-delete-pause-btn')!.addEventListener('click', this.pause.bind(this));
                    modalEl.querySelector('#mass-delete-add-category-btn')!.addEventListener('click', this.addFromCategory.bind(this));
                    modalEl.querySelector('[data-action="close"]')!.addEventListener('click', this.pause.bind(this));
                },

                getPages: function (): string[] {
                    if (!this.modal) return [];
                    const list = (this.modal.element.querySelector('#mass-delete-pages') as HTMLTextAreaElement).value.trim();
                    return list.split('\n').map(function (line: string): string {
                        return line.trim();
                    }).filter(Boolean);
                },

                logMessage: function (message: string, type: 'info' | 'success' | 'error'): void {
                    if (!this.modal) return;
                    const log = this.modal.element.querySelector('#mass-delete-progress-log');
                    if (log) {
                        const entry = document.createElement('div');
                        entry.className = 'tm-log-entry tm-log-' + (type || 'info');
                        entry.textContent = new Date().toLocaleTimeString() + ': ' + message;
                        log.appendChild(entry);
                        log.scrollTop = log.scrollHeight;
                    }
                },

                start: function (): void {
                    if (!this.modal) return;
                    if (!(this.modal.element.querySelector('#mass-delete-reason') as HTMLInputElement).value.trim()) {
                        alert('Please provide a reason for deletion.');
                        return;
                    }

                    this.isPaused = false;
                    const startBtn = this.modal.element.querySelector('#mass-delete-start-btn') as HTMLButtonElement;
                    startBtn.disabled = true;
                    startBtn.textContent = 'Resume';
                    (this.modal.element.querySelector('#mass-delete-pause-btn') as HTMLButtonElement).disabled = false;
                    (this.modal.element.querySelector('#mass-delete-progress-section') as HTMLElement).style.display = 'block';

                    this.logMessage('Deletion process started...', 'info');
                    this.processQueue();
                },

                pause: function (): void {
                    if (!this.modal) return;
                    this.isPaused = true;
                    (this.modal.element.querySelector('#mass-delete-start-btn') as HTMLButtonElement).disabled = false;
                    (this.modal.element.querySelector('#mass-delete-pause-btn') as HTMLButtonElement).disabled = true;
                    this.logMessage('Deletion process paused.', 'info');
                },

                processQueue: function (): void {
                    if (this.isPaused || !this.modal) {
                        return;
                    }

                    const pagesTextArea = this.modal.element.querySelector('#mass-delete-pages') as HTMLTextAreaElement;
                    const pages = this.getPages();

                    if (pages.length === 0) {
                        this.logMessage('All deletions complete.', 'success');
                        this.pause();
                        this.modal.element.querySelector('#mass-delete-start-btn')!.textContent = 'Start';
                        return;
                    }

                    const currentPage = pages[0];
                    const reason = (this.modal.element.querySelector('#mass-delete-reason') as HTMLInputElement).value.trim();
                    const shouldProtect = (this.modal.element.querySelector('#mass-delete-protect') as HTMLInputElement).checked;

                    this.processDelete(currentPage, reason, shouldProtect).always(() => {
                        const remainingPages = pages.slice(1).join('\n');
                        pagesTextArea.value = remainingPages;

                        setTimeout(this.processQueue.bind(this), this.config.delay);
                    });
                },

                processDelete: function (page: string, reason: string, shouldProtect: boolean): JQuery.Promise<unknown> {
                    const self = this;
                    return self.api!.postWithToken('csrf', {
                        action: 'delete',
                        title: page,
                        reason: reason,
                        format: 'json'
                    }).done(function () {
                        self.logMessage(`Successfully deleted "${page}"`, 'success');
                        if (shouldProtect) {
                            self.api!.postWithToken('csrf', {
                                action: 'protect',
                                title: page,
                                protections: 'create=sysop',
                                expiry: 'infinite',
                                reason: reason
                            }).done(function () {
                                self.logMessage(`Successfully protected "${page}"`, 'success');
                            }).fail(function (_code: string, result: any) {
                                const error = result.error ? result.error.info : 'Unknown error';
                                self.logMessage(`Failed to protect "${page}": ${error}`, 'error');
                            });
                        }
                    }).fail(function (code: string, result: any) {
                        const error = result.error ? result.error.info : code;
                        self.logMessage(`Failed to delete "${page}": ${error}`, 'error');
                    });
                },

                addFromCategory: function (): void {
                    const category = prompt('Enter a category name (without the "Category:" prefix):');
                    if (!category || !category.trim()) {
                        return;
                    }

                    this.logMessage(`Fetching pages from "Category:${category}"...`, 'info');
                    this.api!.get({
                        action: 'query',
                        list: 'categorymembers',
                        cmtitle: 'Category:' + category.trim(),
                        cmlimit: 500
                    }).done((data: ApiCategoryResponse) => {
                        if (!data.query || !data.query.categorymembers || data.query.categorymembers.length === 0) {
                            this.logMessage(`No pages found in "Category:${category}".`, 'info');
                            return;
                        }
                        const pages = data.query.categorymembers.map(function (p: ApiCategoryMember) {
                            return p.title;
                        }).join('\n');

                        if (!this.modal) return;
                        const pagesTextArea = this.modal.element.querySelector('#mass-delete-pages') as HTMLTextAreaElement;
                        pagesTextArea.value += (pagesTextArea.value ? '\n' : '') + pages;
                        this.logMessage(`Added ${data.query.categorymembers.length} pages to the list.`, 'success');
                    }).fail(() => {
                        this.logMessage(`Failed to fetch pages from "Category:${category}".`, 'error');
                    });
                },

                addToNavigation: function (): void {
                    if (!window.ensureToolsMenu) return;
                    const targetList = window.ensureToolsMenu();
                    if (targetList && !document.getElementById('n-mass-delete')) {
                        const link = $('<a href="#">Mass Delete</a>').on('click', (e) => {
                            e.preventDefault();
                            this.openModal();
                        });
                        const item = $('<li id="n-mass-delete" class="mw-list-item"></li>').append(link);
                        $(targetList).append(item);
                    }
                }
            };

            MassDelete.init();
        });
    });
})(mediaWiki, jQuery);