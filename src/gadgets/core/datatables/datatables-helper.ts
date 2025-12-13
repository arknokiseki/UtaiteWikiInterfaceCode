// ====================
// Type Definitions
// ====================

interface ViewportConfig {
  useMobileStyling: boolean;
  useScrollX: boolean;
  compactMode: boolean;
  pageLength: number;
}

interface ColumnDef {
  targets: number | number[];
  type?: string;
  responsivePriority?: number;
  visible?: boolean;
}

interface ColumnWidth {
  width: string;
}

interface ColumnWidthCalc {
  width: number | null;
}

interface DataTableOptions {
  responsive?: {
    details?: {
      type?: string;
      target?: string;
    };
  };
  autoWidth?: boolean;
  scrollX?: boolean;
  pageLength?: number;
  layout?: {
    topEnd?: string;
    bottomStart?: string;
    bottomEnd?: string;
  };
  language?: {
    info?: string;
    infoEmpty?: string;
    search?: string;
    paginate?: {
      first?: string;
      last?: string;
      next?: string;
      previous?: string;
    };
  };
  columns?: ColumnWidth[];
  columnDefs?: ColumnDef[];
  order?: Array<[number, string]>;
  search?: {
    search: string;
  };
}

interface DataTableColumnApi {
  visible(state?: boolean, redrawColumn?: boolean): boolean | DataTableColumnApi;
}

interface DataTableColumnsApi {
  every(callback: (this: DataTableColumnApi, index: number) => void): void;
  adjust(): DataTableApi;
}

interface DataTablePageApi {
  len(): number;
  len(length: number): DataTableApi;
}

interface DataTableApi {
  table(): {
    container(): HTMLElement;
  };
  columns(): DataTableColumnsApi;
  column(index: number): DataTableColumnApi;
  responsive?: {
    recalc(): void;
  };
  search(value?: string): DataTableApi;
  draw(paging?: boolean): DataTableApi;
  page: DataTablePageApi;
  destroy(): void;
}

interface DataTableSettings {
  // DataTables settings object
}

interface DataTableStatic {
  (options?: DataTableOptions): DataTableApi;
  isDataTable(element: HTMLElement | JQuery): boolean;
  Api: new (settings: DataTableSettings) => DataTableApi;
  ext: {
    type: {
      order: Record<string, (data: string) => number>;
    };
  };
}

interface JQueryStatic {
  fn: {
    DataTable?: DataTableStatic;
    dataTable?: {
      ext: {
        type: {
          order: Record<string, (data: string) => number>;
        };
      };
    };
  };
  trim(str: string): string;
}

interface JQuery<TElement = HTMLElement> {
  DataTable(options?: DataTableOptions): DataTableApi;
  data(key: string): unknown;
  data(key: string, value: unknown): JQuery<TElement>;
  attr(name: string): string | undefined;
  attr(name: string, value: string): JQuery<TElement>;
  attr(attributes: Record<string, string>): JQuery<TElement>;
  hasClass(className: string): boolean;
  addClass(className: string): JQuery<TElement>;
  removeClass(className: string): JQuery<TElement>;
  toggleClass(className: string, state: boolean): JQuery<TElement>;
  css(property: string): string;
  css(property: string, value: string): JQuery<TElement>;
  css(properties: Record<string, string>): JQuery<TElement>;
  find(selector: string): JQuery<TElement>;
  closest(selector: string): JQuery<TElement>;
  parent(): JQuery<TElement>;
  children(selector?: string): JQuery<TElement>;
  each(callback: (this: TElement, index: number, element: TElement) => void | false): JQuery<TElement>;
  map<T>(callback: (this: TElement, index: number, element: TElement) => T): JQuery<T>;
  get(): TElement[];
  get(index: number): TElement;
  first(): JQuery<TElement>;
  length: number;
  is(selector: string): boolean;
  text(): string;
  text(content: string): JQuery<TElement>;
  val(): string;
  val(value: string): JQuery<TElement>;
  prop(name: string): boolean;
  prop(name: string, value: boolean): JQuery<TElement>;
  on(events: string, handler: (event: Event, ...args: unknown[]) => void): JQuery<TElement>;
  on(events: string, selector: string, handler: (this: TElement, event: Event) => void): JQuery<TElement>;
  off(events: string): JQuery<TElement>;
  prependTo(target: JQuery<TElement> | string): JQuery<TElement>;
  appendTo(target: JQuery<TElement> | string): JQuery<TElement>;
  append(content: JQuery<TElement> | string): JQuery<TElement>;
  prepend(content: JQuery<TElement> | string): JQuery<TElement>;
  before(content: JQuery<TElement>): JQuery<TElement>;
  insertBefore(target: JQuery<TElement>): JQuery<TElement>;
  insertAfter(target: JQuery<TElement>): JQuery<TElement>;
  remove(): JQuery<TElement>;
  unwrap(): JQuery<TElement>;
  wrap(wrapper: string): JQuery<TElement>;
  not(selector: string | JQuery<TElement>): JQuery<TElement>;
}

