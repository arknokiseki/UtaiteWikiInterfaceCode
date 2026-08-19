/**
 * Standalone modal for editing {{Uptodate}} parameters.
 *
 * Deliberately NOT built on the shared ModalBuilder gadget: that one hard-gates
 * on admin groups and returns early for everyone else, which would lock out the
 * autoconfirmed editors this tool is for. Visual tokens are mirrored in
 * UptodateEditor.less so it still looks native.
 */

import type { UptodateEdits, TemplateCall } from './uptodate-params.js';
import type { StatusDetection } from './status-detect.js';
import { classifyColor, describeColor } from './css-color.js';

export interface ModalOptions {
    /** Page being edited, shown in the header. */
    editTitle: string;
    /** The parsed call, used to prefill the form. */
    call: TemplateCall;
    /** Inactivity detection result, used for the force-uptodate suggestion. */
    detection: StatusDetection;
    /** Date to prefill when the call has none. */
    fallbackDate: string;
    /** Renders the wikitext that the given edits would produce. */
    preview: (edits: UptodateEdits) => string;
    /** Invoked with the final edits when the user saves. */
    onSave: (edits: UptodateEdits) => Promise<void>;
}

const NAMED_FIELDS = [
    { key: 'reason', label: 'Reason', hint: 'Overrides the status line. Setting this forces "outdated".' },
    { key: 'discography', label: 'Discography', hint: 'Set to yes when the discography is covered too.' },
    { key: 'needrom', label: 'Needs romanization', hint: 'Adds the romanization-required category.' },
    { key: 'nocat', label: 'No categories', hint: 'Set to true to suppress categorization.' },
    { key: 'bordercolor', label: 'Border colour', hint: 'Hex value, e.g. #A97A3F.' }
] as const;

function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

/** Reads a named parameter's current value out of the parsed call. */
function currentValue(call: TemplateCall, name: string): string {
    const param = call.params.filter(p => p.name === name)[0];
    return param ? param.value : '';
}

/** Reads the current date: the named updated-at alias, else positional 1. */
function currentDate(call: TemplateCall): string {
    const alias = call.params.filter(p => p.name === 'updated-at')[0];
    if (alias) return alias.value;
    const first = call.params.filter(p => p.index === 1)[0];
    return first ? first.value : '';
}

function describeError(err: unknown): string {
    const e = err as { error?: { code?: string; info?: string } };
    if (e && e.error && e.error.code === 'editconflict') {
        return 'someone else edited the page. Reload and try again.';
    }
    if (e && e.error && e.error.info) return e.error.info;
    return 'unknown error.';
}

