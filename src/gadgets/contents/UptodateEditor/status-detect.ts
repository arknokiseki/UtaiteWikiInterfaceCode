/**
 * Detects whether a singer is still active, by reading the free-text `status`
 * parameter of the {{Utaite}} / {{Youtaite}} / {{Singer}} infobox.
 *
 * `status` is genuinely free text. Roughly 94% of live articles resolve
 * cleanly; the remainder are reported as `unknown` so the editor decides,
 * rather than being guessed at.
 *
 * Pure: no `mw` dependency.
 */

import { findTemplateCall, normalizeTemplateName } from './uptodate-params.js';

export type Activity =
    | 'active' | 'inactive' | 'hiatus'
    | 'graduated' | 'deceased' | 'retired' | 'unknown';

export type Confidence = 'confident' | 'ambiguous' | 'unknown';

export interface StatusDetection {
    activity: Activity;
    confidence: Confidence;
    /** Human-readable justification, shown in the modal. */
    evidence: string;
    /** The status value verbatim, or null when absent. */
    raw: string | null;
    /** Whether the force-uptodate checkbox should be pre-ticked. */
    suggestPin: boolean;
}

/** Infobox templates carrying a `status` parameter. {{Singer}} redirects to {{Youtaite}}. */
const INFOBOXES = ['Utaite', 'Youtaite', 'Singer'];

/** Members of Category:Status Templates. */
const STATUS_TEMPLATES: Record<string, Activity> = {
    Active: 'active',
    Inactive: 'inactive',
    Hiatus: 'hiatus',
    Graduated: 'graduated'
};

/** Bare-text values recognised without a template. */
const LEXICON: Record<string, Activity> = {
    active: 'active',
    inactive: 'inactive',
    hiatus: 'hiatus',
    graduated: 'graduated',
    deceased: 'deceased',
    retired: 'retired'
};

/**
 * Activities meaning the song list is complete and will not grow.
 * `hiatus` is deliberately absent: a hiatus is temporary, so the list may
 * still receive updates and must not be pinned as fresh.
 */
const INACTIVE_ISH: Activity[] = ['inactive', 'graduated', 'deceased', 'retired'];

/**
 * Reads the raw `status` value out of an infobox transclusion, reusing the
 * shared brace-aware scanner so nested templates and multi-line values survive.
 */
export function extractStatusParam(wikitext: string): string | null {
    const call = findTemplateCall(wikitext, INFOBOXES);
    if (!call) return null;

    const status = call.params.filter(
        p => p.name !== null && p.name.toLowerCase() === 'status'
    )[0];

    return status ? status.value : null;
}

/** Removes refs, comments and citation noise before interpretation. */
function clean(value: string): string {
    return value
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<ref[^>]*\/>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\{\{\s*[Cc]ite[^}]*\}\}/g, '')
        .trim();
}

/** Names of status templates transcluded in the value, in order. */
function statusTemplatesIn(value: string): Activity[] {
    const found: Activity[] = [];
    const re = /\{\{\s*([^|}]+?)\s*(?:\||\}\})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
        const activity = STATUS_TEMPLATES[normalizeTemplateName(m[1])];
        if (activity) found.push(activity);
    }
    return found;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function result(
    activity: Activity,
    confidence: Confidence,
    evidence: string,
    raw: string | null
): StatusDetection {
    return {
        activity,
        confidence,
        evidence,
        raw,
        suggestPin: confidence === 'confident' && INACTIVE_ISH.indexOf(activity) !== -1
    };
}

/** Classifies the singer's activity from the article wikitext. */
export function detectStatus(wikitext: string): StatusDetection {
    const raw = extractStatusParam(wikitext);
    if (raw === null) {
        return result('unknown', 'unknown', 'No status parameter found in the infobox.', null);
    }

    const value = clean(raw);
    const templates = statusTemplatesIn(value);

    if (templates.length === 1) {
        return result(
            templates[0],
            'confident',
            'Infobox status is {{' + capitalize(templates[0]) + '}}.',
            raw
        );
    }

    if (templates.length > 1) {
        const allInactive = templates.every(t => INACTIVE_ISH.indexOf(t) !== -1);
        if (allInactive) {
            return result(
                templates[0],
                'confident',
                'Infobox status lists only inactive states: ' + templates.join(', ') + '.',
                raw
            );
        }
        return result(
            'unknown',
            'ambiguous',
            'Infobox status mixes several states (' + templates.join(', ')
                + '), so activity cannot be determined automatically.',
            raw
        );
    }

    const bare = LEXICON[value.toLowerCase()];
    if (bare) {
        return result(bare, 'confident', 'Infobox status reads "' + value + '".', raw);
    }

    return result(
        'unknown',
        'unknown',
        'Infobox status is free text that could not be interpreted.',
        raw
    );
}