interface JQueryPromise<T> {
  then<U>(onFulfill: (value: T) => U | JQueryPromise<U>, onReject?: (reason: unknown) => void): JQueryPromise<U>;
  catch(onReject: (reason: unknown) => void): JQueryPromise<T>;
}

interface MediaWikiLoader {
  using(modules: string | string[]): JQueryPromise<unknown>;
  getScript(url: string): JQueryPromise<void>;
}

interface MediaWikiHook {
  add(callback: ($content: JQuery) => void): void;
  fire(): void;
}

interface MediaWiki {
  loader: MediaWikiLoader;
  hook(name: string): MediaWikiHook;
}

declare global {
  interface Window {
    __dtLibLoaded?: boolean;
    __dtLibLoading?: boolean;
    __dtUrlSearchPopstateBound?: boolean;
    previousViewportConfig?: ViewportConfig;
  }
}

// Type alias for convenience
interface JQueryFactory extends JQueryStatic {
  (selector: string | HTMLElement | Document | Window): JQuery;
  (ready: () => void): JQuery;
}

// ====================
// Main Module
// ====================

(($: JQueryFactory, mw: MediaWiki): void => {
  'use strict';

  // Early return for mobile
  if (
    document.body.classList.contains('mw-mf') ||
    document.body.classList.contains('is-mobile-device')
  ) {
    return;
  }

  // Constants
  const MOBILE_BREAKPOINT = 1024;
  const URL_SEARCH_PARAM_KEY = 'searchName';
  const DATATABLES_GADGET_URL = 'https://utaite.wiki/wiki/MediaWiki:Gadget-Datatables.js?action=raw';

  // Configuration flags
  const DISABLE_REBUILD_ON_RESIZE = true;
  const INLINE_COLUMN_TOGGLES = true;

  // State
  let initialized = false;
  let queue: JQuery[] = [];
  const processedTables = new WeakMap<HTMLElement, boolean>();

  // Track DT lib loading
  window.__dtLibLoaded = !!($.fn && $.fn.DataTable);
  window.__dtLibLoading = false;

  // --------------------------
  // URL <-> Search helpers
  // --------------------------
  const getQueryParam = (name: string): string | null => {
    try {
      if (!name) return null;
      const search = window.location.search || '';
      if (!search) return null;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[?&])${escaped}=([^&]*)`, 'i');
      const match = regex.exec(search);
      return match ? decodeURIComponent(String(match[1]).replace(/\+/g, ' ')) : null;
    } catch {
      return null;
    }
  };

  const setQueryParam = (name: string, value: string): void => {
    try {
      if (!window.history || !window.history.replaceState) return;

      const loc = window.location;
      const search = loc.search;
      const hash = loc.hash;
      const pathname = loc.pathname;

      const parts = search ? search.substring(1).split('&') : [];
      const out: string[] = [];
      let found = false;

      parts.forEach((part) => {
        if (!part) return;
        const kv = part.split('=');
        const key = decodeURIComponent(kv[0] || '');
        if (key === name) {
          found = true;
          if (value && value.length) {
            out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
          }
        } else {
          out.push(kv.length > 1 ? `${kv[0]}=${kv[1]}` : kv[0]);
        }
      });

      if (!found && value && value.length) {
        out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
      }

      const newQuery = out.length ? `?${out.join('&')}` : '';
      history.replaceState(null, document.title, pathname + newQuery + (hash || ''));
    } catch {
      // noop
    }
  };

  const debounce = <T extends (...args: unknown[]) => void>(
    fn: T,
    wait: number
  ): ((...args: Parameters<T>) => void) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    return function (this: unknown, ...args: Parameters<T>): void {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  const bindGlobalSearchToUrl = (
    $table: JQuery,
    dataTable: DataTableApi | null,
    paramName?: string
  ): void => {
    const key = paramName || URL_SEARCH_PARAM_KEY;

    try {
      $table.data('dt-url-param-key', key);
    } catch {
      // noop
    }

    let $container: JQuery;
    try {
      $container =
        dataTable && dataTable.table
          ? $(dataTable.table().container())
          : $table.closest('.dt-container');
    } catch {
      $container = $table.closest('.dt-container');
    }

    const $input = $container.find('input.dt-input[type=search]');
    const term = getQueryParam(key);

    if ($input.length && typeof term === 'string') {
      $input.val(term);
    }

    if ($input.length) {
      $input.off('.urlsearch');
      $input.on(
        'input.urlsearch change.urlsearch',
        debounce(function (this: HTMLInputElement): void {
          setQueryParam(key, this.value || '');
        }, 200)
      );
    }

    $table.off('search.urlsearch');
    $table.on('search.dt.urlsearch', (_e: Event, settings: DataTableSettings) => {
      try {
        const api = new $.fn.DataTable!.Api(settings);
        const searchValue = api.search() as unknown as string;
        setQueryParam(key, searchValue || '');
      } catch {
        // noop
      }
    });

    if (!window.__dtUrlSearchPopstateBound) {
      window.__dtUrlSearchPopstateBound = true;
      $(window as unknown as HTMLElement).on('popstate.urlsearch', () => {
        $('.dataTable-processed, .datatable-loaded').each(function (this: HTMLElement) {
          try {
            if ($.fn.DataTable && $.fn.DataTable.isDataTable(this)) {
              const $tbl = $(this);
              const api = $tbl.DataTable();
              const k =
                ($tbl.data('search-param') as string) ||
                ($tbl.data('dt-url-param-key') as string) ||
                URL_SEARCH_PARAM_KEY;
              const val = getQueryParam(k) || '';

              const currentSearch = api.search() as unknown as string;
              if (currentSearch !== val) {
                api.search(val).draw(false);
              }
              $(api.table().container()).find('input.dt-input[type=search]').val(val);
            }
          } catch {
            // noop
          }
        });
      });
    }
  };

  // --------------------------
  // Viewport config
  // --------------------------
  const getViewportOptimizedConfig = (): ViewportConfig => {
    const width = window.innerWidth;

    if (width <= MOBILE_BREAKPOINT) {
      return {
        useMobileStyling: true,
        useScrollX: false,
        compactMode: true,
        pageLength: 10,
      };
    }

    if (width <= 1600) {
      return {
        useMobileStyling: false,
        useScrollX: false,
        compactMode: false,
        pageLength: 50,
      };
    }

    return {
      useMobileStyling: false,
      useScrollX: false,
      compactMode: false,
      pageLength: 100,
    };
  };

  // --------------------------
  // Table preparation helpers
  // --------------------------
  const prepareTable = ($table: JQuery): boolean => {
    try {
      if (!$table.find('thead').length) {
        const $tableHeader = $('<thead>').prependTo($table);
        const $headerRow = $table.find('tr.thead').length
          ? $table.find('tr.thead')
          : $table.find('tr').first();
        $headerRow.appendTo($tableHeader);
      }

      if (!$table.find('tbody').length) {
        const $tableBody = $('<tbody>');
        const $rows = $table.find('tr').not($table.find('thead tr'));
        $rows.appendTo($tableBody);
        $table.append($tableBody);
      }

      const style = $table.attr('style');
      if (!style || !style.includes('width')) {
        $table.css('width', '100%');
      }

      return true;
    } catch (error) {
      console.error('Error preparing table structure:', error);
      return false;
    }
  };

  const getColumnDefs = ($table: JQuery): ColumnDef[] => {
    const columnDefs: ColumnDef[] = [];

    $table.find('thead th').each(function (this: HTMLElement, index: number) {
      const $th = $(this);
      const def: ColumnDef = { targets: index };

      // Type inference
      if ($th.hasClass('dt-type-numeric')) {
        def.type = 'numeric';
      } else if ($th.hasClass('dt-type-date')) {
        def.type = 'date';
      }

      // Responsive priority via data attribute
      const prioAttr = $th.attr('data-responsive-priority');
      if (prioAttr && !isNaN(parseInt(prioAttr, 10))) {
        def.responsivePriority = parseInt(prioAttr, 10);
      }

      // Start hidden if header has .dt-start-hidden
      if ($th.hasClass('dt-start-hidden')) {
        def.visible = false;
      }

      // Add only if we set something
      if (def.type || def.responsivePriority !== undefined || def.visible !== undefined) {
        columnDefs.push(def);
      }
    });

    return columnDefs;
  };

  const calculateColumnWidths = ($table: JQuery): ColumnWidth[] => {
    const $headers = $table.find('thead th');
    const columns = $headers.length;
    if (!columns) return [];

    let definedWidthSum = 0;
    let undefinedColumnsCount = 0;

    let columnWidths: ColumnWidthCalc[] = $headers
      .map(function (this: HTMLElement): ColumnWidthCalc {
        const $th = $(this);
        const style = $th.attr('style');
        const attrWidth = $th.attr('width');
        let width: number | null = null;

        if (style && style.includes('width')) {
          const styleWidthMatch = style.match(/width\s*:\s*([0-9]+)%/);
          if (styleWidthMatch && styleWidthMatch[1]) {
            width = parseInt(styleWidthMatch[1], 10);
          }
        }

        if (width === null && attrWidth && attrWidth.trim().endsWith('%')) {
          width = parseInt(attrWidth, 10);
        }

        if (width !== null) {
          definedWidthSum += width;
        } else {
          undefinedColumnsCount++;
        }

        return { width };
      })
      .get();

    if (undefinedColumnsCount > 0) {
      const remainingWidth = 100 - definedWidthSum;
      const widthPerColumn = Math.floor(remainingWidth / undefinedColumnsCount);
      let extraWidth = remainingWidth - widthPerColumn * undefinedColumnsCount;

      columnWidths = columnWidths.map((col) => {
        if (col.width === null) {
          const assignedWidth = widthPerColumn + (extraWidth > 0 ? 1 : 0);
          extraWidth--;
          return { width: assignedWidth };
        }
        return col;
      });
    } else if (definedWidthSum === 0 && columns > 0) {
      const standardColWidth = Math.floor(100 / columns);
      const extraWidthStd = 100 - standardColWidth * columns;
      columnWidths = columnWidths.map((_col, i) => ({
        width: standardColWidth + (i === columns - 1 ? extraWidthStd : 0),
      }));
    }

    const totalWidth = columnWidths.reduce((sum, col) => sum + (col.width || 0), 0);

    if (totalWidth !== 100 && columnWidths.length > 0) {
      const lastWidth = columnWidths[columnWidths.length - 1].width || 0;
      columnWidths[columnWidths.length - 1].width = lastWidth + (100 - totalWidth);
    }

    return columnWidths.map((col) => ({ width: `${col.width}%` }));
  };

  // --------------------------
  // Mobile stacked layout
  // --------------------------
  const styleMobileTable = ($table: JQuery): void => {
    prepareTable($table);

    // Destroy any DataTable instance
    try {
      if ($.fn.DataTable && $.fn.DataTable.isDataTable($table.get(0))) {
        $table.DataTable().destroy();
      }
    } catch {
      // noop
    }

    // Remove processed flags
    $table.removeClass('dataTable-processed datatable-loaded');
    processedTables.delete($table.get(0));

    // Unwrap from DT container if needed
    const $dtCont = $table.closest('.dt-container');
    if ($dtCont.length) {
      $dtCont.before($table);
      $dtCont.remove();
    }

    if ($table.parent().hasClass('table-responsive')) {
      $table.unwrap();
    }

    // Map header texts to data-label on each cell
    const headers: string[] = [];
    $table.find('thead th').each(function (this: HTMLElement, i: number) {
      headers[i] = $(this).text().trim();
    });

    $table.find('tbody tr').each(function (this: HTMLElement) {
      $(this)
        .children('td')
        .each(function (this: HTMLElement, i: number) {
          $(this).attr('data-label', headers[i] || '');
        });
    });

    // Apply stacked table class
    $table.addClass('mobile-styled-table').css('width', '100%');
    processedTables.set($table.get(0), true);

    console.log(`Applied stacked mobile styling to table: ${$table.attr('id') || '(no ID)'}`);
  };

  // --------------------------
  // Overflow fixes for DT
  // --------------------------
  const fixOverflowIssues = ($table: JQuery, dataTable: DataTableApi): void => {
    const $overflowWrapper = $table.closest('.citizen-overflow-wrapper');

    if ($overflowWrapper.length) {
      $overflowWrapper.css({
        overflow: 'visible',
        position: 'relative',
      });

      const $dtWrapper = $table.closest('.dt-container');
      if ($dtWrapper.length) {
        $dtWrapper.css({
          overflow: 'visible',
          position: 'relative',
        });
      }
    }

    setTimeout(() => {
      if (dataTable && dataTable.responsive && dataTable.responsive.recalc) {
        dataTable.responsive.recalc();
      }

      const $container = $table.closest('.dt-container');
      if ($container.length) {
        $container.css({
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
        });
      }
    }, 250);

    if (!$('#datatables-overflow-fix').length) {
      const styleContent = `
        .citizen-overflow-wrapper .dt-container { overflow: visible !important; }
        .citizen-overflow-wrapper .dt-container::before,
        .citizen-overflow-wrapper .dt-container::after { display: none !important; }
        .citizen-overflow-wrapper .dataTable { border-collapse: collapse; }
        .citizen-overflow-wrapper .dt-layout-table { overflow: visible !important; }
        .citizen-overflow-wrapper table.dataTable { border-spacing: 0; border-collapse: collapse; }
        .citizen-overflow-wrapper .citizen-overflow-nav { z-index: 10; position: relative; }
      `;
      $('<style id="datatables-overflow-fix">')
        .text(styleContent)
        .appendTo('head');
    }
  };

  // --------------------------
  // Inline Column Visibility
  // --------------------------
  const renderInlineColumnToggles = ($table: JQuery, dataTable: DataTableApi): void => {
    try {
      const $container = $(dataTable.table().container());

      // Remove existing UI to prevent duplicates
      $container.find('.dt-colvis-row, .dt-colvis-inline').remove();

      // Inject minimal CSS once
      if (!document.getElementById('dt-colvis-inline-styles')) {
        const styleContent = `
          .dt-colvis-inline{display:flex;flex-wrap:wrap;gap:.25rem .75rem;align-items:center;margin:0}
          .dt-colvis-inline .col-toggle{display:inline-flex;align-items:center;gap:.35rem;font-size:.875rem;white-space:nowrap}
          .dt-colvis-inline .dt-colvis-title{font-weight:600;margin-right:.5rem}
          .dt-colvis-inline .dt-colvis-reset{margin-left:.5rem;cursor:pointer;text-decoration:underline;font-size:.85em;color:inherit;opacity:.8}
          .dt-colvis-inline input[type=checkbox]{margin:0}
          .dt-colvis-row{margin-top:.35rem;width:100%}
          .dt-colvis-row .dt-layout-cell{flex:1 1 100%}
        `;
        $('<style id="dt-colvis-inline-styles">')
          .text(styleContent)
          .appendTo('head');
      }

      const $wrapper = $(
        '<div class="dt-colvis-inline" role="group" aria-label="Column visibility"></div>'
      );
      const $headers = $table.find('thead th');
      const initialVis: boolean[] = [];

      dataTable.columns().every(function (this: DataTableColumnApi, idx: number) {
        const $th = $($headers.get(idx));
        if ($th.hasClass('noVis')) return;

        initialVis[idx] = this.visible() as boolean;
        const title = $th.text().trim() || `Column ${idx + 1}`;
        const id = `${$table.attr('id') || 'dt'}-colvis-${idx}`;

        const $checkbox = $('<input type="checkbox" />')
          .attr('id', id)
          .attr('data-col-index', String(idx))
          .prop('checked', initialVis[idx]);

        const $label = $('<label class="col-toggle" />')
          .append($checkbox)
          .append($('<span/>').text(title));

        $wrapper.append($label);
      });

      // Reset link
      const $reset = $('<a class="dt-colvis-reset" href="javascript:void(0)">Reset</a>').on(
        'click',
        () => {
          dataTable.columns().every(function (this: DataTableColumnApi, i: number) {
            const $th = $($headers.get(i));
            if ($th.hasClass('noVis')) return;
            this.visible(initialVis[i], false);
          });
          dataTable.columns().adjust().draw(false);

          if (dataTable.responsive && dataTable.responsive.recalc) {
            dataTable.responsive.recalc();
          }
        }
      );

      $wrapper.prepend('<span class="dt-colvis-title">Columns:</span>');
      $wrapper.append($reset);

      // Insert UI below top controls
      const $tableLayout = $container.find('.dt-layout-table');
      const $row = $('<div class="dt-layout-row dt-colvis-row"></div>');
      const $cell = $('<div class="dt-layout-cell dt-layout-start dt-colvis-cell"></div>').appendTo(
        $row
      );
      $cell.append($wrapper);

      if ($tableLayout.length) {
        $row.insertBefore($tableLayout);
      } else {
        const $firstRow = $container.find('.dt-layout-row').first();
        if ($firstRow.length) {
          $row.insertAfter($firstRow);
        } else {
          $container.append($row);
        }
      }

      // Handle checkbox changes
      $row.on('change', 'input[type=checkbox][data-col-index]', function (this: HTMLElement) {
        const input = this as HTMLInputElement;
        const colIdx = parseInt(input.getAttribute('data-col-index') || '0', 10);
        
        dataTable.column(colIdx).visible(input.checked, false);
        dataTable.columns().adjust().draw(false);

        if (dataTable.responsive && dataTable.responsive.recalc) {
          dataTable.responsive.recalc();
        }
      });

      // Keep checkboxes in sync
      $table.off('.colvisInline');
      $table.on(
        'column-visibility.dt.colvisInline',
        (_e: Event, _settings: DataTableSettings, columnIdx: number, state: boolean) => {
          $row.find(`input[data-col-index="${columnIdx}"]`).prop('checked', !!state);
        }
      );
    } catch (e) {
      console.warn('Inline ColVis failed:', e);
    }
  };

  // --------------------------
  // Adjust tables utility
  // --------------------------
  const adjustDataTable = (tableElement: HTMLElement, config: ViewportConfig | null = null): void => {
    try {
      if (!$.fn.DataTable || !$.fn.DataTable.isDataTable(tableElement)) return;

      const dt = $(tableElement).DataTable();
      dt.columns().adjust();

      if (dt.responsive && dt.responsive.recalc) {
        dt.responsive.recalc();
      }

      if (config) {
        const currentLen = dt.page.len();
        if (Math.abs(currentLen - config.pageLength) > 5) {
          dt.page.len(config.pageLength).draw(false);
        }
      }

      const $table = $(tableElement);
      if ($table.closest('.citizen-overflow-wrapper').length) {
        fixOverflowIssues($table, dt);
      }
    } catch {
      // noop
    }
  };

  // --------------------------
  // Initialize a single table
  // --------------------------
  const processTable = ($table: JQuery): void => {
    if (processedTables.has($table.get(0))) return;

    const viewportConfig = getViewportOptimizedConfig();
    const wantsStackedMobile =
      viewportConfig.useMobileStyling &&
      ($table.is('[data-mobile-stacked]') || $table.is('[data-mobile-stacked="true"]'));

    if (wantsStackedMobile) {
      styleMobileTable($table);
      return;
    }

    try {
      if (!$.fn || !$.fn.DataTable) {
        console.warn('DataTables library not loaded yet; skipping initialization:', $table.get(0));
        return;
      }

      if ($.fn.DataTable.isDataTable($table.get(0))) {
        $table.DataTable().destroy();
      }

      processedTables.set($table.get(0), true);
      if (!prepareTable($table)) return;

      // Build options
      const options: DataTableOptions = {
        responsive: {
          details: {
            type: 'inline',
            target: 'tr',
          },
        },
        autoWidth: true,
        scrollX: false,
        pageLength: viewportConfig.pageLength,
        layout: {
          topEnd: 'search',
          bottomStart: 'info',
          bottomEnd: 'paging',
        },
        language: {
          info: 'Showing _START_ to _END_ of _TOTAL_ entries',
          infoEmpty: 'Showing 0 to 0 of 0 entries',
          search: 'Search:',
          paginate: {
            first: 'First',
            last: 'Last',
            next: 'Next',
            previous: 'Previous',
          },
        },
      };

      // Fixed widths opt-in
      const wantsFixedWidths =
        $table.is('[data-fixed-widths]') || $table.is('[data-fixed-widths="true"]');
      if (wantsFixedWidths) {
        options.autoWidth = false;
        options.columns = calculateColumnWidths($table);
      }

      // Data attributes
      const pageLength = $table.data('page-length') as number | undefined;
      if (pageLength) {
        options.pageLength = parseInt(String(pageLength), 10);
      }

      const dataOrder = $table.data('order') as Array<[number, string]> | undefined;
      if (dataOrder) {
        options.order = dataOrder;
      }

      // Column definitions
      const isAlbumTrackTable = $table.hasClass('album-track-table');
      const columnDefs = getColumnDefs($table);

      if (columnDefs.length > 0) {
        options.columnDefs = columnDefs;

        if (isAlbumTrackTable) {
          const hasCol0Type = columnDefs.some(
            (def) =>
              (Array.isArray(def.targets) && def.targets.includes(0)) || def.targets === 0
          );

          if (!hasCol0Type) {
            options.columnDefs.push({
              targets: 0,
              type: 'track-number',
            });
          }
        }
      } else {
        const defaultDef: ColumnDef = {
          targets: 0,
          responsivePriority: 1,
        };
        if (isAlbumTrackTable) {
          defaultDef.type = 'track-number';
        }

        options.columnDefs = [
          defaultDef,
          {
            targets: -1,
            responsivePriority: 2,
          },
        ];
      }

      // Initial search from URL
      const paramKey = ($table.data('search-param') as string) || URL_SEARCH_PARAM_KEY;
      const initialTerm = getQueryParam(paramKey);
      if (typeof initialTerm === 'string' && initialTerm.length) {
        options.search = { search: initialTerm };
      }

      // Tracklist table handling
      const isTracklistTable = $table.closest('.tracklist').length > 0;
      let groupColumnIndex = -1;

      if (isTracklistTable) {
        $table.find('thead th').each(function (this: HTMLElement, index: number) {
          if ($(this).text().trim() === 'Group') {
            groupColumnIndex = index;
            return false;
          }
        });
      }

      if (groupColumnIndex !== -1 && !$table.data('order')) {
        options.order = [[groupColumnIndex, 'asc']];
      }

      // User-specified order takes precedence
      const userOrder = $table.data('order');
      if (userOrder) {
        options.order = userOrder as Array<[number, string]>;
      }

      const dataTable = $table.DataTable(options);

      // Inline column toggles
      if (INLINE_COLUMN_TOGGLES) {
        renderInlineColumnToggles($table, dataTable);
      }

      bindGlobalSearchToUrl($table, dataTable, paramKey);
      fixOverflowIssues($table, dataTable);

      // Final adjustments
      setTimeout(() => {
        try {
          dataTable.columns().adjust().draw(false);
          if (dataTable.responsive && dataTable.responsive.recalc) {
            dataTable.responsive.recalc();
          }

          if (wantsFixedWidths && options.columns) {
            $table.find('colgroup col').each(function (this: HTMLElement, i: number) {
              if (options.columns![i]) {
                $(this).css('width', options.columns![i].width);
              }
            });
          }
        } catch {
          // noop
        }
      }, 100);

      console.log(
        `DataTable (responsive + inline colvis) initialized for: ${$table.attr('id') || '(no ID)'}`
      );
    } catch (error) {
      console.error('Error initializing DataTable:', error);
      processedTables.delete($table.get(0));
    }
  };

  // --------------------------
  // Process all target tables
  // --------------------------
  const process = ($content: JQuery): void => {
    const selector =
      'table.dataTable:not(.dataTable-processed), table.datatable:not(.datatable-loaded)';
    $content.find(selector).each(function (this: HTMLElement) {
      $(this).addClass('dataTable-processed datatable-loaded');
      processTable($(this));
    });
  };

  // --------------------------
  // Cleanup
  // --------------------------
  const cleanup = ($content: JQuery): void => {
    $content
      .find('table.dataTable, table.datatable, table.mobile-styled-table')
      .each(function (this: HTMLElement) {
        try {
          $(this).off('.urlsearch .colvisInline');
          const $c = $(this).closest('.dt-container');
          if ($c.length) {
            $c.find('input.dt-input[type=search]').off('.urlsearch');
          }

          if ($.fn.DataTable && $.fn.DataTable.isDataTable(this)) {
            $(this).DataTable().destroy();
          }
        } catch (e) {
          console.warn('Cleanup error:', e);
        }

        $(this).removeClass('dataTable-processed datatable-loaded mobile-styled-table');
        if ($(this).parent().hasClass('table-responsive')) {
          $(this).unwrap();
        }
        processedTables.delete(this);
      });
  };

  // --------------------------
  // Cleanup single table utility
  // --------------------------
  const cleanupTable = (tableElement: HTMLElement, shouldUnwrapDtContainer = false): void => {
    try {
      $(tableElement).off('.urlsearch .colvisInline');
      const $c = $(tableElement).closest('.dt-container');
      if ($c.length) {
        $c.find('input.dt-input[type=search]').off('.urlsearch');
      }

      if ($.fn.DataTable && $.fn.DataTable.isDataTable(tableElement)) {
        $(tableElement).DataTable().destroy();
      }
    } catch {
      // noop
    }

    $(tableElement).removeClass('dataTable-processed datatable-loaded mobile-styled-table');
    processedTables.delete(tableElement);

    if ($(tableElement).parent().hasClass('table-responsive')) {
      $(tableElement).unwrap();
    }

    if (shouldUnwrapDtContainer) {
      const $dtCont = $(tableElement).closest('.dt-container');
      if ($dtCont.length) {
        $dtCont.before($(tableElement));
        $dtCont.remove();
      }
    }
  };

  // --------------------------
  // Ensure DataTables library is loaded
  // --------------------------
  const ensureDataTablesLib = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if ($.fn && $.fn.DataTable) {
        window.__dtLibLoaded = true;
        return resolve();
      }

      if (window.__dtLibLoading) {
        const waitInterval = setInterval(() => {
          if ($.fn && $.fn.DataTable) {
            clearInterval(waitInterval);
            window.__dtLibLoaded = true;
            resolve();
          }
        }, 100);
        return;
      }

      window.__dtLibLoading = true;
      mw.loader
        .getScript(DATATABLES_GADGET_URL)
        .then(() => {
          window.__dtLibLoading = false;
          window.__dtLibLoaded = true;
          resolve();
        })
        .catch((err: unknown) => {
          window.__dtLibLoading = false;
          console.error('Failed to load DataTables gadget:', err);
          reject(err);
        });
    });

  // --------------------------
  // Register custom sorting type
  // --------------------------
  const registerTrackNumberSort = (): void => {
    if (!$.fn || !$.fn.DataTable || !$.fn.dataTable?.ext) return;

    $.fn.dataTable.ext.type.order['track-number-pre'] = (data: string): number => {
      const cleaned = data.replace(/<.*?>/g, '').trim();
      const matches = cleaned.match(/^(\d+)(.*)$/);

      if (matches) {
        const num = parseInt(matches[1], 10);
        const suffix = matches[2].trim().toLowerCase();
        let suffixValue = 0;

        if (suffix) {
          const firstChar = suffix.charAt(0);
          if (firstChar >= 'a' && firstChar <= 'z') {
            suffixValue = firstChar.charCodeAt(0) - 96;
          } else if (suffix.startsWith('-')) {
            const nextChar = suffix.charAt(1);
            if (nextChar >= 'a' && nextChar <= 'z') {
              suffixValue = nextChar.charCodeAt(0) - 96;
            }
          }
        }

        return num * 1000 + suffixValue;
      }

      return 999999;
    };

    console.log('Track number sorting registered');
  };

  // --------------------------
  // Tab switch handler
  // --------------------------
  const handleTabSwitch = (): void => {
    setTimeout(() => {
      $('.dataTable-processed').each(function (this: HTMLElement) {
        adjustDataTable(this);
      });
    }, 150);
  };

  // --------------------------
  // Resize handler
  // --------------------------
  const handleResize = debounce((): void => {
    const currentConfig = getViewportOptimizedConfig();
    const shouldUseMobile = currentConfig.useMobileStyling;

    window.previousViewportConfig = window.previousViewportConfig || ({} as ViewportConfig);
    const previousViewportConfig = window.previousViewportConfig;

    const configChanged =
      previousViewportConfig.useMobileStyling !== currentConfig.useMobileStyling ||
      previousViewportConfig.useScrollX !== currentConfig.useScrollX ||
      previousViewportConfig.compactMode !== currentConfig.compactMode;

    $('body').toggleClass('is-mobile-device', shouldUseMobile);

    if (configChanged) {
      if (DISABLE_REBUILD_ON_RESIZE) {
        // Only adjust; do not destroy/rebuild
        $('.dataTable-processed, .datatable-loaded').each(function (this: HTMLElement) {
          adjustDataTable(this, currentConfig);
        });
        window.previousViewportConfig = currentConfig;
      } else {
        // Full rebuild logic
        console.log('Viewport configuration changed, reinitializing tables.', currentConfig);

        $('.dataTable-processed, .datatable-loaded, .mobile-styled-table').each(function (
          this: HTMLElement
        ) {
          const requiresStacked =
            shouldUseMobile &&
            ($(this).is('[data-mobile-stacked]') || $(this).is('[data-mobile-stacked="true"]'));
          cleanupTable(this, requiresStacked);
        });

        window.previousViewportConfig = currentConfig;

        ensureDataTablesLib()
          .then(() => process($(document)))
          .catch(() => process($(document)));
      }
    } else {
      // Minor resize adjustments
      $('.dataTable-processed, .datatable-loaded').each(function (this: HTMLElement) {
        adjustDataTable(this, currentConfig);
      });
    }
  }, 300);

  // --------------------------
  // Event listeners
  // --------------------------
  $(document as unknown as HTMLElement).on('click', '.tabber__tab', handleTabSwitch);
  $(window as unknown as HTMLElement).on('resize', handleResize);

  // --------------------------
  // Initial boot
  // --------------------------
  const finishInit = (): void => {
    registerTrackNumberSort();
    initialized = true;

    // Process queued content
    queue.forEach(($content) => {
      process($content);
    });

    queue = [];
    mw.hook('datatables.loaded').fire();
    console.log('DataTables Helper initialization complete.');
  };

  const initialize = (): void => {
    ensureDataTablesLib().then(
      () => {
        finishInit();
      },
      () => {
        finishInit();
      }
    );
  };

  mw.loader.using(['jquery']).then(initialize);

  // --------------------------
  // MediaWiki Hooks
  // --------------------------
  mw.hook('wikipage.content').add(($c: JQuery) => {
    if (initialized) {
      process($c);
    } else {
      queue.push($c);
    }
  });

  mw.hook('wikipage.editform').add(cleanup);
})(jQuery as unknown as JQueryFactory, mediaWiki as unknown as MediaWiki);
