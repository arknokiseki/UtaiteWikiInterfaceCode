/**
 * DataTableJsonLoader
 * Loads JSON data from wiki pages and renders them as DataTables
 */

interface DataRow {
    ranking?: string | number;
    song_title?: string;
    utaite?: string;
    ufu?: string;
    video_id?: string;
    __ranking_sort?: number;
    __utaite_target?: string;
    __utaite_label?: string;
    [key: string]: unknown;
}

interface ColumnDefinition {
    title: string;
    data: string | null;
    render?: (data: unknown, type: string, row: DataRow) => string;
    orderable?: boolean;
    searchable?: boolean;
    className?: string;
}

interface DataTableOptions {
    data: DataRow[];
    columns: ColumnDefinition[];
    paging: boolean;
    searching: boolean;
    info: boolean;
    columnDefs?: Array<{ targets: number; type: string }>;
    language?: Record<string, string>;
}

interface ApiPageRevision {
    slots?: {
        main?: {
            content: string;
        };
    };
    '*'?: string;
}

interface ApiPage {
    revisions?: ApiPageRevision[];
}

interface ApiResponse {
    query?: {
        pages?: ApiPage[];
    };
}

interface JQueryDataTable {
    (options: DataTableOptions): void;
}

interface JQueryStatic {
    fn: {
        DataTable?: JQueryDataTable;
    };
}

declare const mw: {
    config: {
        get: (key: string) => string;
    };
    util: {
        getUrl: (title: string) => string;
        wikiScript: (type?: string) => string;
    };
    html: {
        escape: (text: string) => string;
    };
    loader: {
        using: (modules: string[]) => JQuery.Promise<void>;
    };
};

declare const DataTable: (new (el: HTMLElement, options: DataTableOptions) => void) | undefined;

declare global {
    interface Window {
        jQuery?: JQueryStatic & ((selector: HTMLElement) => { DataTable: JQueryDataTable });
    }
}

