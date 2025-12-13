/**
 * MediaWiki Mass Upload Tool
 * v2.1.1
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

interface UploadConfig {
    maxConcurrent: number;
    delay: number;
    computeSha1: boolean;
}

interface UploadQueueItem {
    file: File;
    index: number;
    sha1: string | null;
    _state: 'pending' | 'running' | 'done';
}

// Interfaces for the License structure
interface LicenseMap {
    [key: string]: string;
}

interface LicenseGroupWithSubgroups {
    __subgroups__: Record<string, LicenseMap>;
    [key: string]: string | Record<string, LicenseMap> | undefined; // Fallback for mixed content
}

type LicenseData = Record<string, LicenseMap | LicenseGroupWithSubgroups>;

// API Interfaces
interface ApiFileInfo {
    missing?: string;
    [key: string]: unknown;
}

interface ApiQueryResponse {
    query?: {
        pages?: Record<string, ApiFileInfo>;
    };
    error?: {
        code: string;
        info: string;
    };
}

interface ApiUploadResponse {
    upload?: {
        result: string;
        filename?: string;
    };
    error?: {
        code: string;
        info: string;
    };
}

interface MwApi {
    get: (params: Record<string, unknown>) => JQuery.Promise<ApiQueryResponse>;
    // The upload method is specific to mediawiki.api module
    upload: (file: File, params: Record<string, unknown>) => JQuery.Promise<ApiUploadResponse>;
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
    html: {
        escape: (s: string) => string;
    };
    notify: (message: string, options?: { type: string }) => void;
    Api: new () => MwApi;
};

declare const mediaWiki: typeof mw;

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    mw.loader.using(['mediawiki.api']).then(function (): void {

        // --- Helper: convert ArrayBuffer to hex string ---
        function arrayBufferToHex(buffer: ArrayBuffer): string {
            let hex = '';
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.length; i++) {
                let h = bytes[i].toString(16);
                if (h.length === 1) h = '0' + h;
                hex += h;
            }
            return hex;
        }

        // --- Helper: compute SHA-1 of a File using SubtleCrypto ---
        function computeSHA1(file: File): JQuery.Promise<string | null> {
            const d = $.Deferred<string | null>();
            if (window.crypto && window.crypto.subtle && file && file.size > 0) {
                const fr = new FileReader();
                fr.onload = function (e: ProgressEvent<FileReader>): void {
                    const arrayBuffer = e.target?.result as ArrayBuffer;
                    if (!arrayBuffer) {
                        d.resolve(null);
                        return;
                    }
                    crypto.subtle.digest('SHA-1', arrayBuffer).then(function (hashBuffer) {
                        d.resolve(arrayBufferToHex(hashBuffer));
                    }).catch(function () { d.resolve(null); });
                };
                fr.onerror = function (): void { d.resolve(null); };
                fr.readAsArrayBuffer(file);
            } else {
                d.resolve(null);
            }
            return d.promise();
        }

        $(function (): void {
            if (!window.createToolModal || !window.ensureToolsMenu) {
                console.error('Mass Upload: Missing required dependencies (ModalBuilder or ToolsMenu).');
                return;
            }

            const MassUpload = {
                modal: null as ModalInstance | null,
                api: null as MwApi | null,
                uploadQueue: [] as UploadQueueItem[],
                config: {
                    maxConcurrent: 2,
                    delay: 400,
                    computeSha1: false
                } as UploadConfig,

                // runtime guards
                _running: false,
                _activeFilenames: {} as Record<string, boolean>,

                licenseGroups: {
                    'Creative Commons': {
                        'Cc-by-4.0': 'Creative Commons Attribution',
                        'Cc-by-sa-4.0': 'Creative Commons Attribution-ShareAlike',
                        'Cc-by-nc-4.0': 'Creative Commons Attribution-NonCommercial',
                        'Cc-by-nc-sa-4.0': 'Creative Commons Attribution-NonCommercial-ShareAlike'
                    },
                    'Fair Use': { 'Fairuse': 'Fair Use' },
                    'Public Domain': { 'PD': 'Public Domain' },
                    'From Wikimedia': { 'From Wikimedia': 'From Wikimedia' },
                    'Media Categories': {
                        '__subgroups__': {
                            'Utaite': {
                                'Official Avatars': 'OFFICIAL avatars',
                                'Real Life Photos': 'REAL LIFE photos (concerts, twitter, lives etc)',
                                'Song Avatars': 'SONG avatars (used in PVs)',
                                'Anikora Thumbnail': 'ANIKORA thumbnail'
                            },
                            'Youtaite': {
                                'Youtaite Official Avatars': 'OFFICIAL avatars',
                                'Youtaite Real Life Photos': 'REAL LIFE photos (concerts, twitter, lives etc)',
                                'Youtaite Song Avatars': 'SONG avatars (used in PVs)'
                            },
                            'Media': {
                                'Single and Album Covers': 'Single & ALBUM covers (also compilation albums)',
                                'Music Video Thumbnail': 'Music Video Thumbnail',
                                'Famous Utattemita Song Pictures': 'Pictures used for FAMOUS UTATTEMITA SONGS',
                                'Event Thumbnail': 'Event Thumbnail'
                            },
                            'Misc.': {
                                'Fan Depictions': 'FAN depictions (used in the Template:Utaite infobox)',
                                'Icons and Logos': 'Icons, logos and TRADEMARK items',
                                'Avatar Illustrators': 'Pictures used for AVATAR ILLUSTRATORS',
                                'Guides and Tutorials Images': 'Images used for tutorials, guides, or rules explanations',
                                'Copyright Free Materials': 'Copyright Free Materials'
                            },
                            'Users': { 'User profile': 'User profile picture' }
                        }
                    },
                    'Other': {
                        'Self': 'Uploaded by image copyright owner',
                        'Permission': 'Uploaded with permission from the copyright owner',
                        'No license': 'No license',
                        'Other free': 'Other free'
                    }
                } as LicenseData,

                init: function (): void {
                    this.api = new mw.Api();
                    this.addToToolsMenu();
                },

                generateLicenseOptions: function (): string {
                    let html = '<option value="">Select license...</option>';
                    for (const g in this.licenseGroups) {
                        if (!Object.prototype.hasOwnProperty.call(this.licenseGroups, g)) continue;
                        
                        const group = this.licenseGroups[g];
                        html += '<optgroup label="' + mw.html.escape(g) + '">';
                        
                        // Check if it has subgroups (casted to handle the specific structure)
                        if ('__subgroups__' in group) {
                            const subgroupData = group.__subgroups__;
                            for (const sg in subgroupData) {
                                if (!Object.prototype.hasOwnProperty.call(subgroupData, sg)) continue;
                                const subgroup = subgroupData[sg];
                                html += '<optgroup label="  ' + mw.html.escape(sg) + '" style="font-style: italic;">';
                                for (const k in subgroup) {
                                    if (!Object.prototype.hasOwnProperty.call(subgroup, k)) continue;
                                    html += '<option value="' + mw.html.escape(k) + '">' + mw.html.escape(subgroup[k]) + '</option>';
                                }
                                html += '</optgroup>';
                            }
                        } else {
                            // Standard group
                            const standardGroup = group as LicenseMap;
                            for (const k2 in standardGroup) {
                                if (!Object.prototype.hasOwnProperty.call(standardGroup, k2)) continue;
                                html += '<option value="' + mw.html.escape(k2) + '">' + mw.html.escape(standardGroup[k2]) + '</option>';
                            }
                        }
                        html += '</optgroup>';
                    }
                    return html;
                },

                openModal: function (): void {
                    if (!this.modal) this.createModal();
                    this.modal!.open();
                },

                createModal: function (): void {
                    const licenseOptions = this.generateLicenseOptions();
                    const content = `
                        <div class="tm-section">
                            <span class="tm-section-title">Global Settings</span>
                            <p class="tm-section-desc">Applied to all images unless overridden individually.</p>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <select id="mass-upload-global-license" class="tm-select">${licenseOptions}</select>
                                <textarea id="mass-upload-global-description" class="tm-textarea" placeholder="Default description for all images..."></textarea>
                                <input type="text" id="mass-upload-global-categories" class="tm-input" placeholder="Default categories (comma-separated)">
                            </div>
                        </div>
                        <div class="tm-section">
                            <span class="tm-section-title">File Selection</span>
                            <input type="file" id="mass-upload-file-input" multiple accept="image/*" class="tm-input">
                            <div id="mass-upload-file-list" style="margin-top: 12px;"></div>
                        </div>
                        <div class="tm-section" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <button id="mass-upload-start-btn" class="tm-btn tm-btn-primary" disabled>Start Upload</button>
                            <button class="tm-btn tm-btn-ghost" data-action="close">Cancel</button>
                            <label class="tm-label-inline" style="margin-left: auto;">
                                <input type="checkbox" class="tm-checkbox" id="mass-upload-compute-sha1">
                                Compute SHA-1 (optional)
                            </label>
                        </div>
                        <div id="mass-upload-progress-section" class="tm-section" style="display:none;">
                            <span class="tm-section-title">Progress</span>
                            <div id="mass-upload-progress-log" class="tm-log"></div>
                        </div>
                    `;

                    this.modal = window.createToolModal!({
                        toolId: 'mass-upload',
                        title: 'Bulk Image Upload',
                        contentHtml: content,
                        theme: 'upload'
                    });
                    this.addModalEventListeners();
                },

                addModalEventListeners: function (): void {
                    if (!this.modal) return;
                    const modalEl = this.modal.element;
                    modalEl.querySelector('#mass-upload-file-input')!.addEventListener('change', this.handleFileSelection.bind(this));
                    modalEl.querySelector('#mass-upload-start-btn')!.addEventListener('click', this.startUpload.bind(this));
                    modalEl.querySelector('[data-action="close"]')!.addEventListener('click', () => this.modal!.close());
                    modalEl.querySelector('#mass-upload-compute-sha1')!.addEventListener('change', (e: Event) => {
                        this.config.computeSha1 = !!(e.target as HTMLInputElement).checked;
                    });
                },

                handleFileSelection: function (event: Event): void {
                    const input = event.target as HTMLInputElement;
                    const files = input.files;
                    if (!this.modal || !files) return;

                    const fileList = this.modal.element.querySelector('#mass-upload-file-list') as HTMLElement;
                    fileList.innerHTML = '';
                    this.uploadQueue = [];

                    const licenseOptions = this.generateLicenseOptions();
                    const seenKeys: Record<string, boolean> = {};
                    const promises: JQuery.Promise<unknown>[] = [];

                    Array.from(files).forEach((file: File) => {
                        const quickKey = file.name + '|' + file.size + '|' + file.lastModified;
                        if (seenKeys[quickKey]) return;
                        seenKeys[quickKey] = true;

                        const fileIndex = this.uploadQueue.length;
                        this.uploadQueue.push({ file: file, index: fileIndex, sha1: null, _state: 'pending' });

                        const fileItemHTML = `
                            <div class="tm-section" data-file-index="${fileIndex}" style="border-top: 1px solid rgba(0,0,0,0.06); padding-top: 12px;">
                                <input type="text" class="tm-input file-item-filename" value="${mw.html.escape(file.name)}" style="margin-bottom: 8px;">
                                <select class="tm-select file-item-license" style="margin-bottom: 8px;">
                                    <option value="">Use global license</option>${licenseOptions}
                                </select>
                                <textarea class="tm-textarea file-item-description" placeholder="Use global description or enter custom..."></textarea>
                                <p class="file-item-meta tm-section-desc" style="margin-top: 6px; margin-bottom: 0;">Size: ${file.size} bytes</p>
                            </div>
                        `;
                        fileList.insertAdjacentHTML('beforeend', fileItemHTML);

                        if (this.config.computeSha1) {
                            const p = computeSHA1(file).done((hash) => {
                                if (hash) {
                                    this.uploadQueue[fileIndex].sha1 = hash;
                                    const el = fileList.querySelector(`[data-file-index="${fileIndex}"] .file-item-meta`);
                                    if (el) el.innerHTML += ' — SHA1: ' + mw.html.escape(hash.substring(0, 10)) + '...';
                                }
                            });
                            promises.push(p);
                        }
                    });

                    $.when.apply($, promises.length ? promises : [$.Deferred().resolve()]).always(() => {
                        const startBtn = this.modal?.element.querySelector('#mass-upload-start-btn') as HTMLButtonElement;
                        if (startBtn) startBtn.disabled = this.uploadQueue.length === 0;
                    });
                },

                logMessage: function (message: string, type: 'info' | 'success' | 'error' | 'warn'): void {
                    if (!this.modal) return;
                    const log = this.modal.element.querySelector('#mass-upload-progress-log');
                    if (log) {
                        const ts = new Date().toLocaleTimeString();
                        const cls = 'tm-log-entry tm-log-' + (type || 'info');
                        log.innerHTML += '<div class="' + cls + '">' + ts + ': ' + mw.html.escape(message) + '</div>';
                        log.scrollTop = log.scrollHeight;
                    }
                },

                startUpload: function (): void {
                    if (this.uploadQueue.length === 0) {
                        mw.notify('No files selected for upload.', { type: 'error' });
                        return;
                    }

                    if (this._running) {
                        this.logMessage('Upload already in progress — ignoring additional Start.', 'info');
                        return;
                    }
                    this._running = true;

                    if (!this.modal) return;
                    const startBtn = this.modal.element.querySelector('#mass-upload-start-btn') as HTMLButtonElement;
                    if (startBtn) startBtn.disabled = true;

                    this._activeFilenames = {};

                    (this.modal.element.querySelector('#mass-upload-progress-section') as HTMLElement).style.display = 'block';
                    (this.modal.element.querySelector('#mass-upload-progress-log') as HTMLElement).innerHTML = '';
                    this.logMessage('Starting upload of ' + this.uploadQueue.length + ' files...', 'info');

                    const queue = this.uploadQueue.slice();
                    let processing = 0;
                    const self = this;

                    // ensure every queue item has state
                    for (let i = 0; i < queue.length; i++) { queue[i]._state = queue[i]._state || 'pending'; }

                    const processNext = function (): void {
                        let anyPending = false;
                        for (let ii = 0; ii < queue.length; ii++) { if (queue[ii]._state === 'pending') { anyPending = true; break; } }
                        
                        if (!anyPending && processing === 0) {
                            self.logMessage('All uploads complete.', 'success');
                            mw.notify('Mass upload finished!');
                            self._running = false;
                            if (startBtn) startBtn.disabled = false;
                            return;
                        }

                        while (queue.length > 0 && processing < self.config.maxConcurrent) {
                            const item = queue.shift();
                            if (!item) continue;
                            if (item._state === 'running' || item._state === 'done') continue;

                            // Compute target name from UI
                            const modalEl = self.modal!.element;
                            const fileContainer = modalEl.querySelector(`[data-file-index="${item.index}"]`);
                            let targetName = item.file.name;
                            if (fileContainer) {
                                const nameInput = fileContainer.querySelector('.file-item-filename') as HTMLInputElement;
                                if (nameInput && nameInput.value.trim()) targetName = nameInput.value.trim();
                            }

                            if (self._activeFilenames[targetName]) {
                                item._state = 'done';
                                self.logMessage('Skipped "' + targetName + '": already being uploaded in this session.', 'info');
                                continue;
                            }

                            item._state = 'running';
                            self._activeFilenames[targetName] = true;
                            processing++;

                            (function (it: UploadQueueItem, tname: string) {
                                setTimeout(function () {
                                    const p = self.processFile(it);
                                    $.when(p).always(function () {
                                        processing--;
                                        try { delete self._activeFilenames[tname]; } catch (e) { self._activeFilenames[tname] = false; }
                                        it._state = 'done';
                                        processNext();
                                    });
                                }, self.config.delay);
                            })(item, targetName);
                        }
                    };

                    processNext();
                },

                processFile: function (item: UploadQueueItem): JQuery.Promise<unknown> {
                    if (!this.modal) return $.Deferred().resolve();
                    const modalEl = this.modal.element;
                    const fileContainer = modalEl.querySelector(`[data-file-index="${item.index}"]`);
                    if (!fileContainer) return $.Deferred().resolve();

                    if (item._state === 'done') return $.Deferred().resolve();
                    item._state = item._state || 'running';

                    const filename = (fileContainer.querySelector('.file-item-filename') as HTMLInputElement).value.trim();
                    const license = (fileContainer.querySelector('.file-item-license') as HTMLSelectElement).value || (modalEl.querySelector('#mass-upload-global-license') as HTMLSelectElement).value;
                    const description = (fileContainer.querySelector('.file-item-description') as HTMLTextAreaElement).value.trim() || (modalEl.querySelector('#mass-upload-global-description') as HTMLTextAreaElement).value.trim();
                    const categories = (modalEl.querySelector('#mass-upload-global-categories') as HTMLInputElement).value.trim();

                    if (!license) { 
                        this.logMessage('Skipping "' + filename + '": No license selected.', 'error'); 
                        return $.Deferred().resolve(); 
                    }

                    const self = this;
                    const checkD = $.Deferred<{ skipped: boolean }>();

                    // server-side check
                    this.api!.get({ action: 'query', titles: 'File:' + filename, format: 'json' }).done(function (data: ApiQueryResponse) {
                        const pages = (data.query && data.query.pages) || {};
                        let exists = false;
                        for (const pId in pages) {
                            if (Object.prototype.hasOwnProperty.call(pages, pId)) {
                                const page = pages[pId];
                                if (!Object.prototype.hasOwnProperty.call(page, 'missing')) { exists = true; break; }
                            }
                        }
                        if (exists) {
                            self.logMessage('Skipping "' + filename + '": File already exists on server (by name).', 'info');
                            checkD.resolve({ skipped: true });
                        } else {
                            checkD.resolve({ skipped: false });
                        }
                    }).fail(function () {
                        self.logMessage('Warning: failed to verify existence for "' + filename + '". Will attempt upload.', 'warn');
                        checkD.resolve({ skipped: false });
                    });

                    return checkD.promise().then(function (check) {
                        if (check.skipped) return $.Deferred().resolve();

                        let fileDescriptionText = '{{' + license + '}}\n\n' + description;
                        if (categories) {
                            const categoryWikitext = categories.split(',').map(function (cat) { return '[[Category:' + cat.trim() + ']]'; }).join('\n');
                            fileDescriptionText += '\n\n' + categoryWikitext;
                        }

                        self.logMessage('Uploading "' + filename + '"...', 'info');

                        return self.api!.upload(item.file, {
                            filename: filename,
                            text: fileDescriptionText,
                            comment: 'Bulk upload via mass upload tool',
                            ignorewarnings: false
                        }).done(function () {
                            self.logMessage('Successfully uploaded "' + filename + '".', 'success');
                        }).fail(function (code: string, result: any) {
                            const errInfo = (result && result.error && result.error.info) || code || 'unknown';
                            const errCode = (result && result.error && result.error.code) || '';
                            
                            if (errCode && /fileexists/i.test(errCode)) {
                                self.logMessage('Skipped "' + filename + '": already exists (server).', 'info');
                            } else if (typeof errInfo === 'string' && /exact duplicate/i.test(errInfo)) {
                                self.logMessage('Skipped "' + filename + '": exact duplicate (server).', 'info');
                            } else {
                                self.logMessage('Failed to upload "' + filename + '": ' + errInfo, 'error');
                            }
                        });
                    });
                },

                addToToolsMenu: function (): void {
                    if (!window.ensureToolsMenu) return;
                    const targetList = window.ensureToolsMenu();
                    if (targetList && !document.getElementById('n-bulk-upload')) {
                        const link = $('<a href="#">Bulk Upload</a>').on('click', (e) => {
                            e.preventDefault();
                            this.openModal();
                        });
                        const item = $('<li id="n-bulk-upload" class="mw-list-item"></li>').append(link);
                        $(targetList).append(item);
                    }
                }
            };

            MassUpload.init.bind(MassUpload)();
        });
    });

})(mediaWiki, jQuery);