/**
 * UptodateEditor — adds an "Update" button to the rendered freshness box and
 * opens a modal to edit the {{Uptodate}} parameters behind it.
 *
 * The box renders on both the article (via {{Uptodate/sync}}) and its /Songs
 * subpage, but the wikitext lives on only one of them; see page-target.ts.
 */

import { applyEdits, findUptodateCall } from './uptodate-params.js';
import type { UptodateEdits } from './uptodate-params.js';
import { detectStatus } from './status-detect.js';
import {
    resolveTarget,
    fetchPage,
    savePage,
    formatJstDate
} from './page-target.js';
import type { WikiApi, FetchedPage } from './page-target.js';
import { openUptodateModal } from './uptodate-modal.js';

interface MwApiConstructor {
    new (): WikiApi;
}

declare const mw: {
    config: { get: (key: string) => unknown };
    Api: MwApiConstructor;
};

declare global {
    interface Window {
        uptodateEditorLoaded?: boolean;
    }
}

(function (): void {
    'use strict';

    if (window.uptodateEditorLoaded) return;
    window.uptodateEditorLoaded = true;

    const SUMMARY = 'Update song list freshness via UptodateEditor';

    function isPermitted(): boolean {
        const groups = (mw.config.get('wgUserGroups') || []) as string[];
        const name = mw.config.get('wgUserName');
        if (!name) return false;
        return groups.indexOf('autoconfirmed') !== -1
            || groups.indexOf('sysop') !== -1;
    }

    function makeButton(): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ute-open';
        button.textContent = 'Update Freshness';
        button.setAttribute('aria-label', 'Update song list freshness');
        return button;
    }

    async function launch(button: HTMLButtonElement): Promise<void> {
        const api = new mw.Api();
        const pageName = mw.config.get('wgPageName') as string;

        button.disabled = true;
        button.textContent = 'Loading…';

        try {
            const current = await fetchPage(api, pageName);
            const target = resolveTarget(pageName, current ? current.content : '');

            const editPage: FetchedPage | null = target.editTitle === pageName
                ? current
                : await fetchPage(api, target.editTitle);

            if (!editPage) {
                window.alert(
                    'Could not load ' + target.editTitle
                    + '. The page may not exist, so there is nothing to update.'
                );
                return;
            }

            const call = findUptodateCall(editPage.content);
            if (!call) {
                window.alert(
                    'No {{Uptodate}} template found in ' + target.editTitle + '.'
                );
                return;
            }

            const rootPage = target.rootTitle === editPage.title
                ? editPage
                : await fetchPage(api, target.rootTitle);
            const detection = detectStatus(rootPage ? rootPage.content : '');

            openUptodateModal({
                editTitle: editPage.title,
                call: call,
                detection: detection,
                fallbackDate: formatJstDate(new Date()),
                preview: (edits: UptodateEdits): string => {
                    const next = applyEdits(editPage.content, edits);
                    if (!next) return '';
                    const nextCall = findUptodateCall(next);
                    return nextCall ? next.slice(nextCall.start, nextCall.end) : '';
                },
                onSave: async (edits: UptodateEdits): Promise<void> => {
                    // Re-fetch so a save always builds on the newest revision;
                    // basetimestamp still rejects a race that lands in between.
                    const fresh = await fetchPage(api, editPage.title);
                    if (!fresh) throw { error: { info: 'Page disappeared.' } };
                    const next = applyEdits(fresh.content, edits);
                    if (!next) throw { error: { info: 'Template no longer present.' } };
                    await savePage(api, fresh, next, SUMMARY);
                }
            });
        } catch (err) {
            const e = err as { error?: { info?: string } };
            window.alert('UptodateEditor failed: ' + ((e && e.error && e.error.info) || 'unknown error.'));
        } finally {
            button.disabled = false;
            button.textContent = 'Update Freshness';
        }
    }

    function init(): void {
        if (!isPermitted()) return;

        const boxes = document.querySelectorAll('.freshness-box');
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            if (box.querySelector('.ute-open')) continue;

            const cta = box.querySelector('.freshness-cta');
            const host = cta || box.querySelector('.freshness-body');
            if (!host) continue;

            const button = makeButton();
            button.addEventListener('click', () => { void launch(button); });
            host.appendChild(button);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