(function (): void {
    // --- CONFIG ---
    // NicoNico watch URL generator (adjust if you want a different domain)
    function nicovideoUrl(id: string | undefined): string {
        // Accept "sm12345" or "nm123" or raw ids; keep original if it looks like full URL
        if (!id) return '#';
        if (/^https?:\/\//i.test(id)) return id;
        return 'https://www.nicovideo.jp/watch/' + encodeURIComponent(id);
    }

    // Helper to safely read nested API response content
    function extractPageContent(apiJson: ApiResponse): string | null {
        try {
            const page = apiJson.query?.pages?.[0];
            if (!page) return null;
            if (page.revisions?.[0]?.slots?.main) {
                return page.revisions[0].slots.main.content;
            }
            // fallback for older format
            if (page.revisions?.[0]?.['*']) {
                return page.revisions[0]['*'];
            }
            return null;
        } catch (e) {
            console.error('extractPageContent error', e, apiJson);
            return null;
        }
    }

    // Normalize a row: ensure keys exist, apply ufu logic
    function normalizeRow(row: Record<string, unknown>): DataRow {
        const r: DataRow = Object.assign({}, row);

        // Normalize ranking to number when possible for sorting
        if (r.ranking !== undefined && r.ranking !== null) {
            const num = Number(('' + r.ranking).replace(/[^\d.-]/g, ''));
            if (!isNaN(num)) r.__ranking_sort = num;
            else r.__ranking_sort = 999999;
        } else {
            r.__ranking_sort = 999999;
        }

        // Utaite link target logic:
        // if ufu provided -> use that as page title; otherwise use utaite value as page title
        // label displayed is always r.utaite (if exists) or page title fallback
        r.__utaite_target = r.ufu ? String(r.ufu) : r.utaite ? String(r.utaite) : '';
        r.__utaite_label = r.utaite ? String(r.utaite) : r.__utaite_target;

        return r;
    }

    // Convert a page title to internal wiki url via mw.util.getUrl
    function wikiUrlFor(title: string | undefined): string {
        if (!title) return '#';
        try {
            return mw.util.getUrl(title);
        } catch (e) {
            // fallback encoding
            return mw.config.get('wgScript') + '?title=' + encodeURIComponent(title);
        }
    }

    // Main init: find tables with data-json attr
    function initTables(): void {
        const tables = document.querySelectorAll('table.dataTable[data-json]');
        if (!tables || tables.length === 0) return;

        tables.forEach(function (table): void {
            const tableEl = table as HTMLTableElement;
            const jsonPath = tableEl.getAttribute('data-json');
            if (!jsonPath) return;

            // Build API URL. will query the page at that title.
            // If jsonPath looks like URL (starts with http), use it directly (rare).
            const useDirectUrl = /^https?:\/\//i.test(jsonPath);

            if (useDirectUrl) {
                fetch(jsonPath)
                    .then(function (r): Promise<unknown[]> {
                        return r.json() as Promise<unknown[]>;
                    })
                    .then(function (json): void {
                        buildDataTableFromJson(tableEl, json as Record<string, unknown>[]);
                    })
                    .catch(function (e): void {
                        console.error('Failed to fetch JSON from direct URL', e);
                        tableEl.insertAdjacentHTML(
                            'afterend',
                            '<div class="error">Failed to load JSON.</div>'
                        );
                    });
                return;
            }

            // If it looks like a page path (e.g., Festival/.../data.json or JsonConfig:Page),
            // attempt to load via API by title.
            let pageTitle = jsonPath;
            // Replace leading and trailing whitespace
            pageTitle = pageTitle.trim();

            // Construct API url via mw.util.wikiScript('api')
            const apiUrl =
                mw.util.wikiScript('api') +
                '?action=query&format=json&formatversion=2&prop=revisions&titles=' +
                encodeURIComponent(pageTitle) +
                '&rvslots=main&rvprop=content';

            fetch(apiUrl)
                .then(function (r): Promise<ApiResponse> {
                    return r.json() as Promise<ApiResponse>;
                })
                .then(function (apiJson): void {
                    const content = extractPageContent(apiJson);
                    if (!content) {
                        console.error('No content found for', pageTitle, apiJson);
                        tableEl.insertAdjacentHTML(
                            'afterend',
                            '<div class="error">Failed to load JSON from page: ' +
                                mw.html.escape(pageTitle) +
                                '</div>'
                        );
                        return;
                    }
                    // Some editors may have accidentally wrapped JSON in <pre> or wikitext
                    let trimmed = content.trim();
                    // If the content looks like it contains a JSON block inside other wikitext
                    if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) {
                        const firstBracket = trimmed.indexOf('[');
                        const lastBracket = trimmed.lastIndexOf(']');
                        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                            trimmed = trimmed.substring(firstBracket, lastBracket + 1);
                        }
                    }

                    try {
                        const json = JSON.parse(trimmed) as Record<string, unknown>[];
                        buildDataTableFromJson(tableEl, json, pageTitle);
                    } catch (e) {
                        console.error('JSON parse error for', pageTitle, e);
                        tableEl.insertAdjacentHTML(
                            'afterend',
                            '<div class="error">JSON parse error for page: ' +
                                mw.html.escape(pageTitle) +
                                '</div>'
                        );
                    }
                })
                .catch(function (err): void {
                    console.error('API fetch error', err);
                    tableEl.insertAdjacentHTML(
                        'afterend',
                        '<div class="error">Failed to fetch JSON via API.</div>'
                    );
                });
        }); // end forEach
    }

    // Build DataTable from JSON array
    function buildDataTableFromJson(
        tableEl: HTMLTableElement,
        jsonArray: Record<string, unknown>[],
        jsonPageTitle?: string
    ): void {
        if (!Array.isArray(jsonArray)) {
            console.error('JSON is not an array', jsonArray);
            tableEl.insertAdjacentHTML(
                'afterend',
                '<div class="error">JSON does not contain an array of rows.</div>'
            );
            return;
        }
        if (jsonArray.length === 0) {
            tableEl.insertAdjacentHTML('afterend', '<div class="info">No rows found in JSON.</div>');
            return;
        }

        // Normalize rows
        const rows = jsonArray.map(normalizeRow);

        // Force column order to match header: Ranking, Song Title, Utaite, Video ID, Action
        const columns: ColumnDefinition[] = [
            {
                title: 'Ranking',
                data: '__ranking_sort',
                render: function (_data: unknown, _type: string, row: DataRow): string {
                    // show the original ranking visual (if present) for display
                    return row.ranking !== undefined ? String(row.ranking) : '';
                },
                className: 'dt-center'
            },
            {
                title: 'Song Title',
                data: 'song_title',
                render: function (data: unknown): string {
                    if (!data) return '';
                    return String(data);
                }
            },
            {
                title: 'Utaite',
                data: '__utaite_label',
                render: function (data: unknown, _type: string, row: DataRow): string {
                    const target = row.__utaite_target || '';
                    const label = data ? String(data) : target || '';
                    if (!target) return mw.html.escape(label);
                    const href = wikiUrlFor(target);
                    return '<a href="' + href + '">' + mw.html.escape(label) + '</a>';
                }
            },
            {
                title: 'Video ID',
                data: 'video_id',
                render: function (data: unknown): string {
                    if (!data) return '';
                    const url = nicovideoUrl(String(data));
                    return (
                        '<a href="' +
                        url +
                        '" target="_blank" rel="noopener noreferrer">' +
                        mw.html.escape(String(data)) +
                        '</a>'
                    );
                }
            },
            {
                title: 'Action',
                data: null,
                orderable: false,
                searchable: false,
                render: function (_data: unknown, _type: string, row: DataRow): string {
                    const parts: string[] = [];
                    // View on Nico
                    if (row.video_id) {
                        parts.push(
                            '<a class="" href="' +
                                nicovideoUrl(String(row.video_id)) +
                                '" target="_blank" rel="noopener noreferrer"><span data-nnd-id="' +
                                row.video_id +
                                '"><span class="niconico-icon nnd-link" style="width: 16px; height: 16px;"></span></span></a>'
                        );
                    }
                    // Edit JSON link (link to the JSON page if provided)
                    if (jsonPageTitle) {
                        parts.push(
                            '<a class="" href="' +
                                mw.util.getUrl(jsonPageTitle) +
                                '"><i class="fa-solid fa-pen-to-square"></i></a>'
                        );
                    }
                    // Optionally add a link to the utaite page
                    if (row.__utaite_target) {
                        parts.push(
                            '<a class="" href="' +
                                wikiUrlFor(row.__utaite_target) +
                                '"><i class="fa-regular fa-id-card"></i></a>'
                        );
                    }
                    return parts.join(' ');
                }
            }
        ];

        // Clear existing content inside table and create an empty table structure
        tableEl.innerHTML = '<thead></thead><tbody></tbody>';
        // Populate the thead from columns
        const thead = tableEl.querySelector('thead');
        if (!thead) return;

        const headerRow = document.createElement('tr');
        columns.forEach(function (col): void {
            const th = document.createElement('th');
            th.textContent = col.title;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // Use jQuery DataTables if available
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable) {
            window.jQuery(tableEl).DataTable({
                data: rows,
                columns: columns,
                paging: true,
                searching: true,
                info: false,
                columnDefs: [{ targets: 0, type: 'num' }]
            });
        } else if (typeof DataTable !== 'undefined') {
            // newer constructor-style DataTables
            new DataTable(tableEl, {
                data: rows,
                columns: columns,
                paging: true,
                searching: true,
                info: false
            });
        } else {
            // final fallback: render simple table rows (no interactivity)
            const tbody = tableEl.querySelector('tbody');
            if (!tbody) return;

            rows.forEach(function (row): void {
                const tr = document.createElement('tr');
                columns.forEach(function (col): void {
                    const td = document.createElement('td');
                    const val = col.data && row[col.data] !== undefined ? row[col.data] : '';
                    td.innerHTML = col.render
                        ? col.render(val, 'display', row)
                        : mw.html.escape(String(val));
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
        }
    }

    // bootstrap after mw loader
    mw.loader.using(['mediawiki.util']).then(function (): void {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initTables);
        } else {
            initTables();
        }
    });
})();