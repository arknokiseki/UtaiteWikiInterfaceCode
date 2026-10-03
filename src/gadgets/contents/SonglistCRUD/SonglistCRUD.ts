// @keep-use-strict: live runs this strict (see plugins/preserve-use-strict.ts)
/**
 * SonglistCRUD Gadget
 * Adds Add / Edit / Delete controls to SonglistTable datatables.
 * Reads and writes <Artist>/Songs/songs.json via the MediaWiki API.
 */
(function ($, mw) {
    'use strict';
    console.info("[SonglistCRUD] init")

    // ── Mobile / desktop view switch ──────────────────────────────────────────
    // Mirror the same check used by datatables-helper so the two gadgets agree.
    // Run immediately (before DT init) so the raw table never flashes on mobile.
    var isMobile = document.body.classList.contains('mw-mf') ||
        document.body.classList.contains('is-mobile-device');

    // Published so Gadget-SonglistSheet.js can re-check independently. The
    // spreadsheet libraries are ~340 KB and must never be DOWNLOADED on mobile,
    // not merely never shown -- see the mobile section of the test checklist.
    (window as any).SLCRUD_IS_MOBILE = isMobile;

    if (isMobile) {
        // Hide the desktop DataTable wrapper, reveal the static mobile list.
        // Gadget-mobile-datatables-helper already skips .songlist-desktop tables.
        $('.songlist-desktop').hide();
        $('.songlist-mobile').show();
        return; // nothing else in this gadget is useful on mobile (read-only)
    }
    // Desktop: enforce mobile list hidden (belt-and-suspenders alongside CSS)
    $('.songlist-mobile').hide();

    // ══════════════════════════════════════════════════════════════════
    //  CONFIG
    // ══════════════════════════════════════════════════════════════════

    /** Minimum milliseconds between successive API writes (rate limiting). */
    const WRITE_MIN_INTERVAL_MS = 1200;

    /** Maximum retries on a rate-limited (HTTP 429 / maxlag) response. */
    const MAX_RETRIES = 4;

    const JSON_SUFFIX = '/Songs/songs.json';

    const _filterMemory = {};

    // ══════════════════════════════════════════════════════════════════
    //  RATE-LIMITED WRITE QUEUE
    // ══════════════════════════════════════════════════════════════════

    let lastWriteAt = 0;
    let writeChain = Promise.resolve();

    /**
     * Queue a write operation so that writes are spaced at least
     * WRITE_MIN_INTERVAL_MS apart. Retries on maxlag / 429.
     */
    function scheduleWrite(fn: any) {
        writeChain = writeChain.then(() => {
            const gap = WRITE_MIN_INTERVAL_MS - (Date.now() - lastWriteAt);
            return new Promise(res => setTimeout(res, Math.max(0, gap)))
                .then(() => retryWrite(fn, 0))
                .then(() => { lastWriteAt = Date.now(); });
        });
        return writeChain;
    }

    function retryWrite(fn: any, attempt: any) {
        return fn().catch((err: any) => {
            const code = err && err.code;
            if (attempt < MAX_RETRIES && (code === 'maxlag' || code === 'ratelimited')) {
                const delay = Math.pow(2, attempt) * 1000;
                return new Promise(res => setTimeout(res, delay))
                    .then(() => retryWrite(fn, attempt + 1));
            }
            return Promise.reject(err);
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  MEDIAWIKI API HELPERS
    // ══════════════════════════════════════════════════════════════════

    /**
     * Read a songs.json page.
     *
     * Returns the revision metadata alongside the content so callers can pass a
     * conflict guard to writeJson. Without it, two people editing the same page
     * silently overwrite each other -- and a whole-file spreadsheet commit turns
     * that from "lost one row" into "reverted everything they did".
     *
     * @returns {Promise<{songs: Array, revid: ?number, timestamp: ?string,
     *                    curtimestamp: string}>}
     */
    function readJson(title: any) {
        return new mw.Api().get({
            action: 'query',
            titles: title,
            prop: 'revisions',
            rvprop: 'content|ids|timestamp',
            rvslots: 'main',
            curtimestamp: 1,
            formatversion: 2,
        }).then(function (r) {
            const page = r.query.pages[0];
            const curtimestamp = r.curtimestamp;
            if (page.missing) {
                return { songs: [], revid: null, timestamp: null, curtimestamp: curtimestamp };
            }
            const rev = page.revisions[0];
            return {
                songs: JSON.parse(rev.slots.main.content),
                revid: rev.revid,
                timestamp: rev.timestamp,
                curtimestamp: curtimestamp,
            };
        });
    }

    /**
     * @param {Object} [guard] - { basetimestamp, starttimestamp } from readJson.
     *   With it, MediaWiki rejects the edit with code 'editconflict' if the page
     *   moved underneath us. Omit only for a write that genuinely intends
     *   last-write-wins.
     */
    function writeJson(title: any, songs: any, summary: any, guard: any) {
        return scheduleWrite(function () {
            const params = {
                action: 'edit',
                title: title,
                text: JSON.stringify(songs, null, 2),
                summary: summary,
                contentmodel: 'json',
                bot: false,
            };
            if (guard && guard.basetimestamp) {
                (params as any).basetimestamp = guard.basetimestamp;
                (params as any).starttimestamp = guard.starttimestamp;
            }
            return new mw.Api().postWithToken('csrf', params);
        });
    }

    /**
     * Turn an mw.Api rejection into something an editor can act on.
     *
     * mw.Api rejects jQuery-style with (code, result), so `err` is normally the
     * bare code string ('editconflict', 'permissiondenied', ...) and the human
     * text lives in result.error.info. Both shapes are accepted here because
     * a thrown Error can also reach these handlers (e.g. JSON.parse failing).
     *
     * @param {string|Error} err     first rejection argument
     * @param {Object}       result  second rejection argument, if any
     * @param {string}       prefix  fallback lead-in, e.g. 'Save failed'
     * @returns {string}
     */
    function apiErrorMessage(err: any, result: any, prefix: any) {
        const code = (typeof err === 'string') ? err : ((err && err.code) || '');
        const info = (result && result.error && result.error.info) ||
                     (err && (err.info || err.message)) || '';

        switch (code) {
            case 'editconflict':
                return 'Someone else edited this song list while you were working. ' +
                       'Nothing was saved — reload the page and try again.';
            case 'permissiondenied':
            case 'protectedpage':
            case 'cascadeprotected':
                return 'You do not have permission to edit this page.';
            case 'abusefilter-disallowed':
            case 'abusefilter-warning':
            case 'spamblacklist':
                // Show the filter's own wording rather than paraphrasing a
                // moderation decision.
                return 'The wiki refused this edit: ' + (info || code);
            case 'readonly':
                return 'The wiki is in read-only mode right now. Try again shortly.';
            case 'http':
                return prefix + ': network error — check your connection and try again.';
            default:
                return prefix + ': ' + (info || code || String(err));
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  JSON PAGE INFERENCE
    // ══════════════════════════════════════════════════════════════════

    /**
     * Extracts the artist root name from the table's "dt-songlist-X" class
     * and appends /Songs/songs.json.
     */
    function getJsonPage($table: any) {
        const cls = ($table.attr('class') || '').split(' ');
        for (let i = 0; i < cls.length; i++) {
            if (cls[i].startsWith('dt-songlist-')) {
                const encoded = cls[i].slice('dt-songlist-'.length);
                const name = decodeURIComponent(encoded.replace(/_/g, ' '));
                return name + JSON_SUFFIX;
            }
        }
        // Fallback: derive from current page title
        const base = (mw.config.get('wgTitle') || '').split('/')[0];
        return base + JSON_SUFFIX;
    }

    // ══════════════════════════════════════════════════════════════════
    //  SONG ARRAY HELPERS
    // ══════════════════════════════════════════════════════════════════

    /**
     * Sort by the ONE key, which lives in SonglistSchema so that this gadget,
     * the sheet, Module:SonglistFromJson and finalize_output.py cannot drift
     * apart. Name kept for its call sites; it is no longer date-only.
     */
    function sortByDate(songs: any) {
        return songs.slice().sort(Schema().compareEntries);
    }

    /** Lazy handle on the schema module (same RL bundle, loaded before us). */
    function Schema() {
        if (!(window as any).SonglistSchema) {
            throw new Error('[SonglistCRUD] SonglistSchema is not loaded');
        }
        return (window as any).SonglistSchema;
    }

    /**
     * Enough of an entry to recognise it again after a re-read. The placement
     * select is built against one snapshot of the JSON and applied against a
     * fresher one, so it cannot refer to songs by array index.
     */
    function identity(song: any) {
        const SEP = String.fromCharCode(31);
        return [song.title, song.upload_date, song.youtube_id,
                song.niconico_id, song.bilibili_id]
            .map(function (v) { return v == null ? '' : String(v); })
            .join(SEP);
    }

    /**
     * Put `entry` immediately after the song identified by `afterKey` inside
     * their shared date group, and stamp a dense 1..n `order` over that group.
     * `afterKey === FIRST` means "first of the day".
     *
     * Returns false when the target song is gone -- somebody else edited the
     * page between opening the form and saving -- so the caller can say so
     * rather than silently placing the song somewhere arbitrary.
     */
    var PLACE_FIRST = '__first__';

    function applyPlacement(songs: any, entry: any, afterKey: any) {
        const S = Schema();
        const group = S.groupOf(songs, entry);
        const rest = group.filter(function (e: any) { return e !== entry; });

        let at = 0;
        if (afterKey !== PLACE_FIRST) {
            let idx = -1;
            for (let i = 0; i < rest.length; i++) {
                if (identity(rest[i]) === afterKey) { idx = i; break; }
            }
            if (idx === -1) { return false; }
            at = idx + 1;
        }
        rest.splice(at, 0, entry);
        S.applyGroupOrder(rest);
        return true;
    }

    /**
     * Give any song that lacks a sort_index one, continuing past the highest
     * existing value. Existing values are left alone.
     *
     * This used to reassign sort_index = array position on every write. That was
     * wrong: sort_index is the source line number in the pipeline
     * (run_pipeline.py:188), it feeds the dedupe key (run_pipeline.py:116) and
     * finalize_output.py takes min() of it while listing it in _NEVER_MERGE.
     * Nothing on the wiki reads it -- Module:SonglistFromJson never mentions it
     * and the client renderer numbers rows with meta.row + 1. Reassigning it
     * destroyed pipeline data and rewrote almost every row of the file on every
     * single-song edit (265 of 266 rows on Ado).
     *
     * Kept in sync with SonglistSchema.normalizeForWrite().
     */
    function reindex(songs: any) {
        let next = 0;
        songs.forEach(function (s: any) {
            const v = s.sort_index;
            if (typeof v === 'number' && isFinite(v) && v > next) { next = v; }
        });
        return songs.map(function (s: any) {
            const v = s.sort_index;
            if (typeof v === 'number' && isFinite(v)) { return s; }
            next += 1;
            return Object.assign({}, s, { sort_index: next });
        });
    }

    /**
     * Strip wikilink markup from a string so it matches rendered DOM text.
     * [[Page|Display]] → Display,  [[Page]] → Page,  plain text unchanged.
     */
    function stripWikilinks(s: any) {
        return (s || '').replace(
            /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
            function (_: any, page: any, display: any) { return display || page; }
        );
    }
	/**
     * Find a song in the array corresponding to the clicked table row.
     * Disambiguates identical titles by using DataTables' raw object data,
     * or by scoring other DOM fields (date, version, IDs) as a fallback.
     * Returns { song, index }.
     */
    function findSong(songs: any, $row: any, $table: any) {
        // 1. Try exact object matching if this is an AJAX-sourced DataTable
        if (($.fn as any).DataTable && ($.fn as any).DataTable.isDataTable($table[0])) {
            const dt = $table.DataTable();
            const rowData = dt.row($row).data();
            
            // Ensure we have an object (AJAX) and not an array of strings (DOM-sourced)
            if (rowData && typeof rowData === 'object' && !Array.isArray(rowData)) {
                for (let i = 0; i < songs.length; i++) {
                    const s = songs[i];
                    if (s.title === rowData.title &&
                        s.youtube_id === rowData.youtube_id &&
                        s.upload_date === rowData.upload_date &&
                        s.version === rowData.version) {
                        return { song: s, index: i };
                    }
                }
            }
        }
        
        // 2. Fallback: DOM heuristic scoring (for purely DOM-sourced tables)
        const $tc = $row.find('td').eq(1);
        const rowTitle = ($tc.find('.slcrud-title-text').first().text() || $tc.text()).trim();
        const normalisedRowTitle = rowTitle.toLowerCase();

        // Extract Date (column 5) and Streaming HTML (column 2)
        const rowDate = $row.find('td').eq(5).text().trim();
        const streamHtml = $row.find('td').eq(2).html() || '';

        let bestMatch = null;
        let bestScore = -1;

        const isUnknown = function (raw: any) {
            return !raw || raw === '' || raw === 'N/A' || raw === '-' || raw.toLowerCase() === 'unknown';
        };

        for (let i = 0; i < songs.length; i++) {
            const song = songs[i];
            const jsonTitle = stripWikilinks(song.title || '').trim().toLowerCase();

            if (jsonTitle === normalisedRowTitle) {
                let score = 0;

                // Match Date
                const sDate = song.upload_date || 'N/A';
                if (sDate === rowDate || (isUnknown(sDate) && rowDate === 'N/A')) {
                    score += 2;
                }

                // Match Version text inside the title cell
                if (song.version && $tc.text().indexOf('-' + song.version + ' ver.-') !== -1) {
                    score += 3;
                } else if (!song.version && $tc.text().indexOf(' ver.-') === -1) {
                    score += 1;
                }

                // Match Video IDs embedded in the streaming cell's hrefs/icons
                if (song.youtube_id && streamHtml.indexOf(song.youtube_id) !== -1) score += 3;
                if (song.niconico_id && streamHtml.indexOf(song.niconico_id) !== -1) score += 3;
                if (song.bilibili_id && streamHtml.indexOf(song.bilibili_id) !== -1) score += 3;

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { song: song, index: i };
                }
            }
        }

        return bestMatch;
    }

    // ══════════════════════════════════════════════════════════════════
    //  WIKITEXT / TEXT HELPERS
    // ══════════════════════════════════════════════════════════════════

    /**
     * Convert [[Page|Display]] or [[Page]] wikilinks to safe HTML <a> tags.
     * Used for the featured-artists live preview.
     */
    function wikilinkToHtml(text: any) {
        if ((window as any).SonglistRenderer) {
            return (window as any).SonglistRenderer.parseWikiMarkup(text);
        }
        // Fallback if renderer is missing
        return (text || '').replace(
            /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
            function (_: any, page: any, display: any) {
                const label = $('<span>').text(display || page).html();
                const url = mw.util.getUrl(page);
                return '<a href="' + url + '" target="_blank">' + label + '</a>';
            }
        );
    }

    // ══════════════════════════════════════════════════════════════════
    //  TOAST NOTIFICATIONS
    // ══════════════════════════════════════════════════════════════════

    function toast(msg: any, type: any, duration: any) {
        type = type || 'info';
        duration = duration || 3500;

        if (!$('#slcrud-toasts').length) {
            $('body').append('<div id="slcrud-toasts"></div>');
        }

        const $t = $('<div>')
            .addClass('slcrud-toast slcrud-toast--' + type)
            .text(msg);

        $('#slcrud-toasts').append($t);
        setTimeout(function () {
            $t.fadeOut(300, function () { $t.remove(); });
        }, duration);
    }

    // ══════════════════════════════════════════════════════════════════
    //  FORM BUILDERS
    // ══════════════════════════════════════════════════════════════════

    function textField(id: any, labelText: any, value: any, opts: any) {
        opts = opts || {};
        const $w = $('<div class="slcrud-field">');
        const $label = $('<label>')
            .addClass('slcrud-label' + (opts.required ? ' slcrud-label-required' : ''))
            .attr('for', 'slcrud-f-' + id)
            .text(labelText);
        const $input = $('<input type="text" class="slcrud-input">')
            .attr('id', 'slcrud-f-' + id)
            .attr('name', id)
            .attr('placeholder', opts.placeholder || '')
            .val(value || '');
        if (opts.required) $input.attr('required', (true as any));

        $w.append($label, $input);
        if (opts.help) {
            $w.append($('<div class="slcrud-help">').text(opts.help));
        }
        return $w;
    }

    function checkboxLabel(name: any, value: any, labelText: any, isChecked: any) {
        return $('<label class="slcrud-checkbox-label">')
            .append(
                $('<input type="checkbox">')
                    .attr('name', name)
                    .attr('value', value)
                    .prop('checked', !!isChecked)
            )
            .append(document.createTextNode(' ' + labelText));
    }

    /**
     * Build the site-checklist sub-group for Deleted or Privated.
     * All three platforms are always rendered; visibility is driven
     * by whether the corresponding video ID field is populated.
     *
     * @param {string} name      - checkbox name attribute (e.g. "deleted_sites")
     * @param {string[]} checked - array of currently-checked platform keys
     * @param {string} ytId      - current YouTube ID value
     * @param {string} nndId     - current NicoNico ID value
     * @param {string} bbId      - current Bilibili ID value
     */
    function buildSiteGroup(name: any, checked: any, ytId: any, nndId: any, bbId: any) {
        const $group = $('<div class="slcrud-site-group" data-site-group="' + name + '">')
            .append('<div class="slcrud-site-group-label">Affected platforms:</div>');

        const $row = $('<div class="slcrud-checkbox-row">');

        [
            { key: 'yt', label: 'YouTube', hasId: !!ytId },
            { key: 'nnd', label: 'NicoNico', hasId: !!nndId },
            { key: 'bb', label: 'Bilibili', hasId: !!bbId },
        ].forEach(function (platform) {
            const $lbl = checkboxLabel(
                name + '[]',
                platform.key,
                platform.label,
                checked.indexOf(platform.key) !== -1
            ).attr('data-platform', platform.key);

            if (!platform.hasId) $lbl.hide();
            $row.append($lbl);
        });

        $group.append($row);
        return $group;
    }

    /**
     * Build a single featured-artist input row.
     * @param {string} value - pre-filled artist string (wikilink or plain text)
     */
    function makeFeatRow(value: any) {
        const $row = $('<div class="slcrud-feat-row">');
        const $input = $('<input type="text" class="slcrud-input" name="featured_artist_item">')
            .val(value || '')
            .attr('placeholder', 'e.g. [[Yuuki Aoi (結城碧)|Yuuki Aoi]] or plain name');
        const $removeBtn = $('<button type="button" class="slcrud-btn slcrud-btn-feat-remove" aria-label="Remove artist">')
            .html('<i class="fa-solid fa-minus"></i>');
        $row.append($input, $removeBtn);
        return $row;
    }

    /**
     * Build the Featured Artists dynamic list section.
     * Renders one row per existing artist (minimum one blank row for new entries).
     * @param {string[]} artists - array from song.featured_artists
     */
    function buildFeatList(artists: any) {
        const $wrap = $('<div class="slcrud-field slcrud-feat-field">');
        $wrap.append('<label class="slcrud-label">Featured Artists</label>');

        const $list = $('<div class="slcrud-feat-list" id="slcrud-feat-list">');
        const entries = (artists && artists.length) ? artists : [''];
        entries.forEach(function (artist: any) {
            $list.append(makeFeatRow(artist));
        });
        $wrap.append($list);

        const $addBtn = $('<button type="button" class="slcrud-btn slcrud-btn-feat-add">')
            .html('<i class="fa-solid fa-plus"></i> Add artist');
        $wrap.append($addBtn);
        $wrap.append($('<div class="slcrud-feat-preview" id="slcrud-feat-preview">'));
        return $wrap;
    }

    /**
     * Build a single orikyoku-with input row.
     * @param {string} value - pre-filled collaborator string (raw wikitext)
     */
    function makeWithRow(value: any) {
        const $row = $('<div class="slcrud-with-row">');
        const $input = $('<input type="text" class="slcrud-input" name="orikyoku_with_item">')
            .val(value || '')
            .attr('placeholder', 'e.g. [[GigaP]] or {{VW|Kurousa-P}}');
        const $removeBtn = $('<button type="button" class="slcrud-btn slcrud-btn-with-remove" aria-label="Remove">')
            .html('<i class="fa-solid fa-minus"></i>');
        $row.append($input, $removeBtn);
        return $row;
    }

    /**
     * Build the Orikyoku "with" dynamic list section.
     * Hidden by default; shown when the is_original checkbox is checked.
     * @param {string[]} withArr - array from song.orikyoku_with
     */
    function buildWithList(withArr: any) {
        const $wrap = $('<div class="slcrud-site-group" data-with-group="orikyoku_with">');
        $wrap.append('<div class="slcrud-site-group-label">Collaborated with (raw wikitext):</div>');

        const $list = $('<div class="slcrud-with-list" id="slcrud-with-list">');
        const entries = (withArr && withArr.length) ? withArr : [''];
        entries.forEach(function (val: any) {
            $list.append(makeWithRow(val));
        });
        $wrap.append($list);

        const $addBtn = $('<button type="button" class="slcrud-btn slcrud-btn-with-add">')
            .html('<i class="fa-solid fa-plus"></i> Add collaborator');
        $wrap.append($addBtn);
        return $wrap;
    }

    /**
     * Build the full song form.
     * @param {Object|null} song - existing song data, or null for a new entry
     */
    function buildSongForm(song: any, context: any) {
        song = song || {};
        context = context || { songs: [], self: null };

        const ytId = song.youtube_id || '';
        const nndId = song.niconico_id || '';
        const bbId = song.bilibili_id || '';

        const deletedSites = song.deleted_sites || [];
        const privatedSites = song.privated_sites || [];
        const isDeleted = deletedSites.length > 0 || song.status === 'deleted';
        const isPrivated = privatedSites.length > 0 || song.status === 'private';

        const $form = $('<form class="slcrud-form" autocomplete="off" novalidate>');

        // ── Basic Info ──────────────────────────────────────────────────
        $form.append(
            textField('title', 'Title', song.title, { required: true }),
            (textField as any)('title_translation', 'Title Translation', song.title_translation),
            (textField as any)('title_note', 'Title Note', song.title_note)
        );

        // ── Video IDs (3-column row) ────────────────────────────────────
        $form.append(
            $('<div class="slcrud-field-row">').append(
                textField('youtube_id', 'YouTube ID', ytId, { placeholder: 'e.g. dQw4w9WgXcQ' }),
                textField('niconico_id', 'NicoNico ID', nndId, { placeholder: 'e.g. sm12345678' }),
                textField('bilibili_id', 'Bilibili ID', bbId, { placeholder: 'e.g. BV1Aw411Z7VS' })
            )
        );

        // ── Date ────────────────────────────────────────────────────────
        $form.append(
            textField('upload_date', 'Upload Date', song.upload_date, {
                placeholder: 'YYYY-MM-DD',
                help: 'Multiple or platform-specific: 2024-07-10, MV 2025-10-24  or  2017-09-09/BB, 2017-09-10/YT',
            })
        );

        // -- Placement --------------------------------------------------
        $form.data('slcrud-context', context);
        $form.append(buildPlacementField());

        // ── Featured Artists ────────────────────────────────────────────
        $form.append(buildFeatList(song.featured_artists || []));

        // ── Version / Notes ─────────────────────────────────────────────
        $form.append(
            textField('version', 'Version', song.version, { placeholder: 'e.g. Piano' }),
            textField('notes', 'Notes', (song.notes || []).join(', '), {
                help: 'Comma-separated. Accepts wikitext.',
            })
        );

        // ── Media Status section ────────────────────────────────────────
        $form.append('<div class="slcrud-section-title">Media Status</div>');

        // Deleted
        const $deletedWrap = $('<div class="slcrud-field">');
        const $deletedCheck = checkboxLabel('is_deleted', '1', 'Deleted', isDeleted)
            .attr('id', 'slcrud-deleted-label');
        $deletedWrap.append($('<div class="slcrud-checkbox-row">').append($deletedCheck));

        const $deletedSites = buildSiteGroup('deleted_sites', deletedSites, ytId, nndId, bbId);
        if (isDeleted) $deletedSites.addClass('is-visible');
        $deletedWrap.append($deletedSites);
        $form.append($deletedWrap);

        // Privated
        const $privatedWrap = $('<div class="slcrud-field">');
        const $privatedCheck = checkboxLabel('is_privated', '1', 'Privated', isPrivated)
            .attr('id', 'slcrud-privated-label');
        $privatedWrap.append($('<div class="slcrud-checkbox-row">').append($privatedCheck));

        const $privatedSites = buildSiteGroup('privated_sites', privatedSites, ytId, nndId, bbId);
        if (isPrivated) $privatedSites.addClass('is-visible');
        $privatedWrap.append($privatedSites);
        $form.append($privatedWrap);

        // ── Additional Flags ────────────────────────────────────────────
        $form.append('<div class="slcrud-section-title">Additional Flags</div>');

        // Self-cover
        $form.append(
            $('<div class="slcrud-field">').append(
                $('<div class="slcrud-checkbox-row">').append(
                    checkboxLabel('is_self_cover', '1', 'Self-cover', !!song.is_self_cover)
                )
            )
        );

        // Original Song (Orikyoku) + conditional "with" list
        const $originalWrap = $('<div class="slcrud-field">');
        $originalWrap.append(
            $('<div class="slcrud-checkbox-row">').append(
                checkboxLabel('is_original', '1', 'Original Song (Orikyoku)', !!song.is_original)
            )
        );
        const $withList = buildWithList(song.orikyoku_with || []);
        if (!!song.is_original) $withList.addClass('is-visible');
        $originalWrap.append($withList);
        $form.append($originalWrap);

        // ── Wire live events ────────────────────────────────────────────
        attachTitleSuggestions($form.find('[name="title"]')[0]);
        wireFormEvents($form);
        updateFeatPreview($form);
        updatePlacement($form);

        return $form;
    }

    // ══════════════════════════════════════════════════════════════════
    //  TITLE SUGGESTIONS
    //
    //  Song titles from Category:Famous Utattemita Songs, offered while you
    //  type. Fetched ONCE and filtered locally rather than queried per
    //  keystroke: the category is ~679 pages, which is one or two requests and
    //  perhaps 20 KB, after which every lookup is free and instant.
    //
    //  Nothing is fetched until somebody has actually typed MIN_QUERY
    //  characters into a title field, so a reader -- or an editor who never
    //  touches a title -- pays nothing at all. The result is kept in
    //  sessionStorage so moving between artist pages does not refetch it.
    // ══════════════════════════════════════════════════════════════════

    const TITLE_CATEGORY = 'Category:Famous Utattemita Songs';
    const TITLE_CACHE_KEY = 'slcrud-titles-v1';
    const TITLE_DATALIST_ID = 'slcrud-title-suggestions';
    const MIN_QUERY = 3;
    const MAX_SUGGESTIONS = 20;
    const SUGGEST_DEBOUNCE_MS = 180;

    let titlePool: any = null;          // string[] once loaded
    let titlePoolPromise: any = null;   // in flight, so N inputs share one request

    function loadTitlePool() {
        if (titlePool !== null) { return $.Deferred().resolve(titlePool).promise(); }
        if (titlePoolPromise) { return titlePoolPromise; }

        try {
            const cached = window.sessionStorage.getItem(TITLE_CACHE_KEY);
            if (cached) {
                titlePool = JSON.parse(cached);
                return $.Deferred().resolve(titlePool).promise();
            }
        } catch (e) {
            // Private mode, quota, storage disabled. Just fetch.
        }

        const out: any = [];
        const fetchPage = function (cont: any): any {
            const params = {
                action: 'query',
                list: 'categorymembers',
                cmtitle: TITLE_CATEGORY,
                cmnamespace: 0,
                cmlimit: 'max',
                cmprop: 'title',
                format: 'json',
                formatversion: 2,
            };
            if (cont) { (params as any).cmcontinue = cont; }
            return new mw.Api().get(params).then(function (res): any {
                ((res.query && res.query.categorymembers) || []).forEach(function (m: any) {
                    out.push(m.title);
                });
                if (res.continue && res.continue.cmcontinue) {
                    return fetchPage(res.continue.cmcontinue);
                }
                return out;
            });
        };

        titlePoolPromise = fetchPage(null).then(
            function (list: any) {
                titlePool = list;
                try {
                    window.sessionStorage.setItem(TITLE_CACHE_KEY, JSON.stringify(list));
                } catch (e) { /* not worth failing over */ }
                titlePoolPromise = null;
                return list;
            },
            function () {
                // Suggestions are a convenience. A failed lookup must never stop
                // anyone typing a title, and must not poison later attempts.
                titlePool = null;
                titlePoolPromise = null;
                return [];
            }
        );
        return titlePoolPromise;
    }

    /**
     * Titles matching `query`, prefix matches before interior ones.
     *
     * Substring rather than prefix-only because covers are routinely looked up
     * by a word from the middle of the title.
     */
    function matchTitles(query: any, pool: any) {
        const q = String(query || '').trim().toLowerCase();
        if (q.length < MIN_QUERY) { return []; }

        const starts: any = [];
        const contains: any = [];
        (pool || []).forEach(function (t: any) {
            const at = String(t).toLowerCase().indexOf(q);
            if (at === 0) { starts.push(t); }
            else if (at > 0) { contains.push(t); }
        });
        return starts.concat(contains).slice(0, MAX_SUGGESTIONS);
    }

    /** The one <datalist> every title input points at. */
    function titleDatalist() {
        let el = document.getElementById(TITLE_DATALIST_ID);
        if (!el) {
            el = document.createElement('datalist');
            el.id = TITLE_DATALIST_ID;
            document.body.appendChild(el);
        }
        return el;
    }

    function fillDatalist(titles: any) {
        const el = titleDatalist();
        el.textContent = '';
        titles.forEach(function (t: any) {
            const opt = document.createElement('option');
            opt.value = t;
            el.appendChild(opt);
        });
    }

    /**
     * Point one <input> at the shared datalist and keep it fed as you type.
     *
     * A native datalist rather than a custom popup: the browser renders and
     * positions it, it does not steal focus or swallow keys, and -- the part
     * that decides it -- it only SUGGESTS. Most song titles are not in the
     * category, so anything that constrained the field to the list would be
     * wrong. Safe to call twice on the same element.
     */
    function attachTitleSuggestions(input: any) {
        if (!input || input.getAttribute('data-slcrud-suggest')) { return; }
        input.setAttribute('data-slcrud-suggest', '1');
        input.setAttribute('list', TITLE_DATALIST_ID);
        input.setAttribute('autocomplete', 'off');

        let timer: any = null;
        const refresh = function () {
            if (String(input.value || '').trim().length < MIN_QUERY) {
                fillDatalist([]);
                return;
            }
            loadTitlePool().then(function (pool: any) {
                // The editor may have typed on while the first request was in
                // flight, so filter on what is in the box NOW.
                fillDatalist(matchTitles(input.value, pool));
            });
        };

        input.addEventListener('input', function () {
            window.clearTimeout(timer);
            timer = window.setTimeout(refresh, SUGGEST_DEBOUNCE_MS);
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  PLACEMENT
    //  Where in the list this song will land, shown while you type.
    //
    //  The list is ordered by date, so most of the time there is nothing to
    //  decide and this is only a readout -- which is the actual complaint it
    //  answers: the form never showed where a song would end up, so you filled
    //  it in blind and found out after the write.
    //
    //  It becomes a control only when the song shares its date with another,
    //  because that is the one case the date cannot settle. 6,152 songs across
    //  530 of 876 pages are in that position.
    // ══════════════════════════════════════════════════════════════════

    function buildPlacementField() {
        const $w = $('<div class="slcrud-field slcrud-placement">');
        $w.append(
            $('<label class="slcrud-label">')
                .attr('for', 'slcrud-f-place_after')
                .text('Placement'),
            $('<select class="slcrud-input slcrud-placement-select">')
                .attr('id', 'slcrud-f-place_after')
                .attr('name', 'place_after')
                .hide(),
            $('<div class="slcrud-help slcrud-placement-info">')
        );
        return $w;
    }

    function quoted(s: any) {
        return '\u201C' + (s || '(untitled)') + '\u201D';
    }

    /** One sentence naming the songs this one will sit between. */
    function placementSentence(before: any, after: any) {
        if (!before && !after) { return 'This will be the only song in the list.'; }
        if (!before) { return 'Will appear first, before ' + quoted(after.title) + '.'; }
        if (!after) { return 'Will appear last, after ' + quoted(before.title) + '.'; }
        return 'Will appear between ' + quoted(before.title) + ' and ' + quoted(after.title) + '.';
    }

    /**
     * Recompute the readout, and the select when there is a tie to break, from
     * whatever is currently typed into the form.
     *
     * The probe is a throwaway entry carrying just the two fields the sort key
     * reads, so the preview runs through exactly the comparator that will run
     * on save rather than a second guess at it.
     */
    function updatePlacement($form: any) {
        const S = Schema();
        const context = $form.data('slcrud-context') || { songs: [], self: null };
        const $sel = $form.find('.slcrud-placement-select');
        const $info = $form.find('.slcrud-placement-info');
        if (!$sel.length) { return; }

        const probe = {
            title: ($form.find('[name="title"]').val() || '').trim(),
            upload_date: ($form.find('[name="upload_date"]').val() || '').trim()
        };

        const others = (context.songs || []).filter(function (e: any) { return e !== context.self; });
        const all = others.concat([probe]);
        const sorted = all.slice().sort(S.compareEntries);
        const at = sorted.indexOf(probe);

        const dateKey = S.dateSortKey(probe);
        const undated = dateKey === '9999-12-31';
        const groupWithProbe = S.groupOf(all, probe);
        const group = groupWithProbe.filter(function (e: any) { return e !== probe; });

        if (!group.length) {
            $sel.hide().empty().removeAttr('data-initial');
            $info.text(
                (undated ? 'No usable date, so it sorts to the end. ' : '') +
                placementSentence(sorted[at - 1], sorted[at + 1])
            );
            return;
        }

        const label = undated ? 'the undated songs' : dateKey;
        $sel.empty().append(
            $('<option>').val(PLACE_FIRST).text('\u2014 first of ' + label + ' \u2014')
        );
        group.forEach(function (e: any) {
            $sel.append($('<option>').val(identity(e)).text('after ' + (e.title || '(untitled)')));
        });

        // Default to wherever the sort puts it anyway. Leaving the control
        // alone then writes no `order` at all, so an untouched page keeps
        // rendering exactly as it does today.
        const gAt = groupWithProbe.indexOf(probe);
        const initial = gAt <= 0 ? PLACE_FIRST : identity(groupWithProbe[gAt - 1]);
        $sel.val(initial).attr('data-initial', initial).show();

        $info.text(
            (undated
                ? 'No usable date, so it shares the end of the list with ' + group.length + ' other song(s). '
                : 'Shares ' + dateKey + ' with ' + group.length +
                  ' other song(s), so the date alone cannot decide. ') +
            placementSentence(sorted[at - 1], sorted[at + 1])
        );
    }

    /** What the editor chose, or null when they left the default alone. */
    function readPlacement($form: any) {
        const $sel = $form.find('.slcrud-placement-select');
        if (!$sel.length || $sel.is(':hidden')) { return null; }
        const chosen = $sel.val();
        return chosen === $sel.attr('data-initial') ? null : chosen;
    }

    function wireFormEvents($form: any) {
        // Placement depends on the date (which group it joins) and the title
        // (where it falls inside one), so both retrigger the preview.
        $form.on('input change', '[name="upload_date"], [name="title"]', function () {
            updatePlacement($form);
        });
        // Toggle site-group visibility when Deleted/Privated checkbox changes
        $form.on('change', '[name="is_deleted"]', function () {
            $form.find('[data-site-group="deleted_sites"]')
                .toggleClass('is-visible', this.checked);
        });
        $form.on('change', '[name="is_privated"]', function () {
            $form.find('[data-site-group="privated_sites"]')
                .toggleClass('is-visible', this.checked);
        });

        // Update platform checkbox visibility when video ID fields change
        $form.on('input', '[name="youtube_id"], [name="niconico_id"], [name="bilibili_id"]', function () {
            syncPlatformCheckboxes($form);
        });

        // Featured artists list: add a new row
        $form.on('click', '.slcrud-btn-feat-add', function () {
            const $newRow = makeFeatRow('');
            $form.find('#slcrud-feat-list').append($newRow);
            $newRow.find('input').trigger('focus');
            updateFeatPreview($form);
        });

        // Featured artists list: remove a row (clear instead of remove when only one remains)
        $form.on('click', '.slcrud-btn-feat-remove', function () {
            const $rows = $form.find('.slcrud-feat-row');
            if ($rows.length === 1) {
                $rows.first().find('input').val('').trigger('focus');
            } else {
                $(this).closest('.slcrud-feat-row').remove();
            }
            updateFeatPreview($form);
        });

        // Featured artists live preview
        $form.on('input', '[name="featured_artist_item"]', function () {
            updateFeatPreview($form);
        });

        // is_original toggle: show/hide the "with" list
        $form.on('change', '[name="is_original"]', function () {
            $form.find('[data-with-group]').toggleClass('is-visible', this.checked);
        });

        // With list: add a new row
        $form.on('click', '.slcrud-btn-with-add', function () {
            const $newRow = makeWithRow('');
            $form.find('#slcrud-with-list').append($newRow);
            $newRow.find('input').trigger('focus');
        });

        // With list: remove a row (clear instead of remove when only one remains)
        $form.on('click', '.slcrud-btn-with-remove', function () {
            const $rows = $form.find('.slcrud-with-row');
            if ($rows.length === 1) {
                $rows.first().find('input').val('').trigger('focus');
            } else {
                $(this).closest('.slcrud-with-row').remove();
            }
        });
    }

    /**
     * Show/hide individual platform checkboxes inside site-groups based
     * on whether the corresponding video ID field has a value.
     */
    function syncPlatformCheckboxes($form: any) {
        const ids = {
            yt: $form.find('[name="youtube_id"]').val().trim(),
            nnd: $form.find('[name="niconico_id"]').val().trim(),
            bb: $form.find('[name="bilibili_id"]').val().trim(),
        };

        $form.find('[data-platform]').each(function () {
            const platform = $(this).attr('data-platform');
            const hasId = !!(ids as any)[(platform as any)];
            $(this).toggle(hasId);
            if (!hasId) {
                $(this).find('input[type="checkbox"]').prop('checked', false);
            }
        });
    }

    function updateFeatPreview($form: any) {
        const $preview = $form.find('#slcrud-feat-preview');
        const values = $form.find('[name="featured_artist_item"]')
            .map(function () { return $(this).val().trim(); }).get()
            .filter(Boolean);

        if (!values.length) {
            $preview.empty();
            return;
        }

        const html = values.map(function (raw: any) {
            const converted = wikilinkToHtml(raw);
            if (converted === raw) {
                const url = mw.util.getUrl(raw);
                const label = $('<span>').text(raw).html();
                return '<a href="' + url + '" target="_blank">' + label + '</a>';
            }
            return converted;
        }).join(', ');

        $preview.html('Preview: ' + html);
    }

    // ══════════════════════════════════════════════════════════════════
    //  FORM DATA EXTRACTION
    // ══════════════════════════════════════════════════════════════════

    function getFormData($form: any) {
        const val = function (name: any) {
            return $form.find('[name="' + name + '"]').val().trim() || null;
        };
        const isChecked = function (name: any) {
            return $form.find('[name="' + name + '"]:checked').length > 0;
        };
        const checkedValues = function (name: any) {
            return $form.find('[name="' + name + '"]:checked')
                .map(function () { return this.value; }).get();
        };

        const deletedSites = isChecked('is_deleted') ? checkedValues('deleted_sites[]') : [];
        const privatedSites = isChecked('is_privated') ? checkedValues('privated_sites[]') : [];

        // Derive status string (keep existing behaviour for Lua / other consumers)
        let status = '';
        if (deletedSites.length) status = 'deleted';
        else if (privatedSites.length) status = 'private';

        const notesRaw = val('notes') || '';
        const notes = notesRaw
            ? notesRaw.split(',').map(function (s: any) { return s.trim(); }).filter(Boolean)
            : [];

        return {
            title: val('title'),
            title_translation: val('title_translation'),
            title_note: val('title_note'),
            youtube_id: val('youtube_id'),
            niconico_id: val('niconico_id'),
            bilibili_id: val('bilibili_id'),
            upload_date: val('upload_date'),
            featured_artists: $form.find('[name="featured_artist_item"]')
                .map(function () { return $(this).val().trim(); }).get()
                .filter(Boolean),
            version: val('version'),
            status: status,
            deleted_sites: deletedSites,
            privated_sites: privatedSites,
            notes: notes,
            is_original: isChecked('is_original'),
            orikyoku_with: isChecked('is_original')
                ? $form.find('[name="orikyoku_with_item"]')
                    .map(function () { return $(this).val().trim(); }).get()
                    .filter(Boolean)
                : [],
            is_self_cover: isChecked('is_self_cover'),
        };
    }

    // ══════════════════════════════════════════════════════════════════
    //  MODAL HELPERS
    // ══════════════════════════════════════════════════════════════════

    function closeOverlay($overlay: any) {
        $overlay.fadeOut(120, function () { $overlay.remove(); });
    }

    /**
     * Open the Add / Edit song modal.
     *
     * @param {Object} opts
     * @param {string}      opts.modalTitle  - Dialog header text
     * @param {string}      opts.saveLabel   - Save button text
     * @param {Object|null} opts.song        - Pre-populated song data (null = add)
     * @param {Object}      opts.context     - { songs, self } for the placement preview
     * @param {Function}    opts.onSave      - async (formData, placeAfter) → void
     *                                         placeAfter is null unless the editor
     *                                         moved the Placement control.
     */
    function openSongModal(opts: any) {
        const $overlay = $('<div class="slcrud-overlay" role="presentation">');
        const $dialog = $('<div class="slcrud-dialog" role="dialog" aria-modal="true">');

        const $form = buildSongForm(opts.song || null, opts.context);

        const $header = $('<div class="slcrud-dialog-header">').append(
            $('<h2 class="slcrud-dialog-title">').text(opts.modalTitle),
            $('<button class="slcrud-dialog-close" type="button" aria-label="Close">\u00D7</button>')
        );

        const $body = $('<div class="slcrud-dialog-body">').append($form);

        const $saveBtn = $('<button type="button" class="slcrud-btn slcrud-btn-primary">')
            .text(opts.saveLabel || 'Save');
        const $cancelBtn = $('<button type="button" class="slcrud-btn slcrud-btn-cancel">Cancel</button>');
        const $footer = $('<div class="slcrud-dialog-footer">')
            .append($cancelBtn, $saveBtn);

        $dialog.append($header, $body, $footer);
        $overlay.append($dialog);
        $('body').append($overlay);

        // Close on overlay click or Cancel / X
        $overlay.on('click', function (e) {
            if (e.target === this) closeOverlay($overlay);
        });
        $header.add($cancelBtn).on('click', '.slcrud-dialog-close, .slcrud-btn-cancel', function () {
            closeOverlay($overlay);
        });
        $cancelBtn.on('click', function () { closeOverlay($overlay); });

        // Save
        $saveBtn.on('click', function () {
            // Basic HTML5 validation
            if (!($form[0] as any).checkValidity()) {
                $form.find('[required]').each(function () {
                    if (!(this as any).validity.valid) {
                        $(this).trigger('focus');
                        return false; // break
                    }
                });
                return;
            }

            const label = $saveBtn.text();
            $saveBtn.prop('disabled', true).addClass('slcrud-btn-loading').text('Saving');
            $cancelBtn.prop('disabled', true);

            opts.onSave(getFormData($form), readPlacement($form))
                .then(function () {
                    closeOverlay($overlay);
                })
                .catch(function (err: any, result: any) {
                    toast(apiErrorMessage(err, result, 'Save failed'), 'error', 8000);
                    $saveBtn.prop('disabled', false).removeClass('slcrud-btn-loading').text(label);
                    $cancelBtn.prop('disabled', false);
                });
        });

        // Focus first input on open
        setTimeout(function () {
            $dialog.find('input[name="title"]').trigger('focus');
        }, 60);
    }

    /**
     * Open the Delete confirmation dialog.
     *
     * @param {Object}   opts
     * @param {string}   opts.songTitle  - Title shown in the prompt
     * @param {Function} opts.onConfirm  - async () → void
     */
    function openDeleteDialog(opts: any) {
        const $overlay = $('<div class="slcrud-overlay" role="presentation">');
        const $dialog = $('<div class="slcrud-dialog slcrud-dialog--narrow" role="alertdialog" aria-modal="true">');

        const $header = $('<div class="slcrud-dialog-header">').append(
            $('<h2 class="slcrud-dialog-title">Remove Song</h2>'),
            $('<button class="slcrud-dialog-close" type="button" aria-label="Close">\u00D7</button>')
        );

        const safeTitle = $('<span>').text(opts.songTitle).html();
        const $body = $('<div class="slcrud-dialog-body">').append(
            $('<p>').html(
                'Remove <strong>' + safeTitle + '</strong> from the song list?<br>' +
                'This will permanently delete the entry from the JSON.'
            )
        );

        const $confirmBtn = $('<button type="button" class="slcrud-btn slcrud-btn-destructive">Remove</button>');
        const $cancelBtn = $('<button type="button" class="slcrud-btn slcrud-btn-cancel">Cancel</button>');
        const $footer = $('<div class="slcrud-dialog-footer">').append($cancelBtn, $confirmBtn);

        $dialog.append($header, $body, $footer);
        $overlay.append($dialog);
        $('body').append($overlay);

        $overlay.on('click', function (e) {
            if (e.target === this) closeOverlay($overlay);
        });
        $header.on('click', '.slcrud-dialog-close', function () { closeOverlay($overlay); });
        $cancelBtn.on('click', function () { closeOverlay($overlay); });

        $confirmBtn.on('click', function () {
            $confirmBtn.prop('disabled', true).addClass('slcrud-btn-loading').text('Removing');
            $cancelBtn.prop('disabled', true);

            opts.onConfirm()
                .then(function () { closeOverlay($overlay); })
                .catch(function (err: any, result: any) {
                    toast(apiErrorMessage(err, result, 'Remove failed'), 'error', 8000);
                    $confirmBtn.prop('disabled', false).removeClass('slcrud-btn-loading').text('Remove');
                    $cancelBtn.prop('disabled', false);
                });
        });

        setTimeout(function () { $confirmBtn.trigger('focus'); }, 60);
    }

    // ══════════════════════════════════════════════════════════════════
    //  SONG ENTRY CONSTRUCTOR (for new / edited entries)
    // ══════════════════════════════════════════════════════════════════

    /**
     * One entry shape, defined once in SonglistSchema.blankEntry().
     *
     * This used to stamp raw_line / source_page / root_artist / confidence /
     * parse_method onto every row it touched. Those five describe how the
     * PIPELINE parsed a wikitext line; a gadget-authored song was never parsed,
     * so parse_method:'gadget' and confidence:'high' were fiction, and
     * source_page/root_artist merely restated the page title. Nothing reads
     * them back either: finalize_output.py lists all five in _NEVER_MERGE and
     * upload_songs_json.py lists four in _HISTORY_IGNORE.
     *
     * Worse, the sheet strips exactly those five on every commit, so alternating
     * between the two editors wrote them, removed them and wrote them again --
     * visible on StarLight PolaRis as revs 285452 -> 285453 -> 285454.
     *
     * Starting from blankEntry() also means a new row carries song_type and
     * every other schema key, instead of leaving holes for the sheet to fill.
     */
    function buildNewEntry(formData: any, base: any) {
        base = base || {};
        const merged = Object.assign(Schema().blankEntry(), base, formData);
        Schema().PIPELINE_FIELDS.forEach(function (k: any) { delete merged[k]; });
        return merged;
    }

    // ══════════════════════════════════════════════════════════════════
    //  TABLE REFRESH (via action=parse — no full page reload)
    // ══════════════════════════════════════════════════════════════════

    /**
     * Refresh the DataTable in-place after a JSON write:
     *   1. Purge the page's parser cache
     *   2. Re-parse the page via the API to get fresh rendered HTML
     *   3. Destroy the existing DataTable instance
     *   4. Swap the <table> element with the fresh one
     *      (new DOM reference bypasses the processedTables WeakMap in
     *       datatables-helper, so it re-inits cleanly)
     *   5. Re-fire wikipage.content → datatables-helper re-inits the
     *      fresh table, then processContent re-injects the Actions column
     *
     * Falls back to location.reload() if the parse fails or the
     * expected table class is not found in the result.
     */
    function refreshTable($table: any) {
        var pageName = mw.config.get('wgPageName');
        var savedPage = (($.fn as any).DataTable && ($.fn as any).DataTable.isDataTable($table[0]))
            ? $table.DataTable().page()
            : 0;

        var $currentMobile = $table.closest('.songlist-desktop').next('.songlist-mobile');

        $table.addClass('slcrud-refreshing');

        // 1. AJAX reload for Desktop
        if (($.fn as any).DataTable && ($.fn as any).DataTable.isDataTable($table[0])) {
            $table.DataTable().ajax.reload(function () {
                $table.removeClass('slcrud-refreshing');
                if (savedPage > 0) {
                    var info = $table.DataTable().page.info();
                    $table.DataTable().page(Math.min(savedPage, info.pages - 1)).draw(false);
                }
            }, false);
        } else {
            $table.removeClass('slcrud-refreshing');
        }

        // 2. Fallback parse for Mobile List
        if ($currentMobile.length) {
            new mw.Api().post({
                action: 'purge',
                titles: pageName,
            }).then(function () {
                return new mw.Api().get({
                    action: 'parse',
                    page: pageName,
                    prop: 'text',
                    disablelimitreport: true,
                    disableeditsection: true,
                });
            }).then(function (result) {
                var $parsed = $('<div>').html(result.parse.text['*']);
                var $freshMobile = $parsed.find('.songlist-mobile').first();
                if ($freshMobile.length) {
                    $currentMobile.replaceWith($freshMobile);
                }
            });
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  TABLE INJECTION
    // ══════════════════════════════════════════════════════════════════

    function injectActionsColumn($table: any, jsonPage: any) {
        var ACTION_CELL_HTML = '<td class="slcrud-actions">' +
            '<button type="button" class="slcrud-btn slcrud-btn-edit" data-action="edit">Edit</button>' +
            '\u00A0' + // non-breaking space
            '<button type="button" class="slcrud-btn slcrud-btn-row-delete" data-action="delete">Delete</button>' +
            '</td>';

        /**
         * Ensure the Actions header <th> and body <td> cells exist and are
         * the last column in every row.  Called once on init, then wired to
         * draw.dt (page-change / sort / filter redraws) and
         * column-visibility.dt (column show/hide by datatables-helper).
         */
        function refreshActionCells() {
            // ── Header ─────────────────────────────────────────────────
            var $thead = $table.find('thead tr').first();
            var $th = $thead.find('.slcrud-actions-header');
            if ($th.length) {
                $thead.append($th); // move to end in case a column was re-inserted after it
            } else {
                $thead.append('<th class="slcrud-actions-header" style="width:110px;">Actions</th>');
            }

            // ── Body ───────────────────────────────────────────────────
            $table.find('tbody tr').each(function () {
                var $row = $(this);
                // Skip the DataTables "No matching records found" empty-state row
                if ($row.find('.dataTables_empty').length) return;
                var $td = $row.find('.slcrud-actions');
                if ($td.length) {
                    $row.append($td); // move to end
                } else {
                    $row.append(ACTION_CELL_HTML);
                }
            });
        }

        // Initial injection
        refreshActionCells();

        // Ensure the No. column (index 0) uses numeric ordering.
        // dt-type-num on <th> handles this in DataTables 2.x, but set it
        // explicitly here as a fallback for any old cached renders that still
        // carry the incorrect dt-type-numeric class.
        var dtCols = $table.DataTable().settings()[0].aoColumns;
        if (dtCols[0]) {
            dtCols[0].sType = 'num';
        }

        // Re-inject / reorder on every DataTables draw
        // (covers page change, sort, filter, and deferRender lazy row creation)
        $table.on('draw.dt', refreshActionCells);

        // Re-ensure position when a column is hidden or shown
        $table.on('column-visibility.dt', refreshActionCells);

        // ── Status filter ─────────────────────────────────────────────
        const _restoredType = (_filterMemory as any)[jsonPage] || 'all';
        const filterState = { type: _restoredType };

        /**
         * DataTables custom search function.
         * Scoped to this specific table via settings.nTable comparison.
         * Reads `data[SONG_STATUS_COL]` (the Info cell HTML) to determine
         * whether the row should be shown for the active filter.
         */
        const statusSearchFn = function (settings: any, _data: any, _dataIndex: any, rowData: any) {
            if (settings.nTable !== $table[0]) return true;
            if (filterState.type === 'all') return true;

            // AJAX exposes raw JSON via rowData
            const isDeleted = (rowData.deleted_sites && rowData.deleted_sites.length > 0) || rowData.status === 'deleted';
            const isPrivated = (rowData.privated_sites && rowData.privated_sites.length > 0) || rowData.status === 'private';
            const isOriginal = !!rowData.is_original;
            const isSelfCover = !!rowData.is_self_cover;

            const isStream = rowData.song_type === 'stream';

            switch (filterState.type) {
                case 'deleted': return isDeleted;
                case 'privated': return isPrivated;
                case 'original': return isOriginal;
                case 'self-cover': return isSelfCover;
                case 'stream': return isStream;
                case 'covered': return !isOriginal && !isSelfCover && !isDeleted && !isPrivated && !isStream;
                default: return true;
            }
        };

        ($.fn as any).dataTable.ext.search.push(statusSearchFn);

        // Remove our search function when the table is destroyed
        // (e.g. on refreshTable → DataTable().destroy())
        $table.one('destroy.dt', function () {
            var idx = ($.fn as any).dataTable.ext.search.indexOf(statusSearchFn);
            if (idx !== -1) ($.fn as any).dataTable.ext.search.splice(idx, 1);
        });

        // ── Add Song toolbar ──────────────────────────────────────────
        const $filterSelect = $('<select class="slcrud-filter-select">').append(
            $('<option value="all">All types</option>'),
            $('<option value="covered">Covered</option>'),
            $('<option value="original">Original</option>'),
            $('<option value="self-cover">Self-cover</option>'),
            $('<option value="stream">Stream</option>'),
            $('<option value="privated">Privated</option>'),
            $('<option value="deleted">Deleted</option>')
        );

        const $toolbar = $('<div class="slcrud-toolbar">').append(
            $('<div class="slcrud-filter-bar">').append(
                $('<label class="slcrud-filter-label">').text('Type:'),
                $filterSelect
            ),
            $('<button type="button" class="slcrud-btn slcrud-btn-sheet">⊞ Spreadsheet</button>'),
            $('<button type="button" class="slcrud-btn slcrud-btn-add">+ Add Song</button>')
        );

        // Insert before the table (or its .dt-container if already wrapped)
        const $container = $table.closest('.dt-container');
        ($container.length ? $container : $table).before($toolbar);

        $filterSelect.val(_restoredType);

        // ── Event: Filter change ──────────────────────────────────────
        $toolbar.on('change', '.slcrud-filter-select', function () {
            filterState.type = this.value;
            (_filterMemory as any)[jsonPage] = this.value;
            $table.DataTable().draw();
        });

        if (_restoredType !== 'all') {
            $table.DataTable().draw();
        }

        // ── Event: Spreadsheet ────────────────────────────────────────
        // jspreadsheet + jsuites are ~340 KB. They are registered in
        // Gadgets-definition WITHOUT `default`, so ResourceLoader never
        // delivers them on its own -- this click is the only thing that ever
        // fetches them, and it cannot happen on mobile because the early return
        // at the top of this file means no toolbar exists there. The guard
        // below is belt-and-braces against a future refactor of that return.
        $toolbar.on('click', '.slcrud-btn-sheet', function () {
            if ((window as any).SLCRUD_IS_MOBILE) { return; }

            const $btn = $(this);
            $btn.prop('disabled', true).text('Loading…');

            mw.loader.using(['ext.gadget.SonglistSheet']).then(function () {
                if (!(window as any).SonglistSheet) {
                    throw new Error('SonglistSheet loaded but did not register');
                }
                (window as any).SonglistSheet.open({
                    jsonPage: jsonPage,
                    $table: $table,
                    onCommitted: function () { refreshTable($table); },
                });
            }).catch(function (err, result) {
                toast(apiErrorMessage(err, result, 'Could not load the spreadsheet editor'),
                      'error', 8000);
            }).always(function () {
                $btn.prop('disabled', false).text('⊞ Spreadsheet');
            });
        });

        // ── Event: Add ────────────────────────────────────────────────
        // The JSON is read BEFORE the modal opens, not just on save: the
        // Placement preview needs the neighbouring songs to name them.
        $toolbar.on('click', '.slcrud-btn-add', function () {
            const $btn = $(this);
            $btn.prop('disabled', true);

            readJson(jsonPage).then(function (opened) {
                openSongModal({
                    modalTitle: 'Add Song',
                    saveLabel: 'Add',
                    song: null,
                    context: { songs: opened.songs, self: null },
                    onSave: function (formData: any, placeAfter: any) {
                        return readJson(jsonPage).then(function (res) {
                            const entry = buildNewEntry(formData, {});
                            const all = res.songs.concat([entry]);
                            if (placeAfter && !applyPlacement(all, entry, placeAfter)) {
                                toast('The song you picked in Placement is no longer there, ' +
                                      'so the new song was placed by date only.', 'error', 8000);
                            }
                            const indexed = reindex(sortByDate(all));
                            return writeJson(
                                jsonPage,
                                indexed,
                                '[SonglistCRUD] Add song: ' + (formData.title || '(untitled)'),
                                { basetimestamp: res.timestamp, starttimestamp: res.curtimestamp }
                            ).then(function () {
                                (toast as any)('Added "' + formData.title + '"', 'success');
                                refreshTable($table);
                            });
                        });
                    },
                });
            }).catch(function (err, result) {
                toast(apiErrorMessage(err, result, 'Failed to load JSON'), 'error', 8000);
            }).always(function () {
                $btn.prop('disabled', false);
            });
        });

        // ── Event: Edit ───────────────────────────────────────────────
        $table.on('click', '[data-action="edit"]', function () {
            const $row = $(this).closest('tr');
            const $tc = $row.find('td').eq(1);
            const rowTitle = ($tc.find('.slcrud-title-text').first().text() || $tc.text()).trim();

            readJson(jsonPage).then(function (res) {
                const found = findSong(res.songs, $row, $table);
                if (!found) {
                    (toast as any)('Could not find song in JSON (title mismatch?)', 'error');
                    return;
                }
                openSongModal({
                    modalTitle: 'Edit Song',
                    saveLabel: 'Save',
                    song: found.song,
                    context: { songs: res.songs, self: found.song },
                    onSave: function (formData: any, placeAfter: any) {
                        return readJson(jsonPage).then(function (fresh) {
                            const updated = fresh.songs.slice();
                            const entry = buildNewEntry(formData, found.song);
                            updated[found.index] = entry;
                            if (placeAfter && !applyPlacement(updated, entry, placeAfter)) {
                                toast('The song you picked in Placement is no longer there, ' +
                                      'so this song was placed by date only.', 'error', 8000);
                            }
                            const indexed = reindex(sortByDate(updated));
                            return writeJson(
                                jsonPage,
                                indexed,
                                '[SonglistCRUD] Edit song: ' + (formData.title || rowTitle),
                                { basetimestamp: fresh.timestamp, starttimestamp: fresh.curtimestamp }
                            ).then(function () {
                                (toast as any)('Saved "' + (formData.title || rowTitle) + '"', 'success');
                                refreshTable($table);
                            });
                        });
                    },
                });
            }).catch(function (e, result) {
                toast(apiErrorMessage(e, result, 'Failed to load JSON'), 'error', 8000);
            });
        });

        // ── Event: Delete ─────────────────────────────────────────────
        $table.on('click', '[data-action="delete"]', function () {
            const $btn = $(this);
            const $row = $btn.closest('tr');
            const $tc = $row.find('td').eq(1);
            const rowTitle = ($tc.find('.slcrud-title-text').first().text() || $tc.text()).trim();

            readJson(jsonPage).then(function (res) {
                const found = findSong(res.songs, $row, $table);
                if (!found) {
                    (toast as any)('Could not find song in JSON (title mismatch?)', 'error');
                    return;
                }
                openDeleteDialog({
                    songTitle: found.song.title || rowTitle,
                    onConfirm: function () {
                        return readJson(jsonPage).then(function (fresh) {
                            const updated = fresh.songs.filter(function (_: any, i: any) { return i !== found.index; });
                            const indexed = reindex(updated);
                            return writeJson(
                                jsonPage,
                                indexed,
                                '[SonglistCRUD] Remove song: ' + (found.song.title || rowTitle),
                                { basetimestamp: fresh.timestamp, starttimestamp: fresh.curtimestamp }
                            ).then(function () {
                                (toast as any)('Removed "' + (found.song.title || rowTitle) + '"', 'success');
                                refreshTable($table);
                            });
                        });
                    },
                });
            }).catch(function (e, result) {
                toast(apiErrorMessage(e, result, 'Failed to load JSON'), 'error', 8000);
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════════════

    /**
     * Shared with Gadget-SonglistSheet.js so there is exactly one write queue,
     * one conflict-guard implementation and one error-message vocabulary on the
     * page. Also the seam the Node tests load these through.
     */
    (window as any).SonglistCRUDApi = {
        readJson: readJson,
        writeJson: writeJson,
        apiErrorMessage: apiErrorMessage,
        sortByDate: sortByDate,
        reindex: reindex,
        toast: toast,
        attachTitleSuggestions: attachTitleSuggestions,
        // Test/debug seams. Not part of the gadget contract.
        _buildNewEntry: buildNewEntry,
        _buildSongForm: buildSongForm,
        _updatePlacement: updatePlacement,
        _readPlacement: readPlacement,
        _applyPlacement: applyPlacement,
        _identity: identity,
        _placeFirst: PLACE_FIRST,
        _matchTitles: matchTitles,
        _loadTitlePool: loadTitlePool,
        _minQuery: MIN_QUERY,
        _maxSuggestions: MAX_SUGGESTIONS,
        _titleDatalistId: TITLE_DATALIST_ID,
    };

    // ══════════════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════════════

    function processContent($content: any) {
        // Only show controls to logged-in users
        if (mw.user.isAnon()) return;

        $content.find('table').filter(function () {
            return /(?:^|\s)dt-songlist-/.test(this.className);
        }).each(function () {
            const $table = $(this);

            // Guard against double-processing
            if ($table.data('slcrud')) return;

            // Only inject after DataTables has initialized the table.
            // wikipage.content fires before datatables-helper runs prepareTable,
            // so at that point there is no explicit <thead>/<tbody> and
            // find('tbody tr') would include the header row — skip until DT is ready.
            if (!($.fn as any).DataTable || !($.fn as any).DataTable.isDataTable($table[0])) return;

            $table.data('slcrud', true);

            const jsonPage = getJsonPage($table);
            injectActionsColumn($table, jsonPage);
        });
    }

    // datatables.loaded fires once after all tables are DT-initialized on page load.
    // wikipage.content is also kept so refreshTable (which fires the hook after
    // datatables-helper has synchronously re-inited the fresh table) re-injects
    // the Actions column without a full page reload.
    mw.hook('wikipage.content').add(processContent);
    mw.hook('datatables.loaded').add(function () {
        processContent($('#mw-content-text'));
    });

})(jQuery, mediaWiki);

export {};