export function openUptodateModal(options: ModalOptions): void {
    const overlay = el('div', 'ute-overlay');
    const modal = el('div', 'ute-modal');
    overlay.appendChild(modal);

    // --- Header ---
    const header = el('div', 'ute-header');
    header.appendChild(el('h2', 'ute-title', 'Update song list freshness'));
    header.appendChild(el('div', 'ute-subtitle', 'Editing ' + options.editTitle));
    const closeBtn = el('button', 'ute-close', '×') as HTMLButtonElement;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const body = el('div', 'ute-body');
    modal.appendChild(body);

    // --- Date ---
    const dateRow = el('div', 'ute-field');
    dateRow.appendChild(el('label', 'ute-label', 'Last updated'));
    const dateInput = el('input', 'ute-input') as HTMLInputElement;
    dateInput.type = 'text';
    dateInput.value = currentDate(options.call) || options.fallbackDate;
    dateRow.appendChild(dateInput);
    dateRow.appendChild(el('div', 'ute-hint', 'Date of the most recent upload, e.g. March 1, 2026.'));
    const dateError = el('div', 'ute-error');
    dateError.style.display = 'none';
    dateRow.appendChild(dateError);
    body.appendChild(dateRow);

    // --- force-uptodate ---
    const pinRow = el('div', 'ute-field ute-pin');
    const pinLabel = el('label', 'ute-check');
    const pinInput = el('input') as HTMLInputElement;
    pinInput.type = 'checkbox';
    pinInput.checked = options.detection.suggestPin;
    pinLabel.appendChild(pinInput);
    pinLabel.appendChild(el('span', undefined, 'Force up-to-date'));
    pinRow.appendChild(pinLabel);
    pinRow.appendChild(el(
        'div',
        'ute-hint',
        'Keeps the list marked up-to-date regardless of age. Use when the singer is no longer active, so the list is complete.'
    ));

    const evidence = el('div', 'ute-evidence ute-' + options.detection.confidence);
    evidence.appendChild(el('div', undefined, options.detection.evidence));
    if (options.detection.raw !== null && options.detection.confidence !== 'confident') {
        const raw = el('div', 'ute-raw');
        raw.appendChild(el('span', 'ute-raw-label', 'Status reads: '));
        // textContent, never innerHTML — this is unsanitized wiki input.
        raw.appendChild(el('code', undefined, options.detection.raw));
        evidence.appendChild(raw);
    }
    pinRow.appendChild(evidence);
    body.appendChild(pinRow);

    // --- Remaining named fields ---
    const inputs: Record<string, HTMLInputElement> = {};
    // Swatch + verdict for bordercolor, since Freshness silently ignores values
    // it does not recognise and falls back to its default colour.
    let colorNote: HTMLElement | null = null;
    let colorSwatch: HTMLElement | null = null;

    for (const field of NAMED_FIELDS) {
        const row = el('div', 'ute-field');
        row.appendChild(el('label', 'ute-label', field.label));

        const input = el('input', 'ute-input') as HTMLInputElement;
        input.type = 'text';
        input.value = currentValue(options.call, field.key);

        if (field.key === 'bordercolor') {
            const wrap = el('div', 'ute-color-row');
            colorSwatch = el('span', 'ute-swatch');
            wrap.appendChild(input);
            wrap.appendChild(colorSwatch);
            row.appendChild(wrap);
        } else {
            row.appendChild(input);
        }

        row.appendChild(el('div', 'ute-hint', field.hint));

        if (field.key === 'bordercolor') {
            colorNote = el('div', 'ute-hint ute-color-note');
            row.appendChild(colorNote);
        }

        body.appendChild(row);
        inputs[field.key] = input;
    }

    // --- Preview ---
    const previewWrap = el('div', 'ute-field');
    previewWrap.appendChild(el('label', 'ute-label', 'Resulting wikitext'));
    const previewBox = el('pre', 'ute-preview');
    previewWrap.appendChild(previewBox);
    body.appendChild(previewWrap);

    // --- Footer ---
    const footer = el('div', 'ute-footer');
    const status = el('div', 'ute-status');
    const cancelBtn = el('button', 'ute-btn ute-btn-secondary', 'Cancel') as HTMLButtonElement;
    cancelBtn.type = 'button';
    const saveBtn = el('button', 'ute-btn ute-btn-primary', 'Save') as HTMLButtonElement;
    saveBtn.type = 'button';
    footer.appendChild(status);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    /** Collects the form into an edit set. Blank named fields become removals. */
    function collect(): UptodateEdits {
        const edits: UptodateEdits = { date: dateInput.value.trim() };
        for (const field of NAMED_FIELDS) {
            const value = inputs[field.key].value.trim();
            (edits as Record<string, string | null>)[field.key] = value === '' ? null : value;
        }
        edits['force-uptodate'] = pinInput.checked ? 'yes' : null;
        return edits;
    }

    function refreshColor(): void {
        if (!colorNote || !colorSwatch) return;
        const value = inputs['bordercolor'].value;
        const kind = classifyColor(value);

        colorNote.textContent = describeColor(value);
        colorNote.className = 'ute-hint ute-color-note ute-color-' + kind;

        // The browser is the authority on whether a colour is renderable, so
        // just hand it the raw value and see whether it sticks.
        colorSwatch.style.background = '';
        if (kind !== 'empty' && kind !== 'invalid') {
            colorSwatch.style.background = value.trim();
        }
        colorSwatch.style.visibility = kind === 'empty' ? 'hidden' : 'visible';
    }

    function refresh(): void {
        previewBox.textContent = options.preview(collect());
        const empty = dateInput.value.trim() === '';
        saveBtn.disabled = empty;
        dateError.style.display = empty ? '' : 'none';
        dateError.textContent = empty ? 'A date is required.' : '';
        refreshColor();
    }

    function onKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') close();
    }

    function close(): void {
        document.removeEventListener('keydown', onKeydown);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    dateInput.addEventListener('input', refresh);
    pinInput.addEventListener('change', refresh);
    for (const field of NAMED_FIELDS) {
        inputs[field.key].addEventListener('input', refresh);
    }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKeydown);

    saveBtn.addEventListener('click', () => {
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        status.className = 'ute-status';
        status.textContent = 'Saving…';
        options.onSave(collect()).then(
            () => { close(); window.location.reload(); },
            (err: unknown) => {
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
                status.className = 'ute-status ute-status-error';
                status.textContent = 'Save failed: ' + describeError(err);
            }
        );
    });

    document.body.appendChild(overlay);
    refresh();
    dateInput.focus();
}
