/**
 * MediaWiki Mass Rename Tool
 * v2.3.0
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

interface RenamePair {
    old: string;
    new: string;
    line: string;
}

interface RenameOptions {
    reason: string;
    leaveRedirect: boolean;
    moveSubpages: boolean;
    moveTalk: boolean;
    overwrite: boolean;
}

interface MwApi {
    postWithToken: (tokenType: string, params: Record<string, unknown>) => JQuery.Promise<unknown>;
}

declare global {
    interface Window {
        // createToolModal?: (options: ModalOptions) => ModalInstance;
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
                console.error('Mass Rename: Missing required dependencies (ModalBuilder or ToolsMenu).');
                return;
            }

            const MassRename = {
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
                    if (!this.modal) this.createModal();
                    this.modal!.open();
                },

                createModal: function (): void {
                    const content = `
                        <div class="tm-section">
                            <span class="tm-section-title">Page Mapping</span>
                            <p class="tm-section-desc">Format: <code>Old Page|New Page</code> (one per line). The script will process from the top down.</p>
                            <textarea class="tm-textarea" id="mass-rename-mapping" placeholder="Old Page|New Page"></textarea>
                        </div>
                        <div class="tm-section">
                            <span class="tm-section-title">Options</span>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <label class="tm-label-inline">
                                    <input type="checkbox" class="tm-checkbox" id="mass-rename-redirect" checked>
                                    Leave a redirect behind
                                </label>
                                <label class="tm-label-inline">
                                    <input type="checkbox" class="tm-checkbox" id="mass-rename-subpages">
                                    Move subpages
                                </label>
                                <label class="tm-label-inline">
                                    <input type="checkbox" class="tm-checkbox" id="mass-rename-talk">
                                    Move associated talk page
                                </label>
                                <label class="tm-label-inline">
                                    <input type="checkbox" class="tm-checkbox" id="mass-rename-overwrite">
                                    Overwrite existing pages (requires delete permission)
                                </label>
                                <input type="text" class="tm-input" id="mass-rename-reason" placeholder="Reason for move (optional)" style="margin-top: 4px;">
                            </div>
                        </div>
                        <div class="tm-section" style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button id="mass-rename-start-btn" class="tm-btn tm-btn-primary">Start</button>
                            <button id="mass-rename-pause-btn" class="tm-btn tm-btn-secondary" disabled>Pause</button>
                            <button class="tm-btn tm-btn-ghost" data-action="close">Cancel</button>
                        </div>
                        <div id="mass-rename-progress-section" class="tm-section" style="display:none;">
                            <span class="tm-section-title">Progress</span>
                            <div id="mass-rename-progress-log" class="tm-log"></div>
                        </div>
                    `;
                    
                    // The argument object here matches ModalOptions interface
                    this.modal = window.createToolModal!({
                        toolId: 'mass-rename',
                        title: 'Mass Page Rename',
                        contentHtml: content,
                        theme: 'rename'
                    });
                    this.addModalEventListeners();
                },

                addModalEventListeners: function (): void {
                    if (!this.modal) return;
                    const modalEl = this.modal.element;
                    modalEl.querySelector('#mass-rename-start-btn')!.addEventListener('click', this.start.bind(this));
                    modalEl.querySelector('#mass-rename-pause-btn')!.addEventListener('click', this.pause.bind(this));
                    modalEl.querySelector('[data-action="close"]')!.addEventListener('click', this.pause.bind(this));
                },

                getPairs: function (): RenamePair[] {
                    if (!this.modal) return [];
                    const mapping = (this.modal.element.querySelector('#mass-rename-mapping') as HTMLTextAreaElement).value.trim();
                    return mapping.split('\n').map(function (line: string): RenamePair | null {
                        const parts = line.trim().split('|');
                        if (parts.length >= 2) {
                            const oldName = parts[0].trim();
                            const newName = parts.slice(1).join('|').trim();
                            if (oldName && newName) {
                                return { old: oldName, new: newName, line: line };
                            }
                        }
                        return null;
                    }).filter((item): item is RenamePair => item !== null);
                },

                logMessage: function (message: string, type: 'info' | 'success' | 'error'): void {
                    if (!this.modal) return;
                    const log = this.modal.element.querySelector('#mass-rename-progress-log');
                    if (log) {
                        log.innerHTML += `<div class="tm-log-entry tm-log-${type || 'info'}">${new Date().toLocaleTimeString()}: ${message}</div>`;
                        log.scrollTop = log.scrollHeight;
                    }
                },

                start: function (): void {
                    if (!this.modal) return;
                    const isOverwrite = (this.modal.element.querySelector('#mass-rename-overwrite') as HTMLInputElement).checked;
                    const confirmationMessage = isOverwrite ?
                        'WARNING: You have chosen to overwrite existing pages. This will DELETE the target pages before renaming. This action is destructive and cannot be easily undone. Are you sure you want to proceed?' :
                        'Are you sure you want to start this rename operation?';

                    if (!confirm(confirmationMessage)) {
                        return;
                    }

                    this.isPaused = false;
                    const startBtn = this.modal.element.querySelector('#mass-rename-start-btn') as HTMLButtonElement;
                    startBtn.disabled = true;
                    startBtn.textContent = 'Resume';
                    (this.modal.element.querySelector('#mass-rename-pause-btn') as HTMLButtonElement).disabled = false;
                    (this.modal.element.querySelector('#mass-rename-progress-section') as HTMLElement).style.display = 'block';

                    this.logMessage('Rename process started...', 'info');
                    this.processQueue();
                },

                pause: function (): void {
                    if (!this.modal) return;
                    this.isPaused = true;
                    (this.modal.element.querySelector('#mass-rename-start-btn') as HTMLButtonElement).disabled = false;
                    (this.modal.element.querySelector('#mass-rename-pause-btn') as HTMLButtonElement).disabled = true;
                    this.logMessage('Rename process paused.', 'info');
                },

                processQueue: function (): void {
                    if (this.isPaused || !this.modal) {
                        return;
                    }

                    const mappingTextArea = this.modal.element.querySelector('#mass-rename-mapping') as HTMLTextAreaElement;
                    const pairs = this.getPairs();

                    if (pairs.length === 0) {
                        this.logMessage('All renames complete.', 'success');
                        this.pause();
                        this.modal.element.querySelector('#mass-rename-start-btn')!.textContent = 'Start';
                        return;
                    }

                    const currentPair = pairs[0];
                    const modalEl = this.modal.element;
                    const options: RenameOptions = {
                        reason: (modalEl.querySelector('#mass-rename-reason') as HTMLInputElement).value.trim() || 'Mass rename operation',
                        leaveRedirect: (modalEl.querySelector('#mass-rename-redirect') as HTMLInputElement).checked,
                        moveSubpages: (modalEl.querySelector('#mass-rename-subpages') as HTMLInputElement).checked,
                        moveTalk: (modalEl.querySelector('#mass-rename-talk') as HTMLInputElement).checked,
                        overwrite: (modalEl.querySelector('#mass-rename-overwrite') as HTMLInputElement).checked
                    };

                    this.processRename(currentPair, options).always(() => {
                        const remainingLines = mappingTextArea.value.trim().split('\n').slice(1).join('\n');
                        mappingTextArea.value = remainingLines;

                        setTimeout(this.processQueue.bind(this), this.config.delay);
                    });
                },

                processRename: function (pair: RenamePair, options: RenameOptions): JQuery.Promise<unknown> {
                    const self = this;

                    function performMove(): JQuery.Promise<unknown> {
                        const moveParams: Record<string, unknown> = {
                            action: 'move',
                            from: pair.old,
                            to: pair.new,
                            reason: options.reason,
                            format: 'json'
                        };
                        if (!options.leaveRedirect) moveParams.noredirect = 1;
                        if (options.moveSubpages) moveParams.movesubpages = 1;
                        if (options.moveTalk) moveParams.movetalk = 1;

                        return self.api!.postWithToken('csrf', moveParams)
                            .done(function () {
                                self.logMessage(`Renamed "${pair.old}" to "${pair.new}"`, 'success');
                            })
                            .fail(function (code: string, result: any) {
                                const error = result.error ? result.error.info : code;
                                self.logMessage(`Failed renaming "${pair.old}": ${error}`, 'error');
                            });
                    }

                    if (options.overwrite) {
                        return self.api!.postWithToken('csrf', {
                            action: 'delete',
                            title: pair.new,
                            reason: 'Making way for rename of [[' + pair.old + ']]',
                            format: 'json'
                        }).always(function () {
                            return performMove();
                        });
                    } else {
                        return performMove();
                    }
                },

                addToNavigation: function (): void {
                    if (!window.ensureToolsMenu) return;
                    const targetList = window.ensureToolsMenu();
                    if (targetList && !document.getElementById('n-mass-rename')) {
                        const link = $('<a href="#">Mass Rename</a>').on('click', (e) => {
                            e.preventDefault();
                            this.openModal();
                        });
                        const item = $('<li id="n-mass-rename" class="mw-list-item"></li>').append(link);
                        $(targetList).append(item);
                    }
                }
            };

            MassRename.init();
        });
    });

})(mediaWiki, jQuery);