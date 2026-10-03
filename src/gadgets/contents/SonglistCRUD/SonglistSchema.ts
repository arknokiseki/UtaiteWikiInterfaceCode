// @keep-use-strict: live runs this strict (see plugins/preserve-use-strict.ts)
/**
 * SonglistSchema
 * Single source of truth for the <Artist>/Songs/songs.json entry shape.
 * Pure: no DOM, no mw.*, no network. Loadable in Node for tests.
 */
(function (root) {
    'use strict';

    // Pipeline-internal fields the bot strips on upload (PROD_DROP_FIELDS in
    // upload_songs_json.py). The gadget must not reintroduce them.
    const PIPELINE_FIELDS = [
        'raw_line', 'parse_method', 'confidence', 'source_page', 'root_artist'
    ];

    /**
     * status is NOT an enum. A corpus sweep found 24 distinct values in live
     * use (56x "Not in Mylist", 24x "reupload", "Age-restricted", "terminated",
     * "WIP", "Blocked in certain countries", ...), and only five values have any
     * rendering effect at all: Module:SonglistFromJson branches on
     * community_only/unlisted/defunct, and the client renderer checks
     * deleted/private. Everything else is inert annotation.
     *
     * So these are SUGGESTIONS offered in the dropdown, not a whitelist. Free
     * entry is allowed and never blocks.
     */
    const STATUS_SUGGESTIONS = ['', 'deleted', 'private', 'community_only', 'unlisted', 'defunct'];

    const SONG_TYPE_ENUM = ['cover', 'original', 'stream', 'privated'];
    const SITE_ENUM = ['yt', 'nnd', 'bb'];

    // key, label, type, group. `derived` fields are never written back.
    const FIELDS = [
        { key: '_rowNo',            label: 'No.',            type: 'derived',  group: 'default', readOnly: true },
        { key: 'title',             label: 'Title',          type: 'wikitext', group: 'default' },
        { key: 'upload_date',       label: 'Upload date',    type: 'date',     group: 'default' },
        { key: 'youtube_id',        label: 'YouTube',        type: 'id',       group: 'default' },
        { key: 'niconico_id',       label: 'NicoNico',       type: 'id',       group: 'default' },
        { key: 'bilibili_id',       label: 'Bilibili',       type: 'id',       group: 'default' },
        { key: 'song_type',         label: 'Song type',      type: 'enum',     group: 'default', enum: SONG_TYPE_ENUM },
        { key: 'status',            label: 'Status',         type: 'suggest',  group: 'default', suggestions: STATUS_SUGGESTIONS },
        { key: 'is_original',       label: 'Original',       type: 'bool',     group: 'default' },
        { key: 'is_self_cover',     label: 'Self-cover',     type: 'bool',     group: 'default' },
        { key: 'featured_artists',  label: 'Feat. artists',  type: 'list',     group: 'default' },

        { key: 'title_translation', label: 'Translation',    type: 'text',     group: 'extra' },
        { key: 'title_note',        label: 'Title note',     type: 'text',     group: 'extra' },
        { key: 'version',           label: 'Version',        type: 'text',     group: 'extra' },
        { key: 'youtube_timestamp', label: 'YT offset',      type: 'int',      group: 'extra' },
        { key: 'notes',             label: 'Notes',          type: 'list',     group: 'extra' },
        { key: 'orikyoku_with',     label: 'Original with',  type: 'list',     group: 'extra' },
        { key: 'other_services',    label: 'Other services', type: 'services', group: 'extra' },
        { key: 'deleted_sites',     label: 'Deleted on',     type: 'sites',    group: 'extra' },
        { key: 'privated_sites',    label: 'Privated on',    type: 'sites',    group: 'extra' },
        { key: 'sort_index',        label: 'sort_index',     type: 'int',      group: 'extra', readOnly: true },
        { key: 'order',             label: 'Day order',      type: 'int',      group: 'extra', readOnly: true }
    ];

    const COLUMNS_ALL = FIELDS.map(function (f) { return f.key; });
    const COLUMNS_DEFAULT = FIELDS.filter(function (f) { return f.group === 'default'; })
        .map(function (f) { return f.key; });

    const BY_KEY = {};
    FIELDS.forEach(function (f) { (BY_KEY as any)[f.key] = f; });

    // Index lookup, so toRow/fromRow do not pay indexOf() per cell across 85k rows.
    const INDEX_OF = {};
    COLUMNS_ALL.forEach(function (k, i) { (INDEX_OF as any)[k] = i; });

    /**
     * Fields present on every canonical entry, in the order the pipeline emits
     * them. blankEntry() follows this so a new row serialises the same way an
     * existing one does -- except for sort_index, which blankEntry deliberately
     * OMITS. Setting it to 0 made normalizeForWrite's assign-next-index branch
     * dead code (0 is a finite number, so the row looked already-indexed) and
     * every row added in the sheet committed as sort_index 0, all colliding.
     *
     * `order` is not here either: it is optional by design. Absent means the
     * song was never deliberately placed, and the sort falls back to title.
     */
    const CANONICAL_ORDER = [
        'title', 'title_translation', 'title_note', 'youtube_id', 'youtube_timestamp',
        'niconico_id', 'bilibili_id', 'other_services', 'upload_date', 'featured_artists',
        'version', 'status', 'notes', 'is_original', 'orikyoku_with', 'is_self_cover',
        'sort_index', 'song_type'
    ];

    function blankEntry() {
        return {
            title: null, title_translation: null, title_note: null,
            youtube_id: null, youtube_timestamp: null, niconico_id: null,
            bilibili_id: null, other_services: [], upload_date: '',
            featured_artists: [], version: null, status: '', notes: [],
            is_original: false, orikyoku_with: [], is_self_cover: false,
            song_type: 'cover'
        };
    }

    /**
     * Entry -> flat row array ordered by COLUMNS_ALL.
     * Values pass through untouched; list/services/sites cells carry the live
     * array reference so the inspector can edit it in place.
     */
    function toRow(entry: any) {
        const row = new Array(COLUMNS_ALL.length);
        for (let i = 0; i < COLUMNS_ALL.length; i++) {
            const key = COLUMNS_ALL[i];
            row[i] = (key === '_rowNo') ? null : (entry ? entry[key] : undefined);
        }
        return row;
    }

    /**
     * Row array + the original entry -> a rebuilt entry.
     *
     * Merges onto `original` so unknown fields survive, and preserves the
     * original's key order so an untouched row re-serialises byte-identically.
     * A column absent from the original is only materialised if the row
     * actually carries a value for it.
     */
    function fromRow(row: any, original: any) {
        const out = {};
        const src = original || {};

        Object.keys(src).forEach(function (key) {
            const idx = (INDEX_OF as any)[key];
            (out as any)[key] = (idx === undefined) ? src[key] : row[idx];
        });

        for (let i = 0; i < COLUMNS_ALL.length; i++) {
            const key = COLUMNS_ALL[i];
            if (key === '_rowNo') { continue; }
            if (Object.prototype.hasOwnProperty.call(out, key)) { continue; }
            if (row[i] === undefined) { continue; }
            (out as any)[key] = row[i];
        }

        return out;
    }

    // ══════════════════════════════════════════════════════════════════
    //  SANITISERS AND VALIDATORS
    //  Patterns below were validated against all 85,745 corpus entries.
    //  See documentation/specs/2026-08-20-songlist-spreadsheet-mode-design.md
    //  ("Rules validated against the corpus") before tightening any of them.
    // ══════════════════════════════════════════════════════════════════

    const RE_YT    = /^[A-Za-z0-9_-]{11}$/;
    const RE_NND   = /^(?:sm|nm|so)?\d+$/;      // prefix optional: 481 bare numeric ids
    const RE_BB    = /^(?:BV[A-Za-z0-9]+|av\d+)$/;
    const RE_ISO   = /^\d{4}-\d{2}-\d{2}$/;
    const RE_YM    = /^\d{4}-\d{2}$/;
    const RE_Y     = /^\d{4}$/;
    /**
     * Multi-date and annotated dates. A song reposted to another platform
     * carries several dates, each optionally tagged:
     *
     *   "2014-04-09, YT 2018-07-19"
     *   "2016-11-21/YT, 2017-09-15/NND"
     *   "2024-07-10, MV 2025-10-24"
     *   "2017-09-09/BB, 2017-09-10/YT, 2017-09-11/NND"
     *   "2018-06-24/BB/Miota, 2018-06-28/YT/NND"
     *   "2025-04-26-27"                              (a two-day event)
     *
     * documentation/backlog.md specifies this as (YYYY.MM.DD/xx/yy) where "xx"
     * is a platform and "yy" is *any string*, so the annotation cannot be
     * whitelisted. Rather than one unreadable regex, every comma-separated
     * segment must simply carry a recognisable date token.
     *
     * upload_date is HTML-escaped by Module:SonglistFromJson (esc(), not
     * frame:preprocess), so this field carries no injection risk and validation
     * here is about data hygiene only. Being permissive is safe.
     */
    const RE_DATE_TOKEN = /\d{4}-(?:\d{2}|n\.d\.|\?\?)/i;
    const RE_YEAR_ONLY  = /^\s*\d{4}\s*$/;

    function isMultiDate(s: any) {
        const parts = s.split(',');
        if (parts.length === 0) { return false; }
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!RE_DATE_TOKEN.test(part) && !RE_YEAR_ONLY.test(part)) { return false; }
        }
        return true;
    }
    // Partial dates with an explicit placeholder for the unknown component.
    // 115 corpus entries: "2021-n.d.", "2016-11-n.d.", "2011-06-??", "2016-11."
    // A deliberate "month known, day unknown" convention, not dirt. These sort
    // correctly by their ISO prefix, so normalizeForWrite needs no special case.
    const RE_PARTIAL = /^\d{4}(?:-(?:\d{2}|n\.d\.|\?\?))?(?:-(?:\d{2}|n\.d\.|\?\?))?\.?$/i;

    const RE_HTTP  = /^https?:\/\//i;
    const RE_SVC   = /^[a-z0-9]+$/;

    const UNKNOWN_DATES = ['n/a', 'n.d.', '-', '', 'unknown'];

    // Templates the renderers understand. Anything else in notes warns.
    const KNOWN_NOTE_TEMPLATES = [
        'UT', 'YTB', 'TWITTER', 'TH', 'YT', 'NND', 'BB',
        'VLW', 'VW', 'VYW', 'VTW', 'JPOP', 'KPOP', 'ULW', 'SVW', 'PSW', 'OW', 'CW', 'DVW'
    ];

    const ID_RULES = {
        youtube_id:  { re: RE_YT,  msg: 'YouTube ids are 11 characters (letters, digits, - and _).' },
        niconico_id: { re: RE_NND, msg: 'NicoNico ids look like sm12345, nm12345, so12345, or a bare number.' },
        bilibili_id: { re: RE_BB,  msg: 'Bilibili ids look like BV1xx411c7mD or av12345.' }
    };

    const SITE_ID_FIELD = { yt: 'youtube_id', nnd: 'niconico_id', bb: 'bilibili_id' };

    // Placeholder standing in for {{!}} while braces are stripped. A control
    // character so it cannot collide with anything a human would type. Built at
    // runtime: the build would print '\u0001' as a raw byte, and MediaWiki turns
    // raw control characters into U+FFFD when the page is saved.
    const PIPE_SENTINEL = String.fromCharCode(1);

    function okResult(value: any, warning: any) {
        return { value: value, changed: false, error: null, warning: warning || null };
    }
    function errResult(value: any, message: any) {
        return { value: value, changed: false, error: message, warning: null };
    }
    function isBlank(v: any) { return v === null || v === undefined || v === ''; }

    /**
     * Strip characters that would break out of a wikitext template call, while
     * preserving [[wikilinks]] and their internal pipe. Port of sanitiseArtist()
     * in Module:SonglistFromJson — these values are interpolated into
     * {{feat|...}} server-side.
     */
    function sanitiseArtist(str: any) {
        let s = String(str === null || str === undefined ? '' : str);
        s = s.replace(/\{\{!\}\}/g, PIPE_SENTINEL);   // survive the brace strip below
        s = s.replace(/[{}]/g, '');

        const out = [];
        let pos = 0;
        while (pos < s.length) {
            const rest = s.slice(pos);
            let m = rest.match(/\[\[.*?\]\]/);
            if (!m) { m = rest.match(/\[[^\]]*\]/); }
            if (!m) {
                out.push(rest.replace(/\|/g, ''));
                break;
            }
            const start = pos + m.index!;
            out.push(s.slice(pos, start).replace(/\|/g, ''));
            out.push(s.substr(start, m[0].length));
            pos = start + m[0].length;
        }
        return out.join('').split(PIPE_SENTINEL).join('|');
    }

    /** Remove C0/C1 control characters that would corrupt the JSON payload. */
    function stripControl(s: any) {
        return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    }

    /**
     * Sanitise one field value.
     *
     * @param {string} key   field key
     * @param {*}      raw   the incoming value
     * @param {Object} entry the row's entry, for cross-field rules (site lists)
     * @returns {{value:*, changed:boolean, error:?string, warning:?string}}
     */
    function sanitizeValue(key: any, raw: any, entry: any) {
        entry = entry || {};
        const field = (BY_KEY as any)[key];
        if (!field) { return (okResult as any)(raw); }

        // ── ids ───────────────────────────────────────────────────────────
        if ((ID_RULES as any)[key]) {
            if (isBlank(raw)) { return (okResult as any)(null); }
            const s = String(raw).trim();
            return (ID_RULES as any)[key].re.test(s) ? (okResult as any)(s) : errResult(raw, (ID_RULES as any)[key].msg);
        }

        // ── upload_date ───────────────────────────────────────────────────
        if (key === 'upload_date') {
            const s = String(raw === null || raw === undefined ? '' : raw).trim();
            if (UNKNOWN_DATES.indexOf(s.toLowerCase()) !== -1) { return (okResult as any)(s); }
            if (RE_ISO.test(s) || RE_YM.test(s) || RE_Y.test(s) ||
                RE_PARTIAL.test(s) || isMultiDate(s)) {
                return (okResult as any)(s);
            }
            return errResult(raw, 'Use YYYY-MM-DD, a partial date like 2016-11 or ' +
                                  '2011-06-??, a multi-date like ' +
                                  '"2014-04-09, YT 2018-07-19", or N/A.');
        }

        // ── integers ──────────────────────────────────────────────────────
        if (field.type === 'int') {
            if (isBlank(raw)) { return (okResult as any)(null); }
            const n = Number(raw);
            if (!Number.isInteger(n) || n < 0) {
                return errResult(raw, 'Must be a whole number, 0 or greater.');
            }
            return (okResult as any)(n);
        }

        // ── booleans ──────────────────────────────────────────────────────
        if (field.type === 'bool') {
            return (okResult as any)(raw === true || raw === 'true' || raw === 1 || raw === '1');
        }

        // ── enums ─────────────────────────────────────────────────────────
        if (field.type === 'enum') {
            const s = raw === null || raw === undefined ? '' : String(raw);
            if (field.enum.indexOf(s) !== -1) { return (okResult as any)(s); }
            return errResult(raw, 'Must be one of: ' +
                field.enum.map(function (v: any) { return v || '(blank)'; }).join(', '));
        }

        // ── site lists ────────────────────────────────────────────────────
        // These are concatenated into {{Deleted media|site=...}} server-side,
        // so an unconstrained value here is template injection.
        if (field.type === 'sites') {
            const arr = Array.isArray(raw) ? raw : [];
            for (let i = 0; i < arr.length; i++) {
                const site = String(arr[i]);
                if (SITE_ENUM.indexOf(site) === -1) {
                    return errResult(raw, 'Sites must be yt, nnd or bb.');
                }
                if (isBlank(entry[(SITE_ID_FIELD as any)[site]])) {
                    return errResult(raw, 'Cannot mark ' + site + ' — this row has no ' +
                                          (SITE_ID_FIELD as any)[site] + '.');
                }
            }
            return (okResult as any)(arr);
        }

        // ── other_services ────────────────────────────────────────────────
        if (field.type === 'services') {
            const arr = Array.isArray(raw) ? raw : [];
            for (let i = 0; i < arr.length; i++) {
                const svc = arr[i] || {};
                const name = String(svc.service_name || '');
                const link = String(svc.video_link || '');
                if (!RE_SVC.test(name)) {
                    return errResult(raw, 'Service names must be lowercase letters and digits only.');
                }
                if (link && !RE_HTTP.test(link)) {
                    return errResult(raw, 'Links must start with http:// or https://.');
                }
            }
            return (okResult as any)(arr);
        }

        // ── free lists ────────────────────────────────────────────────────
        if (field.type === 'list') {
            const arr = (Array.isArray(raw) ? raw : []).map(String);

            if (key === 'notes') {
                // Notes are expanded as wikitext server-side and legitimately
                // contain templates, so this warns and never blocks. The durable
                // fix is render-side (F2) and is tracked separately.
                let warning: any = null;
                arr.forEach(function (n) {
                    const found = n.match(/\{\{([^|{}\n]+)/g) || [];
                    found.forEach(function (t) {
                        const name = t.slice(2).trim().toUpperCase();
                        if (KNOWN_NOTE_TEMPLATES.indexOf(name) === -1 && !warning) {
                            warning = 'Unrecognised template {{' + name + '}} — it will be ' +
                                      'expanded on the page. Double-check it is intentional.';
                        }
                    });
                });
                return okResult(arr, warning);
            }

            return (okResult as any)(arr.map(sanitiseArtist));
        }

        // ── suggested-value free text (status) ──────────────────────
        // Offers canonical values but accepts anything. Never blocks: unknown
        // values are inert in both renderers, and 135 live entries rely on it.
        if (field.type === 'suggest') {
            const s = raw === null || raw === undefined ? '' : String(raw);
            return (okResult as any)(stripControl(s));
        }

        // ── plain text / wikitext ─────────────────────────────────
        if (isBlank(raw)) { return (okResult as any)(raw === '' ? '' : null); }
        return (okResult as any)(stripControl(String(raw)));
    }

    /**
     * Sort key for a possibly-partial, annotated or multi-date upload_date.
     *
     * Plain string comparison already sorts on the first date, because that
     * date is a leading ISO prefix in every accepted form:
     *   "2014-04-09, YT 2018-07-19" -> "2014-04-09, ..."
     *   "2016-11-21/YT"             -> "2016-11-21/..."
     * Unknown and blank dates sort last.
     */
    function dateSortKey(entry: any) {
        const raw = String((entry && entry.upload_date) || '').trim();
        if (!raw || UNKNOWN_DATES.indexOf(raw.toLowerCase()) !== -1) { return '9999-12-31'; }
        // Pull the first YYYY-MM-DD out, so 'nnd-2012-10-10, yt-2021-12-13' and
        // 'Album Release Date: 2011-06-29' sort by their real date instead of by
        // the letter they happen to start with. Mirrors the Lua module.
        //
        // The digit guards on both sides matter: without them the malformed
        // '20215-10-13' (Eruno, a typo'd year) matches at offset 1 and the song
        // sorts as year 215. Unparseable strings fall through to raw compare.
        const m = raw.match(/(?:^|[^0-9])([0-9]{4}-[0-9]{2}-[0-9]{2})(?:[^0-9]|$)/);
        return m ? m[1] : raw;
    }

    /**
     * Rank within one date group. Absent means the song was never deliberately
     * placed, so it sorts after every song that was, and then by title.
     */
    function orderKey(entry: any) {
        const v = entry && entry.order;
        return (typeof v === 'number' && isFinite(v) && v >= 1) ? v : Infinity;
    }

    /**
     * THE sort key. Four implementations must stay identical: this one,
     * SonglistCRUD.sortByDate, the two table.sort calls in
     * Module:SonglistFromJson, and finalize_output.get_sort_key.
     *
     * The title tiebreak is not cosmetic -- it makes the comparison TOTAL,
     * which is the only reason Lua's table.sort (not stable) can agree with
     * JS's (stable). Before it, songs sharing a date came out in file order on
     * desktop and in quicksort-partition order on mobile: 6,152 songs across
     * 530 of 876 pages, showing two different orders on the same wiki.
     */
    function compareEntries(a: any, b: any) {
        const da = dateSortKey(a), db = dateSortKey(b);
        if (da !== db) { return da < db ? -1 : 1; }
        const oa = orderKey(a), ob = orderKey(b);
        if (oa !== ob) { return oa < ob ? -1 : 1; }
        const ta = String((a && a.title) || ''), tb = String((b && b.title) || '');
        return ta < tb ? -1 : ta > tb ? 1 : 0;
    }

    /**
     * The entries sharing `entry`'s date group, as live references, in sort
     * order. This is the unit the placement UI works on: `order` only ever
     * compares songs inside one group and is meaningless across groups.
     */
    function groupOf(entries: any, entry: any) {
        const k = dateSortKey(entry);
        return (entries || [])
            .filter(function (e: any) { return dateSortKey(e) === k; })
            .sort(compareEntries);
    }

    /**
     * Stamp a dense 1..n `order` across one group, in the order given.
     *
     * Dense rather than sparse: the largest same-day cluster in the corpus is
     * 43 and the typical one is 2-3, so there is nothing to gain from leaving
     * gaps and a real cost to numbers that drift out of meaning.
     *
     * The whole group is stamped, not just the moved song. A half-ranked group
     * is legal (absent sorts last) but reads as a bug to the next editor.
     */
    function applyGroupOrder(group: any) {
        (group || []).forEach(function (e: any, n: any) { e.order = n + 1; });
        return group;
    }

    /**
     * Prepare the array for writing: drop pipeline-internal fields, sort by
     * upload_date ascending, and give any row that lacks a sort_index one.
     *
     * sort_index is deliberately NOT reindexed. In the pipeline it is the source
     * line number (run_pipeline.py:188 enumerates typed_lines), it feeds the
     * dedupe key (run_pipeline.py:116) and finalize_output.py takes min() of it
     * when merging, listing it in _NEVER_MERGE. Nothing on the wiki reads it at
     * all -- Module:SonglistFromJson never mentions it and the client renderer
     * numbers rows with meta.row + 1. Rewriting it to array position would both
     * destroy that meaning and rewrite ~99% of rows on the first commit (265/266
     * on Ado, 645/652 on Soraru, whose first row carries sort_index 499).
     *
     * Does not mutate the input. Normalising an untouched page is a no-op, which
     * is what keeps commit diffs limited to the rows actually edited.
     */
    function normalizeForWrite(entries: any) {
        const copy = (entries || []).map(function (entry: any) {
            const clean = {};
            Object.keys(entry).forEach(function (key) {
                if (PIPELINE_FIELDS.indexOf(key) === -1) { (clean as any)[key] = entry[key]; }
            });
            return clean;
        });

        copy.sort(compareEntries);

        // Rows added in the sheet have no sort_index yet. Continue past the
        // highest existing value so a new row never collides with an old one.
        let next = 0;
        copy.forEach(function (entry: any) {
            const v = entry.sort_index;
            if (typeof v === 'number' && isFinite(v) && v > next) { next = v; }
        });
        copy.forEach(function (entry: any) {
            const v = entry.sort_index;
            if (typeof v !== 'number' || !isFinite(v)) {
                next += 1;
                entry.sort_index = next;
            }
        });

        return copy;
    }

    /**
     * Validate every field present on an entry. Returns [] when clean.
     *
     * NOTE: this checks the WHOLE entry, so it will flag pre-existing dirty
     * values the editor never touched. Per spec D3 the sheet must not block on
     * those — commit gating uses only the per-cell errors recorded when the
     * editor actually edits something. Use validateEntry for rows the editor
     * added (where every field is theirs) and for diagnostics.
     */
    function validateEntry(entry: any) {
        const problems = [];
        for (let i = 0; i < COLUMNS_ALL.length; i++) {
            const key = COLUMNS_ALL[i];
            if (key === '_rowNo') { continue; }
            if (!Object.prototype.hasOwnProperty.call(entry, key)) { continue; }
            const res = sanitizeValue(key, entry[key], entry);
            if (res.error) { problems.push({ field: key, message: res.error }); }
        }
        return problems;
    }

    const api = {
        FIELDS: FIELDS,
        sanitizeValue: sanitizeValue,
        validateEntry: validateEntry,
        normalizeForWrite: normalizeForWrite,
        dateSortKey: dateSortKey,
        orderKey: orderKey,
        compareEntries: compareEntries,
        groupOf: groupOf,
        applyGroupOrder: applyGroupOrder,
        sanitiseArtist: sanitiseArtist,
        KNOWN_NOTE_TEMPLATES: KNOWN_NOTE_TEMPLATES,
        UNKNOWN_DATES: UNKNOWN_DATES,
        BY_KEY: BY_KEY,
        COLUMNS_ALL: COLUMNS_ALL,
        COLUMNS_DEFAULT: COLUMNS_DEFAULT,
        CANONICAL_ORDER: CANONICAL_ORDER,
        PIPELINE_FIELDS: PIPELINE_FIELDS,
        STATUS_SUGGESTIONS: STATUS_SUGGESTIONS,
        SONG_TYPE_ENUM: SONG_TYPE_ENUM,
        SITE_ENUM: SITE_ENUM,
        blankEntry: blankEntry,
        toRow: toRow,
        fromRow: fromRow
    };

    (root as any).SonglistSchema = api;
    // (live also sets module.exports = api for Node tests; dropped here because a free
    // `module` makes the esm build wrap this file as CommonJS, and nothing on the wiki
    // require()s this gadget)

})(typeof window !== 'undefined' ? window : globalThis);

export {};
