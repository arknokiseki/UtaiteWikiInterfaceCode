// @keep-use-strict: live runs this strict (see plugins/preserve-use-strict.ts)
/**
 * SonglistSheet
 * Spreadsheet editor for <Artist>/Songs/songs.json.
 *
 * Lazy-loaded by Gadget-SonglistCRUD.js on first click of the ⊞ Spreadsheet
 * button. Registered in Gadgets-definition WITHOUT `default`, so ResourceLoader
 * never delivers this (or jspreadsheet/jsuites, ~340 KB) unprompted.
 */
declare const jspreadsheet: any;
(function ($, mw) {
    'use strict';

    // Must be the first statement: this file, and the libraries it depends on,
    // must never run or load on mobile. SonglistCRUD.js already returns before
    // building the button, so this is the second of three layers.
    if ((window as any).SLCRUD_IS_MOBILE) { return; }

    const Schema = (window as any).SonglistSchema;
    const Api = (window as any).SonglistCRUDApi;

    /** The one open sheet, or null. */
    let state: any = null;

    /** The data is pure JSON by definition, so this is sufficient. */
    function deepClone(x: any) { return JSON.parse(JSON.stringify(x)); }

    // ══════════════════════════════════════════════════════════════════
    //  MODAL SHELL
    // ══════════════════════════════════════════════════════════════════

    function buildShell(artistName: any) {
        const $overlay = $('<div class="slsheet-overlay" role="presentation">');
        const $dialog = $('<div class="slsheet-dialog" role="dialog" aria-modal="true">')
            .attr('aria-label', 'Spreadsheet editor for ' + artistName);

        const $tools = $('<div class="slsheet-tools">').append(
            $('<input type="search" class="slsheet-search">')
                .attr('placeholder', 'Search rows…')
                .attr('aria-label', 'Search rows'),
            $('<button type="button" class="slsheet-btn slsheet-btn-cols">☰ All columns</button>'),
            $('<button type="button" class="slsheet-btn slsheet-btn-addrow">+ Row</button>'),
            $('<button type="button" class="slsheet-btn slsheet-btn-inspector">◨ Inspector</button>')
        );

        const $header = $('<div class="slsheet-header">').append(
            $('<span class="slsheet-title">').text('Spreadsheet Editor — ' + artistName),
            $('<span class="slsheet-beta">BETA</span>'),
            $tools,
            $('<button type="button" class="slsheet-close" aria-label="Close">×</button>')
        );

        const $notice = $('<div class="slsheet-notice" role="note">').append(
            $('<span aria-hidden="true">⚠</span>'),
            $('<span>').append(
                $('<b>').text('Beta.'),
                document.createTextNode(' Commit rewrites the whole songs.json file. ' +
                    'Check the change summary before confirming, and report anything odd ' +
                    'on the '),
                $('<a class="slsheet-notice-link" target="_blank" rel="noopener">')
                    .attr('href', mw.util.getUrl('Template talk:SonglistTable'))
                    .text('talk page'),
                document.createTextNode('.')
            ),
            $('<button type="button" class="slsheet-notice-dismiss" aria-label="Dismiss">×</button>')
        );

        const $grid = $('<div class="slsheet-grid">');
        const $inspector = $('<aside class="slsheet-inspector" aria-label="Row inspector">');
        const $body = $('<div class="slsheet-body">').append($grid, $inspector);

        const $errorBar = $('<div class="slsheet-errorbar" role="alert">').attr('hidden', (true as any));

        const $footer = $('<div class="slsheet-footer">').append(
            $('<span class="slsheet-counts">').text('No changes'),
            $('<span class="slsheet-spacer">'),
            $('<button type="button" class="slsheet-btn slsheet-btn-cancel">Cancel</button>'),
            $('<button type="button" class="slsheet-btn slsheet-btn-commit">Commit</button>')
                .prop('disabled', true),
            $('<kbd class="slsheet-kbd">Ctrl+S</kbd>')
        );

        $dialog.append($header, $notice, $body, $errorBar, $footer);
        $overlay.append($dialog);
        $('body').append($overlay);

        return {
            $overlay: $overlay, $dialog: $dialog, $header: $header, $notice: $notice,
            $grid: $grid, $inspector: $inspector, $errorBar: $errorBar, $footer: $footer,
        };
    }

    // ══════════════════════════════════════════════════════════════════
    //  OPEN / CLOSE
    // ══════════════════════════════════════════════════════════════════

    /** How many uncommitted changes are pending. */
    function pendingCount() {
        if (!state) { return 0; }
        const rows = new Set();
        state.dirty.forEach(function (_: any, k: any) { rows.add(k.split(':')[0]); });
        return rows.size + state.removed + state.added;
    }

    /**
     * The two shortcuts the sheet owns, taken before jspreadsheet sees them.
     *
     * jspreadsheet binds its own keydown on `document` and maps Ctrl+S to
     * download(), a CSV of the grid. preventDefault cancels the BROWSER's save
     * dialog and nothing else -- it has no effect on another listener attached
     * to the same node -- so Ctrl+S opened the commit dialog and exported a CSV
     * behind it, which Chrome then prompted to allow.
     *
     * The capture phase runs before every bubble listener on document, so
     * stopImmediatePropagation here keeps the key from reaching jspreadsheet at
     * all. Only these two combinations are swallowed. Ctrl+C, Ctrl+V, Ctrl+X,
     * Ctrl+Z, Ctrl+Y and Ctrl+A sit in the same else-chain inside jspreadsheet,
     * so anything blunter would take copy and paste with it.
     */
    function onShortcutKeydown(e: any) {
        if (!state) { return; }
        if (!(e.ctrlKey || e.metaKey)) { return; }
        const k = String(e.key || '').toLowerCase();

        if (k === 's' && !e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            openCommitDialog();
        } else if (k === 'e' && e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            exportCsv();
        }
    }

    /**
     * Ctrl+Shift+E: the CSV export that used to answer to Ctrl+S.
     *
     * This exports the GRID -- visible columns, array fields flattened to their
     * summary text -- not songs.json. It is a spreadsheet for reading elsewhere,
     * not a backup of the page.
     */
    function exportCsv() {
        if (!state || !state.ws || typeof state.ws.download !== 'function') { return; }
        try {
            state.ws.download();
        } catch (err) {
            // A failed export has not touched the grid, so this must not go
            // through reportHandlerError -- that tears the sheet down and
            // rebuilds it, which would be a wild overreaction to a bad CSV.
            try { window.console.error('[SonglistSheet] export failed', err); }
            catch (ignore) { /* no console */ }
            if (Api && Api.toast) {
                Api.toast('Could not export the sheet as CSV.', 'error', 5000);
            }
        }
    }

    function close(force: any) {
        if (!state) { return; }
        if (!force && pendingCount() > 0) {
            if (!window.confirm('Discard ' + pendingCount() + ' unsaved change(s)?')) { return; }
        }
        $(window).off('.slsheet');
        $(document).off('.slsheet');
        document.removeEventListener('keydown', onShortcutKeydown, true);
        if (state.ws && typeof state.ws.destroy === 'function') {
            try { state.ws.destroy(); } catch (e) { /* already gone */ }
        }
        state.ui.$overlay.remove();
        state = null;
    }

    function open(opts: any) {
        if ((window as any).SLCRUD_IS_MOBILE) { return; }
        if (state) { return; }            // one sheet at a time
        if (!Schema || !Api) {
            mw.notify('Songlist spreadsheet: required modules did not load.', { type: 'error' });
            return;
        }

        const artistName = String(opts.jsonPage).replace(/\/Songs\/songs\.json$/, '');
        const ui = buildShell(artistName);
        ui.$grid.append($('<div class="slsheet-loading">').text('Loading song list…'));

        Api.readJson(opts.jsonPage).then(function (res: any) {
            state = {
                jsonPage: opts.jsonPage,
                onCommitted: opts.onCommitted || function () {},
                entries: res.songs,
                snapshot: deepClone(res.songs),
                revid: res.revid,
                timestamp: res.timestamp,
                curtimestamp: res.curtimestamp,

                dirty: new Map(),            // "row:field" -> true
                cellErrors: new Map(),       // "row:field" -> { row, field, message }
                inspectorErrors: new Map(),  // "row:field" -> message
                removed: 0,               // count, not indices: they shift on splice
                added: 0,

                // Set while we rewrite cells ourselves, so setRowData does not
                // re-enter the per-cell validation hooks and mark the rows we
                // just moved as freshly edited.
                suspend: false,

                showAllColumns: false,
                inspectorOpen: true,
                inspectorRow: null,
                ui: ui,
                ws: null,
            };

            ui.$grid.empty();
            renderGrid();
            renderInspector(null);
            updateFooter();
            wireShell();
        }).catch(function (err: any, result: any) {
            const isJson = (err instanceof SyntaxError) ||
                           /JSON/i.test(String((err && err.message) || err));
            ui.$grid.empty().append(
                $('<div class="slsheet-error">').text(
                    isJson
                        ? opts.jsonPage + ' is not valid JSON, so it cannot be opened in the ' +
                          'spreadsheet. Fix it in the wiki editor first.'
                        : Api.apiErrorMessage(err, result, 'Could not load ' + opts.jsonPage)
                )
            );
            // Leave the shell up so the message is readable; only the close
            // controls are wired in this state.
            ui.$header.on('click', '.slsheet-close', function () {
                ui.$overlay.remove();
                state = null;
            });
            ui.$footer.on('click', '.slsheet-btn-cancel', function () {
                ui.$overlay.remove();
                state = null;
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  SHELL EVENTS
    // ══════════════════════════════════════════════════════════════════

    function wireShell() {
        const ui = state.ui;

        ui.$header.on('click', '.slsheet-close', function () { close(false); });
        ui.$footer.on('click', '.slsheet-btn-cancel', function () { close(false); });
        ui.$notice.on('click', '.slsheet-notice-dismiss', function () { ui.$notice.hide(); });

        ui.$overlay.on('click', function (e: any) {
            if (e.target === this) { close(false); }
        });

        $(document).on('keydown.slsheet', function (e) {
            if (!state) { return; }
            if (e.key === 'Escape') { close(false); return; }
        });

        // Not jQuery, and not namespaced: this one has to be in the capture
        // phase, which .on() cannot do. Released in close(), which is why it is
        // a named function rather than a closure -- $(document).off('.slsheet')
        // has no idea this listener exists.
        document.addEventListener('keydown', onShortcutKeydown, true);

        $(window).on('beforeunload.slsheet', function (e) {
            if (state && pendingCount() > 0) {
                const msg = 'You have uncommitted spreadsheet changes.';
                (e as any).returnValue = msg;
                return msg;
            }
        });

        // Row insertion goes through the grid so onBeforeInsertRow is the one
        // place that keeps state.entries aligned — the button must not push
        // into state.entries itself or the row would be counted twice.
        ui.$header.on('click', '.slsheet-btn-addrow', function () {
            if (!state || !state.ws || typeof state.ws.insertRow !== 'function') { return; }
            // The new row goes on the end, where an active filter would hide
            // it -- you would be typing into a row you cannot see. jspreadsheet
            // takes the same line in moveRow, which refuses outright while
            // search results are up.
            clearSearch();
            state.ws.insertRow();
        });

        ui.$errorBar.on('click', '.slsheet-jump', function (e: any) {
            e.preventDefault();
            jumpToFirstError();
        });

        // ── inspector ─────────────────────────────────────────────────
        ui.$inspector.on('change blur', '.slsheet-lin, .slsheet-cb input', function () {
            commitInspectorField($(this).closest('.slsheet-ins-group'));
        });

        ui.$inspector.on('click', '.slsheet-move', function () {
            if (state.inspectorRow === null || state.inspectorRow === undefined) { return; }
            moveWithinGroup(state.inspectorRow, Number($(this).attr('data-delta')));
        });

        ui.$inspector.on('click', '.slsheet-ladd', function () {
            const $group = $(this).closest('.slsheet-ins-group');
            const key = $group.attr('data-field');
            const $list = $group.find('.slsheet-llist');
            $list.append(Schema.BY_KEY[(key as any)].type === 'services'
                ? serviceRow(null)
                : listRow('', key));
            $list.find('input').last().trigger('focus');
        });

        ui.$inspector.on('click', '.slsheet-lx', function () {
            const $group = $(this).closest('.slsheet-ins-group');
            const $rows = $group.find('.slsheet-lrow');
            // Keep one empty row rather than leaving the group with no input.
            if ($rows.length === 1) { $rows.find('input').val(''); }
            else { $(this).closest('.slsheet-lrow').remove(); }
            commitInspectorField($group);
        });

        ui.$header.on('click', '.slsheet-btn-cols', function () {
            state.showAllColumns = !state.showAllColumns;
            $(this).text(state.showAllColumns ? '☰ Fewer columns' : '☰ All columns')
                .attr('aria-pressed', String(state.showAllColumns));
            // Column visibility changes the column set, so the grid is rebuilt.
            // state.entries is the source of truth and is untouched by this.
            rerenderGrid();
            renderInspector(state.inspectorRow);
        });

        ui.$header.on('input', '.slsheet-search', function () {
            if (state.ws && typeof state.ws.search === 'function') {
                state.ws.search(this.value);
            }
        });

        ui.$header.on('click', '.slsheet-btn-inspector', function () {
            state.inspectorOpen = !state.inspectorOpen;
            ui.$dialog.toggleClass('is-inspector-collapsed', !state.inspectorOpen);
            $(this).attr('aria-pressed', String(state.inspectorOpen));
        });

        ui.$footer.on('click', '.slsheet-btn-commit', function () { openCommitDialog(); });
    }

    // ══════════════════════════════════════════════════════════════════
    //  FOOTER
    // ══════════════════════════════════════════════════════════════════

    function blockingErrors() {
        const out: any = [];
        if (!state) { return out; }
        state.cellErrors.forEach(function (e: any) { out.push(e); });

        // A row added this session has a null snapshot. Nothing in the
        // schema treats a missing title as an error -- it must not, or the
        // pre-existing rows that lack one would block every commit (spec
        // D3) -- but a row the editor just created is entirely theirs, and
        // committing it untouched writes a nameless song. Gate that one
        // case, and only for added rows.
        state.entries.forEach(function (entry: any, row: any) {
            if (state.snapshot[row] !== null) { return; }
            const title = entry && entry.title;
            if (title === null || title === undefined || String(title).trim() === '') {
                out.push({ row: row, field: 'title',
                           message: 'A new row needs a title before it can be committed.' });
            }
        });
        state.inspectorErrors.forEach(function (message: any, k: any) {
            const parts = k.split(':');
            out.push({ row: Number(parts[0]), field: parts[1], message: message });
        });
        return out;
    }

    function updateFooter() {
        if (!state) { return; }

        const rows = new Set();
        state.dirty.forEach(function (_: any, k: any) { rows.add(k.split(':')[0]); });

        // A row added this session is already counted by state.added. Counting
        // its cells as modifications too reported one new row as
        // "1 modified - 1 added".
        const modified = Array.from(rows).filter(function (r) {
            return state.snapshot[Number(r)] !== null;
        }).length;

        const parts = [];
        if (modified) { parts.push(modified + ' modified'); }
        if (state.added) { parts.push(state.added + ' added'); }
        if (state.removed) { parts.push(state.removed + ' removed'); }

        const errors = blockingErrors();
        if (errors.length) {
            parts.push(errors.length + ' blocking error' + (errors.length > 1 ? 's' : ''));
        }

        state.ui.$footer.find('.slsheet-counts')
            .text(parts.length ? parts.join(' · ') : 'No changes');

        const hasChanges = modified > 0 || state.added > 0 || state.removed > 0;
        state.ui.$footer.find('.slsheet-btn-commit')
            .prop('disabled', !hasChanges || errors.length > 0);
    }

    // ══════════════════════════════════════════════════════════════════
    //  GRID
    // ══════════════════════════════════════════════════════════════════

    /** Field types that are arrays; edited only through the inspector. */
    const ARRAY_TYPES = ['list', 'services', 'sites'];

    function visibleKeys(showAll: any) {
        if (showAll === undefined) { showAll = state && state.showAllColumns; }
        return showAll ? Schema.COLUMNS_ALL : Schema.COLUMNS_DEFAULT;
    }

    /** Summarise an array field for its read-only grid cell. */
    function summarise(field: any, value: any) {
        const arr = Array.isArray(value) ? value : [];
        if (!arr.length) { return ''; }
        if (field.type === 'services') {
            return arr.map(function (s) { return (s && s.service_name) || '?'; }).join(', ');
        }
        return arr.join(' · ');
    }

    function buildColumns(keys: any) {
        return (keys || (visibleKeys as any)()).map(function (key: any) {
            const field = Schema.BY_KEY[key];

            if (key === '_rowNo') {
                return { type: 'numeric', title: 'No.', width: 46, readOnly: true };
            }

            // Arrays cannot be typed into a flat cell without inventing a
            // delimiter that wikitext does not already use. They render as a
            // read-only summary here; the inspector is the only editor, which
            // also means every array write goes through one sanitising path.
            if (ARRAY_TYPES.indexOf(field.type) !== -1) {
                return { type: 'text', title: field.label, width: 170, readOnly: true };
            }

            if (field.type === 'bool') {
                return { type: 'checkbox', title: field.label, width: 74 };
            }

            // song_type: a real enum. The current value is appended to the
            // source by widenEnumSources() so a pre-existing out-of-enum value
            // is shown rather than silently blanked.
            if (field.type === 'enum') {
                return {
                    type: 'dropdown', title: field.label, width: 110,
                    source: field.enum.slice(), autocomplete: false,
                };
            }

            // status: free text with suggestions. newOptions lets the editor
            // type anything, which the corpus says they already do (24 distinct
            // values live, and unknown ones are inert in both renderers).
            if (field.type === 'suggest') {
                return {
                    type: 'dropdown', title: field.label, width: 130,
                    source: field.suggestions.slice(),
                    newOptions: true, autocomplete: true,
                };
            }

            if (field.type === 'int') {
                return {
                    type: 'numeric', title: field.label, width: 90,
                    readOnly: !!field.readOnly,
                };
            }

            return {
                type: 'text', title: field.label,
                width: key === 'title' ? 260 : 130,
            };
        });
    }

    /**
     * Widen a dropdown's source so a pre-existing value outside it stays
     * selectable and visible. Without this, jspreadsheet renders an unmatched
     * value as blank and committing would silently erase it (spec D3).
     */
    function widenEnumSources(columns: any, keys: any, entries: any) {
        keys = keys || (visibleKeys as any)();
        entries = entries || state.entries;
        keys.forEach(function (key: any, x: any) {
            const field = Schema.BY_KEY[key];
            if (!field || !columns[x] || !columns[x].source) { return; }
            if (field.type !== 'enum' && field.type !== 'suggest') { return; }
            entries.forEach(function (entry: any) {
                const v = entry[key] === null || entry[key] === undefined ? '' : String(entry[key]);
                if (columns[x].source.indexOf(v) === -1) { columns[x].source.push(v); }
            });
        });
    }

    function rowToGrid(entry: any, index: any) {
        return (visibleKeys as any)().map(function (key: any) {
            if (key === '_rowNo') { return index + 1; }
            const field = Schema.BY_KEY[key];
            const raw = entry[key];
            if (ARRAY_TYPES.indexOf(field.type) !== -1) { return summarise(field, raw); }
            if (field.type === 'bool') { return raw === true; }
            return raw === null || raw === undefined ? '' : raw;
        });
    }

    function renderGrid() {
        const columns = (buildColumns as any)();
        (widenEnumSources as any)(columns);

        const worksheet = {
            data: state.entries.map(rowToGrid),
            columns: columns,

            // ── structural lockdown ────────────────────────────────────
            // Every flag is set EXPLICITLY to false: jspreadsheet tests
            // `0 != options.x`, so an undefined flag reads as ENABLED.
            allowInsertColumn: false,
            allowManualInsertColumn: false,   // also blocks tab-past-last-column growth
            allowDeleteColumn: false,
            allowRenameColumn: false,
            columnDrag: false,
            rowDrag: false,
            columnSorting: false,             // reordering under a whole-file commit is a footgun
            filters: false,
            // allowExport deliberately NOT here: jspreadsheet reads it off
            // parent.config, so on the worksheet it reads as a lockdown flag
            // while doing nothing whatsoever. It lives on the top-level config.

            // ── rows: permitted, but only deliberately ─────────────────
            allowInsertRow: true,
            allowManualInsertRow: false,      // no accidental growth by tabbing off the last row
            allowDeleteRow: true,
            // NOTE: the allow* flags belong to the worksheet, but the row
            // EVENTS do not -- they are dispatched off the top-level
            // options and are registered there. See below.

            // ── viewport ───────────────────────────────────────────────
            tableOverflow: true,
            tableHeight: '60vh',
            // Without tableWidth, .jss_content is as wide as the table and
            // jspreadsheet scrolls vertically only -- the horizontal axis
            // spills into the wrapper. Constraining it here puts BOTH axes on
            // .jss_content, which is also what freezeColumns needs: its sticky
            // cells resolve against jspreadsheet's own scrollport.
            tableWidth: '100%',
            // Off deliberately. lazyLoading renders 100 rows and appends 30
            // more each time you hit the bottom, so the scrollbar never
            // reflects the real end and reaching row 652 takes ~22 scrolls.
            // Measured on the 652-row worst case (Soraru): rendering every row
            // up front costs 56ms against 60ms lazy, and 1000 rows costs 81ms.
            // It bought nothing and cost the ability to seek.
            lazyLoading: false,
            search: true,                     // required for ws.search(); its own box is hidden in CSS
            freezeColumns: 2,                 // No. + Title stay pinned while scrolling right
            defaultColWidth: 120,
        };

        state.ws = jspreadsheet(state.ui.$grid[0], {
            toolbar: false,
            // Kills insert/delete/rename column, sorting and "Save as" wholesale.
            // Used IN ADDITION to the flags above, because the keyboard path
            // (Ctrl+Delete on a selected header) is gated by the flag, not the menu.
            contextMenu: function () { return false; },
            // Read from parent.config, NOT from the worksheet -- the one allow*
            // flag jspreadsheet looks up here rather than there. Export stays
            // on, but it answers to Ctrl+Shift+E; onShortcutKeydown takes Ctrl+S
            // away from it before jspreadsheet's own listener can run.
            allowExport: true,
            // Every one of these runs inside jspreadsheet's call stack, so
            // every one is wrapped: a throw that unwinds through jspreadsheet
            // leaves it half-updated and unusable. The fallbacks match each
            // event's contract -- onbeforechange must return a value,
            // onbeforepaste the data, the onbefore*row pair a boolean.
            oneditionstart: (guard as any)(onEditionStart),
            onbeforechange: guard(onBeforeChange, function (_ws: any, _cell: any, _x: any, _y: any, value: any) {
                return value;
            }),
            onbeforepaste: guard(onBeforePaste, function (_ws: any, data: any) { return data; }),
            onchange: (guard as any)(onCellChanged),
            onselection: (guard as any)(onSelectionChanged),
            // Every jspreadsheet event is dispatched off THESE options, not
            // off the worksheet. onbeforeinsertrow/onbeforedeleterow used to
            // sit on the worksheet object and therefore never fired at all:
            // the grid grew a row, state.entries did not, and from then on
            // every row index below it referred to the wrong song. The
            // visible symptoms were an added row the inspector could not
            // see, a No. cell left blank, and a Commit button that stayed
            // disabled because state.added never moved. Delete was broken
            // the same way, and more quietly: the row vanished from the
            // grid but survived in state.entries, so committing put it back.
            onbeforeinsertrow: guard(onBeforeInsertRow, false),
            oninsertrow: (guard as any)(onInsertRow),
            onbeforedeleterow: guard(onBeforeDeleteRow, false),
            ondeleterow: (guard as any)(onDeleteRow),
            worksheets: [ worksheet ],
        })[0];
    }

    /**
     * Run `fn` after jspreadsheet has finished whatever it is doing.
     *
     * Our handlers execute inside jspreadsheet's own call stack -- onchange is
     * dispatched from the middle of closeEditor, which is still holding the
     * cell it is about to tear down. Anything that re-parents rows (moveRow) or
     * rebuilds the table has to wait for that to unwind.
     */
    function defer(fn: any) {
        const owner = state;
        window.setTimeout(function () {
            if (!state || state !== owner) { return; }   // dialog closed meanwhile
            try { fn(); } catch (e) { reportHandlerError(e); }
        }, 0);
    }

    /**
     * Wrap a jspreadsheet event handler so an exception can never escape into
     * jspreadsheet's call stack.
     *
     * This is not defensive padding, it is the difference between a bug and a
     * dead editor. When renumberFrom threw inside oninsertrow, the exception
     * unwound through jspreadsheet's insertRow and abandoned it half-done:
     * state.entries had already grown in onbeforeinsertrow, the grid had not,
     * and from then on every index disagreed. The next moveRow indexed past
     * the end of ws.rows and threw again -- this time inside closeEditor,
     * which then never cleared `edition`. jspreadsheet believed an editor was
     * still open forever after, so every scroll, click and keypress re-entered
     * closeEditor and threw on the editor it no longer had. The cell cursor
     * froze while scrolling and the inspector, which is our own code, kept
     * working -- which is exactly how it was reported.
     *
     * @param {Function} fn
     * @param {*} [onError]  value (or factory) to return if fn throws; must
     *                       match what the event contract expects
     */
    function guard(fn: any, onError: any) {
        return function () {
            try {
                return fn.apply(this, arguments);
            } catch (e) {
                reportHandlerError(e);
                return typeof onError === 'function'
                    ? onError.apply(this, arguments)
                    : onError;
            }
        };
    }

    /**
     * Last resort: rebuild the grid from state.entries, which is the source of
     * truth and holds every edit made this session. Losing the grid's own view
     * costs a scroll position; letting the two drift costs the edit.
     */
    function reportHandlerError(e: any) {
        try { window.console.error('[SonglistSheet]', e); } catch (ignore) { /* no console */ }
        if (!state || state.resyncing) { return; }
        state.resyncing = true;
        const owner = state;
        window.setTimeout(function () {
            if (!state || state !== owner) { return; }
            state.resyncing = false;
            try {
                rerenderGrid();
                renderInspector(state.inspectorRow);
                updateFooter();
                if (Api && Api.toast) {
                    Api.toast('The grid hit a problem and was rebuilt. Your edits are ' +
                              'still here — check the row you were on before committing.',
                              'error', 8000);
                }
            } catch (ignore) { /* the rebuild is already the fallback */ }
        }, 0);
    }

    /** Drop any active search. */
    function clearSearch() {
        if (!state || !state.ws) { return; }
        state.ui.$header.find('.slsheet-search').val('');
        try {
            if (typeof state.ws.resetSearch === 'function') { state.ws.resetSearch(); }
            else if (typeof state.ws.search === 'function') { state.ws.search(''); }
        } catch (e) { /* nothing was filtered */ }
    }

    /** True when the grid and state.entries still describe the same rows. */
    function gridInSync() {
        const rows = state && state.ws && state.ws.rows;
        return !!rows && rows.length === state.entries.length;
    }

    function rerenderGrid() {
        // jspreadsheet owns the scroller, so the position to preserve lives on
        // .jss_content -- the wrapper never scrolls, and reading it here just
        // returned 0 and dropped the editor back to the top of the sheet.
        const before = state.ui.$grid.find('.jss_content')[0];
        const top = before ? before.scrollTop : 0;
        const left = before ? before.scrollLeft : 0;

        if (state.ws && typeof state.ws.destroy === 'function') {
            try { state.ws.destroy(); } catch (e) { /* already gone */ }
        }
        state.ui.$grid.empty();
        renderGrid();

        const after = state.ui.$grid.find('.jss_content')[0];
        if (after) { after.scrollTop = top; after.scrollLeft = left; }
    }

    // ══════════════════════════════════════════════════════════════════
    //  GRID HOOKS
    //  onBeforeChange / onBeforePaste / onCellChanged / onBeforeDeleteRow are
    //  filled in by Task 10 (validation + dirty tracking). Until then they are
    //  deliberately conservative: edits pass through UNVALIDATED, so this file
    //  must not be deployed before Task 10 lands.
    // ══════════════════════════════════════════════════════════════════

    function onSelectionChanged(_instance: any, _x1: any, y1: any) {
        if (state && state.inspectorRow !== y1) { renderInspector(y1); }
    }

    /**
     * Keep state.entries index-aligned with the grid whenever rows appear.
     *
     * This fires for the + Row button AND for paste overflow: jspreadsheet
     * calls insertRow() when a pasted block is taller than the remaining rows.
     * Without this the grid would have rows that state.entries does not, and
     * every index after the insertion point would refer to the wrong song.
     *
     * @param {Object} ws
     * @param {Array<{row:number,data:Array}>} rows
     */
    function onBeforeInsertRow(_ws: any, rows: any) {
        if (!state) { return true; }
        const list = Array.isArray(rows) ? rows.slice() : [];
        list.sort(function (a, b) { return (a.row || 0) - (b.row || 0); });

        list.forEach(function (r) {
            const at = (typeof r.row === 'number' && r.row >= 0)
                ? Math.min(r.row, state.entries.length)
                : state.entries.length;
            state.entries.splice(at, 0, Schema.blankEntry());
            state.snapshot.splice(at, 0, null);   // null = did not exist before
            state.added += 1;
        });

        updateFooter();
        return true;
    }

    /**
     * Repaint the No. column from `from` down.
     *
     * _rowNo is derived from array position, so an insert, delete or move makes
     * every number below it stale. Moving a freshly added row from the bottom
     * of a 652-row page to its date means renumbering nearly the whole sheet,
     * so this writes the cell and jspreadsheet's own data array directly rather
     * than going through setValueFromCoords -- which would push 650 undo
     * entries and fire 650 change events for a derived column that is not an
     * edit at all and is never read back on commit.
     */
    function renumberFrom(from: any) {
        if (!state || !state.ws) { return; }
        if ((visibleKeys as any)()[0] !== '_rowNo') { return; }
        if (typeof state.ws.getCellFromCoords !== 'function') { return; }

        // Bounded by the GRID, not by state.entries. A filtered or partly
        // rendered grid has fewer rows than we have entries, and
        // getCellFromCoords throws rather than returning null for a row it
        // cannot reach -- which is how this function came to abort an insert
        // that jspreadsheet was in the middle of.
        const data = state.ws.options && state.ws.options.data;
        const rows = state.ws.rows;
        const limit = Math.min(state.entries.length, (rows && rows.length) || 0);
        for (let y = Math.max(0, from); y < limit; y++) {
            let cell = null;
            try { cell = state.ws.getCellFromCoords(0, y); } catch (e) { cell = null; }
            if (cell) { cell.textContent = String(y + 1); }
            if (data && data[y]) { data[y][0] = y + 1; }
        }
    }

    /**
     * Move a row to `to`, carrying everything that is keyed by row index.
     *
     * jspreadsheet's moveRow fixes up its own rows/records/data. state.entries,
     * state.snapshot and the three "row:field" maps are ours, and every row
     * between the two ends shifts by one while the moved row jumps.
     */
    function relocateRow(from: any, to: any) {
        // Same reason as sortedIndexFor: `shift()` decides which rows carry
        // their dirty marks by comparing `r === from`, and jspreadsheet indexes
        // ws.rows with whatever it is handed.
        from = Number(from);
        to = Number(to);
        if (!state || from === to) { return to; }
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);

        state.entries.splice(to, 0, state.entries.splice(from, 1)[0]);
        state.snapshot.splice(to, 0, state.snapshot.splice(from, 1)[0]);

        const shift = function (r: any) {
            if (r === from) { return to; }
            if (r < lo || r > hi) { return r; }
            return from < to ? r - 1 : r + 1;
        };
        [state.dirty, state.cellErrors, state.inspectorErrors].forEach(function (m) {
            const moved: any = [];
            Array.from(m.keys()).forEach(function (k) {
                const cut = (k as any).indexOf(':');
                const r = Number((k as any).slice(0, cut));
                const n = shift(r);
                if (n !== r) { moved.push([n + (k as any).slice(cut), m.get(k)]); m.delete(k); }
            });
            moved.forEach(function (kv: any) { m.set(kv[0], kv[1]); });
        });
        state.cellErrors.forEach(function (v: any, k: any) {
            if (v && typeof v === 'object') { v.row = Number(k.slice(0, k.indexOf(':'))); }
        });

        // state.entries is already correct at this point. The grid is a view
        // of it, so if the two disagree the honest repair is to rebuild the
        // view -- not to hand jspreadsheet an index into rows it does not have,
        // which throws inside its own DOM surgery and leaves it wedged.
        if (state.ws && typeof state.ws.moveRow === 'function' && gridInSync()) {
            state.suspend = true;
            try { state.ws.moveRow(from, to); } catch (e) { reportHandlerError(e); }
            finally { state.suspend = false; }
            renumberFrom(lo);
        } else {
            reportHandlerError(new Error(
                'grid out of sync: ' + ((state.ws && state.ws.rows) || []).length +
                ' rows for ' + state.entries.length + ' entries'));
        }
        return to;
    }

    /** Where `state.entries[row]` belongs once the sort key is applied. */
    function sortedIndexFor(row: any) {
        // `i === row` below is what makes a row not count itself. It is only
        // ever true for a number, and the destination is one too high without
        // it, so the type is load-bearing rather than incidental.
        row = Number(row);
        const entry = state.entries[row];
        let at = 0;
        for (let i = 0; i < state.entries.length; i++) {
            if (i === row) { continue; }
            if (Schema.compareEntries(state.entries[i], entry) <= 0) { at++; }
            else { break; }
        }
        return at;
    }

    /**
     * Put a newly added row where its date says it goes.
     *
     * "+ Row" can only append -- a blank row has no date, so there is nowhere
     * else to put it. That left the row stranded at the bottom: the grid showed
     * an order the commit would not produce, and Move up/down had no adjacent
     * neighbour to swap with because the row's date group was hundreds of rows
     * away. Repositioning the moment the date is filled in restores the
     * invariant the rest of the sheet assumes -- state.entries is in sort order
     * -- and makes placement visible while you are still editing.
     *
     * Only rows added this session move. Retiming an existing song would be a
     * surprise, and the commit sorts it anyway.
     */
    function repositionAddedRow(row: any) {
        const to = sortedIndexFor(row);
        if (to === row) { return row; }

        relocateRow(row, to);
        renderInspector(to);

        if (typeof state.ws.updateSelectionFromCoords === 'function') {
            const x = Math.max(0, (visibleKeys as any)().indexOf('upload_date'));
            state.ws.updateSelectionFromCoords(x, to, x, to);
        }
        if (typeof state.ws.scrollTo === 'function') { state.ws.scrollTo(0, to); }

        if (Api && Api.toast) {
            Api.toast('Moved to row ' + (to + 1) + ' to match its date.', 'success', 4000);
        }
        return to;
    }

    /**
     * Paint a freshly inserted row, which jspreadsheet fills with empty strings.
     *
     * Runs on `oninsertrow` rather than `onbeforeinsertrow` because the DOM row
     * does not exist yet in the latter.
     */
    function onInsertRow(_ws: any, rows: any) {
        if (!state) { return; }

        const at = (rows || [])
            .map(function (r: any) { return r && r.row; })
            .filter(function (n: any) { return typeof n === 'number' && n >= 0; });
        const first = at.length ? Math.min.apply(null, at) : state.entries.length - 1;

        if (typeof state.ws.setRowData === 'function') {
            state.suspend = true;
            try {
                at.forEach(function (y: any) {
                    if (state.entries[y]) {
                        state.ws.setRowData(y, rowToGrid(state.entries[y], y));
                    }
                });
            } finally {
                state.suspend = false;
            }
        }

        renumberFrom(first);
        // The row you just added is the one you want to fill in.
        renderInspector(first);
        updateFooter();
    }

    /** After a delete: every number below the hole is wrong, and the inspector
     *  may be pointing at a row that no longer exists. */
    function onDeleteRow(_ws: any, rowIndices: any) {
        if (!state) { return; }
        const at = (rowIndices || []).map(Number).filter(function (n: any) { return !isNaN(n); });
        renumberFrom(at.length ? Math.min.apply(null, at) : 0);
        renderInspector(null);
        updateFooter();
    }

    function onBeforeDeleteRow(_ws: any, rowIndices: any) {
        if (!state) { return false; }
        const list = (rowIndices || []).slice();
        if (!list.length) { return false; }
        if (!window.confirm('Remove ' + list.length + ' row(s) from the song list?')) {
            return false;
        }

        // Descending, so earlier splices do not shift later indices.
        list.sort(function (a: any, b: any) { return b - a; }).forEach(function (i: any) {
            state.entries.splice(i, 1);
            state.snapshot.splice(i, 1);
            state.removed += 1;
            // Drop any per-cell state pinned to the row being removed.
            [state.dirty, state.cellErrors, state.inspectorErrors].forEach(function (m) {
                Array.from(m.keys()).forEach(function (k) {
                    if (Number((k as any).split(':')[0]) === i) { m.delete(k); }
                });
            });
        });

        state.inspectorRow = null;
        renderInspector(null);
        renderErrorBar();
        updateFooter();
        return true;
    }

    /**
     * Per-cell gate. Returning a value replaces what was typed.
     *
     * An invalid value is kept as typed rather than discarded, so the editor can
     * see and correct it; the cell is flagged and commit is blocked until it is
     * fixed. Array columns are read-only in the grid and never reach here.
     */
    /**
     * Offer title suggestions inside the grid too.
     *
     * jspreadsheet dispatches this at the TOP of openEditor, before the
     * input exists, so the lookup is deferred a tick.
     */
    function onEditionStart(_ws: any, cell: any, x: any, _y: any) {
        if (!state || (visibleKeys as any)()[x] !== 'title') { return; }
        if (!Api || typeof Api.attachTitleSuggestions !== 'function') { return; }
        window.setTimeout(function () {
            const input = cell && cell.querySelector && cell.querySelector('input, textarea');
            if (input) { Api.attachTitleSuggestions(input); }
        }, 0);
    }

    function onBeforeChange(_ws: any, cell: any, x: any, y: any, value: any) {
        if (!state || state.suspend) { return value; }

        const key = (visibleKeys as any)()[x];
        const field = key && Schema.BY_KEY[key];
        if (!field || field.readOnly) { return ''; }

        // An array column is a read-only summary of what the inspector holds.
        // The only way to reach here with one is a forced programmatic write,
        // and sanitizeValue would turn the summary text into [] -- so pass it
        // through untouched. onBeforePaste guards the same case.
        if (ARRAY_TYPES.indexOf(field.type) !== -1) { return value; }

        const entry = state.entries[y] || {};
        const res = Schema.sanitizeValue(key, value, entry);
        const $cell = $(cell);

        $cell.removeClass('slsheet-cell-error slsheet-cell-warn').removeAttr('title');

        if (res.error) {
            $cell.addClass('slsheet-cell-error').attr('title', res.error);
            state.cellErrors.set(dirtyKey(y, key), { row: y, field: key, message: res.error });
            renderErrorBar();
            updateFooter();
            return value;
        }

        state.cellErrors.delete(dirtyKey(y, key));
        if (res.warning) {
            $cell.addClass('slsheet-cell-warn').attr('title', res.warning);
        }
        renderErrorBar();
        return res.value === null || res.value === undefined ? '' : res.value;
    }

    function onCellChanged(_ws: any, cell: any, x: any, y: any, value: any) {
        if (!state || state.suspend) { return; }

        // jspreadsheet dispatches coordinates as strings -- onbeforepaste
        // already knew that. Everything below is index arithmetic or a strict
        // comparison against a number, and '3' === 3 is false, so each of
        // those quietly did the wrong thing: sortedIndexFor stopped skipping
        // the row itself and returned one past the last row, which moveRow
        // dereferenced as ws.rows[length].element; the inspector heading never
        // matched its own row; and 'Row ' + (y + 1) printed "Row 31".
        // Normalise once, here, rather than at each of the three use sites.
        y = Number(y);

        const key = (visibleKeys as any)()[x];
        const field = key && Schema.BY_KEY[key];
        if (!field || field.readOnly) { return; }

        // The inspector owns the array fields; a grid write must never reach
        // one, or the entry gets the flattened summary instead of the list.
        if (ARRAY_TYPES.indexOf(field.type) !== -1) { return; }

        const entry = state.entries[y];
        if (!entry) { return; }

        if (field.type === 'bool') {
            entry[key] = (value === true || value === 'true' || value === '1' || value === 1);
        } else if (value === '' && field.type !== 'suggest' && field.type !== 'enum') {
            // Blank means "no value" for nullable fields, but status/song_type
            // legitimately hold the empty string.
            entry[key] = null;
        } else {
            entry[key] = value;
        }

        markDirty(y, key);
        $(cell).toggleClass('slsheet-cell-dirty', state.dirty.has(dirtyKey(y, key)));

        // A row added this session has been sitting at the bottom waiting
        // for a date. Now that it has one, move it to where it belongs -- but
        // not from here. onchange is dispatched from inside closeEditor, and
        // moveRow re-parents the very <tr> that closeEditor is about to finish
        // tearing down. See guard() for what that cost.
        if (key === 'upload_date' && state.snapshot[y] === null) {
            defer(function () {
                if (state.snapshot[y] !== null || !state.entries[y]) { return; }
                repositionAddedRow(y);
                updateFooter();
            });
        }

        // Keep the inspector heading honest without re-rendering it -- a
        // re-render would discard a list row the editor is part-way through.
        if (key === 'title' && y === state.inspectorRow) {
            state.ui.$inspector.find('.slsheet-ins-title')
                .text('Row ' + (y + 1) + ' — ' + (entry.title || '(untitled)'));
        }

        updateFooter();
    }

    /**
     * Bulk gate for Ctrl+V. onbeforechange does NOT run for pasted cells, so
     * without this the whole validation layer is bypassable with one keystroke.
     *
     * Contract is asymmetric: `data` arrives as a 2-D array of { value } objects
     * but the return must be a 2-D array of PLAIN values -- jspreadsheet assigns
     * the returned array straight over its internal one.
     *
     * A cell that cannot be coerced is left at its current value rather than
     * failing the whole paste, so a mostly-good block still lands.
     */
    function onBeforePaste(_ws: any, data: any, x: any, y: any) {
        if (!state || state.suspend || !Array.isArray(data)) { return data; }

        // jspreadsheet hands these over straight off selectedCell, where they
        // are STRINGS. `x + dx` then concatenates instead of adding: a paste
        // into column 1 was routed to column "10" -- featured_artists, an
        // array column -- so every paste was refused as "did not fit the
        // column" and the cell was blanked.
        //
        // It only worked if you double-clicked the cell first, because
        // pasteControls skips this whole path while a cell is in edit mode and
        // lets the browser paste into the input directly.
        const ox = Number(x) || 0;
        const oy = Number(y) || 0;

        const keys = (visibleKeys as any)();
        let skipped = 0;

        const current = function (cx: any, cy: any) {
            if (state.ws && typeof state.ws.getValueFromCoords === 'function') {
                const v = state.ws.getValueFromCoords(cx, cy);
                return v === null || v === undefined ? '' : v;
            }
            return '';
        };

        const out = data.map(function (row, dy) {
            return row.map(function (cellObj: any, dx: any) {
                const cx = ox + dx;
                const cy = oy + dy;
                const key = keys[cx];
                const field = key && Schema.BY_KEY[key];

                const incoming = (cellObj && typeof cellObj === 'object' && 'value' in cellObj)
                    ? cellObj.value
                    : cellObj;

                // Outside the column set, read-only, or an array column: keep
                // whatever is already there.
                if (!field || field.readOnly || ARRAY_TYPES.indexOf(field.type) !== -1) {
                    skipped += 1;
                    return current(cx, cy);
                }

                const res = Schema.sanitizeValue(key, incoming, state.entries[cy] || {});
                if (res.error) {
                    skipped += 1;
                    return current(cx, cy);
                }
                return res.value === null || res.value === undefined ? '' : res.value;
            });
        });

        if (skipped && Api && Api.toast) {
            Api.toast(
                skipped + ' pasted cell' + (skipped > 1 ? 's' : '') +
                ' did not fit the column and ' + (skipped > 1 ? 'were' : 'was') +
                ' left unchanged.',
                'error', 6000
            );
        }

        return out;
    }

    // ══════════════════════════════════════════════════════════════════
    //  ROW INSPECTOR
    //  The only editor for the six array fields. Everything they accept passes
    //  through Schema.sanitizeValue here, so there is exactly one place where a
    //  malformed array can be introduced -- and it is guarded.
    // ══════════════════════════════════════════════════════════════════

    const INSPECTOR_FIELDS = [
        'featured_artists', 'notes', 'orikyoku_with',
        'deleted_sites', 'privated_sites', 'other_services'
    ];

    const SITE_LABELS = { yt: 'YouTube', nnd: 'NicoNico', bb: 'Bilibili' };
    const SITE_ID_FIELD = { yt: 'youtube_id', nnd: 'niconico_id', bb: 'bilibili_id' };

    function dirtyKey(row: any, field: any) { return row + ':' + field; }

    /**
     * Mark or unmark a cell as changed, by comparing against the snapshot taken
     * at load. Editing a value and putting it back clears the mark rather than
     * leaving a phantom change, which is what keeps the commit diff honest.
     */
    function markDirty(row: any, field: any) {
        const original = state.snapshot[row];
        const current = state.entries[row];
        if (!original) {
            // Row added this session: everything on it is a change.
            state.dirty.set(dirtyKey(row, field), true);
            return;
        }
        const same = JSON.stringify(original[field]) === JSON.stringify(current[field]);
        if (same) { state.dirty.delete(dirtyKey(row, field)); }
        else { state.dirty.set(dirtyKey(row, field), true); }
    }

    function listRow(value: any, fieldKey: any) {
        return $('<div class="slsheet-lrow">').append(
            $('<input type="text" class="slsheet-lin">')
                .val(value === null || value === undefined ? '' : value)
                .attr('data-field', fieldKey),
            $('<button type="button" class="slsheet-lx" aria-label="Remove">×</button>')
        );
    }

    function serviceRow(svc: any) {
        return $('<div class="slsheet-lrow">').append(
            $('<input type="text" class="slsheet-lin slsheet-lin-svc">')
                .attr('placeholder', 'service')
                .val((svc && svc.service_name) || ''),
            $('<input type="text" class="slsheet-lin slsheet-lin-url">')
                .attr('placeholder', 'https://…')
                .val((svc && svc.video_link) || ''),
            $('<button type="button" class="slsheet-lx" aria-label="Remove">×</button>')
        );
    }

    function renderInspector(rowIndex: any) {
        const $ins = state.ui.$inspector.empty();

        if (rowIndex === null || rowIndex === undefined || !state.entries[rowIndex]) {
            state.inspectorRow = null;
            $ins.append($('<p class="slsheet-ins-empty">')
                .text('Select a row to edit its lists.'));
            return;
        }

        const entry = state.entries[rowIndex];
        state.inspectorRow = rowIndex;

        $ins.append($('<h3 class="slsheet-ins-title">').text(
            'Row ' + (rowIndex + 1) + ' — ' + (entry.title || '(untitled)')
        ));

        $ins.append(buildInspectorPlacement(entry));

        INSPECTOR_FIELDS.forEach(function (key) {
            const field = Schema.BY_KEY[key];
            const $group = $('<div class="slsheet-ins-group">')
                .attr('data-field', key)
                .append($('<div class="slsheet-ins-label">').text(field.label));

            if (field.type === 'sites') {
                const current = entry[key] || [];
                Schema.SITE_ENUM.forEach(function (site: any) {
                    // A site can only be marked deleted/privated if the row
                    // actually has that platform's id. Mirrors
                    // syncPlatformCheckboxes() in the row form, and stops the
                    // Lua module being handed a site with no matching link.
                    const hasId = !!entry[(SITE_ID_FIELD as any)[site]];
                    $group.append(
                        $('<label class="slsheet-cb">')
                            .toggleClass('is-disabled', !hasId)
                            .attr('title', hasId ? '' : 'This row has no ' + (SITE_ID_FIELD as any)[site])
                            .append(
                                $('<input type="checkbox">')
                                    .val(site)
                                    .prop('checked', current.indexOf(site) !== -1)
                                    .prop('disabled', !hasId),
                                $('<span>').text((SITE_LABELS as any)[site])
                            )
                    );
                });
            } else if (field.type === 'services') {
                const $list = $('<div class="slsheet-llist">');
                const rows = (entry[key] && entry[key].length) ? entry[key] : [ null ];
                rows.forEach(function (svc: any) { $list.append(serviceRow(svc)); });
                $group.append($list,
                    $('<button type="button" class="slsheet-ladd">+ Add service</button>'));
            } else {
                const $list = $('<div class="slsheet-llist">');
                const rows = (entry[key] && entry[key].length) ? entry[key] : [ '' ];
                rows.forEach(function (v: any) { $list.append(listRow(v, key)); });
                $group.append($list,
                    $('<button type="button" class="slsheet-ladd">+ Add</button>'));
            }

            $group.append($('<div class="slsheet-ins-msg">'));
            $ins.append($group);
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  PLACEMENT
    //  A song's position comes from its upload_date. When two songs share one,
    //  the date cannot decide and `order` does -- see SonglistSchema. These are
    //  the only controls that write it from the sheet.
    // ══════════════════════════════════════════════════════════════════

    function groupLabel(dateKey: any) {
        return dateKey === '9999-12-31' ? 'the undated songs' : dateKey;
    }

    /**
     * Where this row sits inside its date group, plus the two buttons that
     * change it. A song whose date is unique has nothing to decide, so it gets
     * a sentence rather than controls.
     */
    function buildInspectorPlacement(entry: any) {
        const $g = $('<div class="slsheet-ins-group slsheet-ins-place">')
            .append($('<div class="slsheet-ins-label">').text('Placement'));

        const group = Schema.groupOf(state.entries, entry);
        const gAt = group.indexOf(entry);
        const label = groupLabel(Schema.dateSortKey(entry));

        if (group.length < 2) {
            return $g.append($('<div class="slsheet-ins-msg">')
                .text('Only song on ' + label + ', so the date already places it.'));
        }

        return $g.append(
            $('<div class="slsheet-place-row">').append(
                $('<button type="button" class="slsheet-move" data-delta="-1">')
                    .text('Move up').prop('disabled', gAt <= 0),
                $('<button type="button" class="slsheet-move" data-delta="1">')
                    .text('Move down').prop('disabled', gAt >= group.length - 1)
            ),
            $('<div class="slsheet-ins-msg">')
                .text((gAt + 1) + ' of ' + group.length + ' on ' + label + '.')
        );
    }

    /**
     * Swap two rows in every structure that is keyed by row index.
     *
     * state.dirty / cellErrors / inspectorErrors are all "row:field" maps, so a
     * swap that only touched state.entries would leave every mark on the two
     * rows pointing at the wrong song -- including the ones that block commit.
     */
    function swapRows(i: any, j: any) {
        const e = state.entries[i]; state.entries[i] = state.entries[j]; state.entries[j] = e;
        const s = state.snapshot[i]; state.snapshot[i] = state.snapshot[j]; state.snapshot[j] = s;

        [state.dirty, state.cellErrors, state.inspectorErrors].forEach(function (m) {
            const moved: any = [];
            Array.from(m.keys()).forEach(function (k) {
                const cut = (k as any).indexOf(':');
                const r = Number((k as any).slice(0, cut));
                if (r !== i && r !== j) { return; }
                moved.push([ (r === i ? j : i) + (k as any).slice(cut), m.get(k) ]);
                m.delete(k);
            });
            moved.forEach(function (kv: any) { m.set(kv[0], kv[1]); });
        });

        // The error bar reads .row off the value, not the key.
        state.cellErrors.forEach(function (v: any, k: any) {
            if (v && typeof v === 'object') { v.row = Number(k.slice(0, k.indexOf(':'))); }
        });

        if (state.ws && typeof state.ws.setRowData === 'function') {
            state.suspend = true;
            try {
                state.ws.setRowData(i, rowToGrid(state.entries[i], i));
                state.ws.setRowData(j, rowToGrid(state.entries[j], j));
            } finally {
                state.suspend = false;
            }
        }
        repaintRow(i);
        repaintRow(j);
    }

    /** Re-apply the dirty highlight after a row's cells were rewritten. */
    function repaintRow(row: any) {
        if (!state.ws || typeof state.ws.getCellFromCoords !== 'function') { return; }
        (visibleKeys as any)().forEach(function (key: any, x: any) {
            const cell = state.ws.getCellFromCoords(x, row);
            if (cell) {
                $(cell).toggleClass('slsheet-cell-dirty', state.dirty.has(dirtyKey(row, key)));
            }
        });
    }

    /**
     * Move a row one step up or down inside its date group, writing a dense
     * 1..n `order` across that whole group.
     *
     * A date group is contiguous in a sorted file, so one step is a swap with
     * the adjacent row and the grid can show it immediately. If the page was
     * hand-edited into an unsorted state the two are not adjacent: the `order`
     * written is still correct, but we say so rather than faking the movement.
     */
    function moveWithinGroup(rowIndex: any, delta: any) {
        const entry = state.entries[rowIndex];
        if (!entry) { return; }

        const group = Schema.groupOf(state.entries, entry);
        const gAt = group.indexOf(entry);
        const to = gAt + delta;
        if (gAt === -1 || to < 0 || to >= group.length) { return; }

        const neighbourIndex = state.entries.indexOf(group[to]);

        group.splice(gAt, 1);
        group.splice(to, 0, entry);
        Schema.applyGroupOrder(group);

        let landed = rowIndex;
        if (Math.abs(neighbourIndex - rowIndex) === 1) {
            swapRows(rowIndex, neighbourIndex);
            landed = neighbourIndex;
        } else if (Api && Api.toast) {
            // Only reachable on a page that was hand-edited out of sort order:
            // rows added here are repositioned as soon as they have a date.
            Api.toast('Order updated, but this page is not stored in sorted order, ' +
                      'so the move will only be visible once you commit.', 'error', 7000);
        }

        // After the swap, so the marks land on the rows' new indices.
        group.forEach(function (e: any) {
            const i = state.entries.indexOf(e);
            if (i !== -1) { markDirty(i, 'order'); }
        });

        updateFooter();
        renderInspector(landed);
    }

    /** Read one inspector group back into the entry, sanitising on the way. */
    function commitInspectorField($group: any) {
        const key = $group.attr('data-field');
        const field = Schema.BY_KEY[key];
        const row = state.inspectorRow;
        const entry = state.entries[row];
        if (!entry) { return; }

        let raw;
        if (field.type === 'sites') {
            raw = $group.find('input[type="checkbox"]:checked')
                .map(function () { return this.value; }).get();
        } else if (field.type === 'services') {
            raw = $group.find('.slsheet-lrow').map(function () {
                const name = ($(this).find('.slsheet-lin-svc').val()! as any).trim();
                const link = ($(this).find('.slsheet-lin-url').val()! as any).trim();
                return (name || link) ? { service_name: name, video_link: link } : null;
            }).get().filter(Boolean);
        } else {
            raw = $group.find('.slsheet-lin').map(function () {
                return $(this).val().trim();
            }).get().filter(Boolean);
        }

        const res = Schema.sanitizeValue(key, raw, entry);
        const $msg = $group.find('.slsheet-ins-msg');

        if (res.error) {
            $msg.text(res.error).addClass('is-error').removeClass('is-warning');
            $group.addClass('is-invalid');
            state.inspectorErrors.set(dirtyKey(row, key), res.error);
        } else {
            $group.removeClass('is-invalid');
            state.inspectorErrors.delete(dirtyKey(row, key));
            $msg.text(res.warning || '')
                .toggleClass('is-warning', !!res.warning)
                .removeClass('is-error');

            const before = JSON.stringify(entry[key]);
            entry[key] = res.value;
            if (JSON.stringify(res.value) !== before) {
                markDirty(row, key);
                refreshRowSummary(row);
            }
        }

        renderErrorBar();
        updateFooter();
    }

    /** Push updated array summaries back into their read-only grid cells. */
    /**
     * Repaint the read-only summary cells for one row's array fields.
     *
     * This is a display refresh, not an edit, so it has to be suspended. Left
     * unsuspended it fed the summary string straight back through
     * onbeforechange/onchange, and sanitizeValue answers a non-array with an
     * empty array -- so committing "Alpha" in the inspector wrote [] over the
     * entry a moment later. On a row that already had artists the list was
     * silently emptied; on a row that did not, the dirty mark was withdrawn
     * again and Commit stayed disabled, which is what made the inspector look
     * like it had no save at all.
     */
    function refreshRowSummary(rowIndex: any) {
        if (!state.ws || typeof state.ws.setValueFromCoords !== 'function') { return; }
        const keys = (visibleKeys as any)();
        state.suspend = true;
        try {
            keys.forEach(function (key: any, x: any) {
                const field = Schema.BY_KEY[key];
                if (ARRAY_TYPES.indexOf(field.type) === -1) { return; }
                state.ws.setValueFromCoords(
                    x, rowIndex, summarise(field, state.entries[rowIndex][key]), true);
            });
        } finally {
            state.suspend = false;
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  PLACEHOLDERS — replaced in later tasks
    // ══════════════════════════════════════════════════════════════════

    /**
     * The inline bar above the footer. Names the offending row and field so
     * "Commit is disabled and I don't know why" is never a question the editor
     * has to ask.
     */
    function renderErrorBar() {
        if (!state) { return; }

        const errors = blockingErrors();
        const $bar = state.ui.$errorBar;

        if (!errors.length) {
            $bar.attr('hidden', true).empty();
            return;
        }

        const first = errors[0];
        const label = (Schema.BY_KEY[first.field] || {}).label || first.field;

        $bar.removeAttr('hidden').empty().append(
            $('<span>').text('✕ Row ' + (first.row + 1) + ' · ' + label + ' — ' +
                             first.message + ' '),
            $('<a href="#" class="slsheet-jump">').text('Jump to cell')
        );

        if (errors.length > 1) {
            $bar.append($('<span>').text(' (+' + (errors.length - 1) + ' more)'));
        }
    }

    /** Focus the cell behind the first blocking error. */
    function jumpToFirstError() {
        const errors = blockingErrors();
        if (!errors.length || !state.ws) { return; }

        const first = errors[0];
        const x = (visibleKeys as any)().indexOf(first.field);

        if (x === -1) {
            // An inspector-only field: the column may be hidden, or it may be
            // an array field that has no editable cell at all.
            state.inspectorOpen = true;
            state.ui.$dialog.removeClass('is-inspector-collapsed');
            renderInspector(first.row);
            return;
        }

        if (typeof state.ws.updateSelectionFromCoords === 'function') {
            state.ws.updateSelectionFromCoords(x, first.row, x, first.row);
        }
        if (typeof state.ws.scrollTo === 'function') {
            state.ws.scrollTo(x, first.row);
        }
        renderInspector(first.row);
    }

    // ══════════════════════════════════════════════════════════════════
    //  COMMIT
    // ══════════════════════════════════════════════════════════════════

    /** Group the dirty cells into a per-row before/after summary. */
    function buildDiff() {
        const rows = new Set();
        state.dirty.forEach(function (_: any, k: any) { rows.add(Number(k.split(':')[0])); });

        const modified: any = [];
        const added: any = [];

        Array.from(rows).sort(function (a, b) { return (a as any) - (b as any); }).forEach(function (row) {
            const before = state.snapshot[(row as any)];
            const after = state.entries[(row as any)];
            if (!after) { return; }

            if (!before) {
                added.push({ row: row, title: after.title || '(untitled)' });
                return;
            }

            const fields: any = [];
            state.dirty.forEach(function (_: any, k: any) {
                const parts = k.split(':');
                if (Number(parts[0]) !== row) { return; }
                fields.push({
                    field: parts[1],
                    before: before[parts[1]],
                    after: after[parts[1]],
                });
            });

            if (fields.length) {
                modified.push({ row: row, title: after.title || '(untitled)', fields: fields });
            }
        });

        return { modified: modified, added: added, removed: state.removed };
    }

    function fmt(v: any) {
        if (v === null || v === undefined || v === '') { return '(empty)'; }
        if (Array.isArray(v)) { return v.length ? JSON.stringify(v) : '(empty)'; }
        return String(v);
    }

    function openCommitDialog() {
        if (!state) { return; }

        if (blockingErrors().length) {
            renderErrorBar();
            return;
        }

        const diff = buildDiff();
        const total = diff.modified.length + diff.added.length + diff.removed;

        // Null-edit guard. No write is issued at all when nothing changed, so
        // sort/normalisation is never applied to an untouched file and opening
        // a sheet cannot produce a diff.
        if (!total) { return; }

        const summary = '[SonglistSheet] Bulk edit: ' + diff.modified.length +
            ' modified, ' + diff.added.length + ' added, ' + diff.removed + ' removed';

        const $list = $('<div class="slsheet-diff">');

        diff.modified.forEach(function (m: any) {
            const $row = $('<div class="slsheet-diff-row">')
                .append($('<b>').text('Row ' + (m.row + 1) + ' — ' + m.title));
            m.fields.forEach(function (f: any) {
                const label = (Schema.BY_KEY[f.field] || {}).label || f.field;
                $row.append(
                    $('<div class="slsheet-diff-field">').append(
                        $('<span class="slsheet-diff-key">').text(label + ': '),
                        $('<del>').text(fmt(f.before)),
                        $('<span>').text(' → '),
                        $('<ins>').text(fmt(f.after))
                    )
                );
            });
            $list.append($row);
        });

        diff.added.forEach(function (a: any) {
            $list.append($('<div class="slsheet-diff-row slsheet-diff-add">')
                .text('+ Added: ' + a.title));
        });

        if (diff.removed) {
            $list.append($('<div class="slsheet-diff-row slsheet-diff-del">')
                .text('− Removed ' + diff.removed + ' row(s)'));
        }

        const $summaryInput = $('<input type="text" class="slsheet-summary">')
            .attr('aria-label', 'Edit summary')
            .val(summary);
        const $confirm = $('<button type="button" class="slsheet-btn slsheet-btn-commit">Commit</button>');
        const $cancel = $('<button type="button" class="slsheet-btn">Cancel</button>');

        const $sub = $('<div class="slsheet-subdialog" role="dialog" aria-modal="true">').append(
            $('<h3>').text('Commit ' + total + ' change' + (total > 1 ? 's' : '') +
                           ' to ' + state.jsonPage),
            $list,
            $('<label class="slsheet-ins-label">').text('Edit summary'),
            $summaryInput,
            $('<div class="slsheet-subfooter">').append($cancel, $confirm)
        );

        const $back = $('<div class="slsheet-subback">').append($sub);
        state.ui.$dialog.append($back);

        $cancel.on('click', function () { $back.remove(); });

        $confirm.on('click', function () {
            $confirm.prop('disabled', true).text('Committing…');
            $cancel.prop('disabled', true);

            doCommit($summaryInput.val()).then(function () {
                $back.remove();
                close(true);
            }).catch(function (err: any, result: any) {
                $confirm.prop('disabled', false).text('Commit');
                $cancel.prop('disabled', false);
                renderCommitError($sub, err, result);
            });
        });
    }

    function doCommit(summary: any) {
        const payload = Schema.normalizeForWrite(state.entries);
        return Api.writeJson(state.jsonPage, payload, summary, {
            basetimestamp: state.timestamp,
            starttimestamp: state.curtimestamp,
        }).then(function () {
            Api.toast('Committed changes to ' + state.jsonPage, 'success');
            state.onCommitted();
        });
    }

    /**
     * On conflict the sheet refuses and keeps every change intact. Merging is
     * deliberately not attempted -- a silent wrong merge is worse than an
     * explicit stop, and the editor is the one who can tell which is right.
     */
    function renderCommitError($sub: any, err: any, result: any) {
        $sub.find('.slsheet-commit-error').remove();

        const code = (typeof err === 'string') ? err : ((err && err.code) || '');
        let $msg;

        if (code === 'editconflict') {
            $msg = $('<div class="slsheet-commit-error">').append(
                $('<p>').text('Someone edited this page while you were working. ' +
                    'Your changes are still here, but committing now would overwrite theirs.'),
                $('<a target="_blank" rel="noopener">')
                    .attr('href', mw.util.getUrl(state.jsonPage, {
                        diff: 'cur', oldid: state.revid
                    }))
                    .text('View their changes'),
                $('<span>').text(' · '),
                $('<a href="#" class="slsheet-reload">')
                    .text('Reload sheet — discards your changes')
            );

            $msg.on('click', '.slsheet-reload', function (e) {
                e.preventDefault();
                const opts = {
                    jsonPage: state.jsonPage,
                    onCommitted: state.onCommitted,
                };
                close(true);
                open(opts);
            });
        } else {
            $msg = $('<div class="slsheet-commit-error">')
                .text(Api.apiErrorMessage(err, result, 'Commit failed'));
        }

        $sub.find('.slsheet-subfooter').before($msg);
    }

    // ══════════════════════════════════════════════════════════════════

    (window as any).SonglistSheet = {
        open: open,
        close: close,
        // Test/debug seams. Not part of the gadget contract.
        _state: function () { return state; },
        _pendingCount: pendingCount,
        _buildColumns: buildColumns,
        _markDirty: markDirty,
        _summarise: summarise,
        _inspectorFields: INSPECTOR_FIELDS,
        _siteIdField: SITE_ID_FIELD,
        _setState: function (s: any) { state = s; },
        _onBeforeChange: onBeforeChange,
        _onBeforePaste: onBeforePaste,
        _onCellChanged: onCellChanged,
        _onBeforeInsertRow: onBeforeInsertRow,
        _onInsertRow: onInsertRow,
        _onBeforeDeleteRow: onBeforeDeleteRow,
        _onDeleteRow: onDeleteRow,
        _renumberFrom: renumberFrom,
        _relocateRow: relocateRow,
        _sortedIndexFor: sortedIndexFor,
        _repositionAddedRow: repositionAddedRow,
        _refreshRowSummary: refreshRowSummary,
        _commitInspectorField: commitInspectorField,
        _guard: guard,
        _gridInSync: gridInSync,
        _clearSearch: clearSearch,
        _onShortcutKeydown: onShortcutKeydown,
        _exportCsv: exportCsv,
        _onEditionStart: onEditionStart,
        _buildShell: buildShell,
        _updateFooter: updateFooter,
        _buildDiff: buildDiff,
        _doCommit: doCommit,
        _openCommitDialog: openCommitDialog,
        _widenEnumSources: widenEnumSources,
        _visibleKeys: visibleKeys,
        _blockingErrors: blockingErrors,
        _moveWithinGroup: moveWithinGroup,
        _swapRows: swapRows,
        _rowToGrid: rowToGrid,
    };

})(jQuery, mediaWiki);

export {};
