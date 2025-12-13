// ====================
// Type Definitions
// ====================

interface DataTableSettings {
  responsive?: {
    details?: {
      display?: unknown;
      type?: string;
      renderer?: unknown;
      target?: string;
    };
  };
  autoWidth?: boolean;
  scrollX?: boolean;
  pageLength?: number;
  deferRender?: boolean;
  lengthChange?: boolean;
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
  columnDefs?: Array<{
    targets: number | number[];
    type?: string;
  }>;
  order?: Array<[number, string]>;
}

interface MediaWikiLoader {
  using(modules: string[]): Promise<void>;
  getScript(url: string): Promise<void>;
}

interface MediaWikiHook {
  add(callback: ($content: JQuery) => void): void;
}

interface MediaWiki {
  loader: MediaWikiLoader;
  hook(name: string): MediaWikiHook;
}

interface DataTableApi {
  data(): any[];
  responsive?: {
    recalc(): void;
  };
  destroy(): void;
}

interface DataTableStatic {
  Responsive: {
    display: {
      modal: (options: { header: (row: DataTableApi) => string }) => unknown;
    };
    renderer: {
      tableAll: () => unknown;
    };
  };
}

declare const DataTable: DataTableStatic;

interface JQuery {
  DataTable(options?: DataTableSettings): DataTableApi;
  closest(selector: string): JQuery;
  find(selector: string): JQuery;
  length: number;
  [index: number]: HTMLElement;
}

interface JQueryStatic {
  (selector: string | HTMLElement | Document | Window): JQuery;
  fn: {
    DataTable: {
      isDataTable(element: HTMLElement): boolean;
      Responsive?: unknown;
      SearchPanes?: unknown;
    };
    dataTable: {
      Responsive?: unknown;
      SearchPanes?: unknown;
      ext?: {
        type: {
          order: Record<string, (data: string) => number>;
        };
      };
    };
  };
}

interface MediaWikiLoader {
  using(modules: string[]): Promise<void>;
  getScript(url: string): Promise<void>;
}

interface MediaWikiHook {
  add(callback: ($content: JQuery) => void): void;
}

interface MediaWiki {
  loader: MediaWikiLoader;
  hook(name: string): MediaWikiHook;
}


// ====================
// Main Module
// ====================

(($: JQueryStatic, mw: MediaWiki): void => {
  'use strict';

  const DATATABLES_GADGET_URL = 'https://utaite.wiki/wiki/MediaWiki:Gadget-Mobile-Datatables.js?action=raw';
  
  let libLoaded = false;
  let libLoading = false;
  const tablesInitialized = new WeakSet<HTMLElement>();

  // --------------------------------------------------
  // Logic: Custom Sorting
  // --------------------------------------------------
  const registerCustomSorting = (): boolean => {
    if (!$.fn || !$.fn.dataTable || !$.fn.dataTable.ext) {
      return false;
    }

    $.fn.dataTable.ext.type.order['track-number-pre'] = (data: string): number => {
      // Remove HTML tags and trim
      const text = data.replace ? data.replace(/<.*?>/g, '').trim() : String(data).trim();
      
      // Match number and optional suffix (e.g., "1", "12-a", "1b")
      const match = text.match(/^(\d+)(?:-([a-z]+))?/i);

      if (!match) {
        return 0;
      }

      const number = parseInt(match[1], 10);
      const suffix = match[2] ? match[2].toLowerCase() : '';

      let suffixValue = 0;
      if (suffix) {
        for (let i = 0; i < suffix.length; i++) {
          suffixValue = suffixValue * 26 + (suffix.charCodeAt(i) - 96);
        }
      }

      return number * 1000 + suffixValue;
    };

    return true;
  };

  // --------------------------------------------------
  // Logic: Library Loading
  // --------------------------------------------------
  const ensureDataTablesLib = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if ($.fn && $.fn.DataTable && $.fn.dataTable && $.fn.dataTable.Responsive) {
        libLoaded = true;
        registerCustomSorting();
        return resolve();
      }

      // Check if currently loading
      if (libLoading) {
        const wait = setInterval(() => {
          if ($.fn && $.fn.DataTable && $.fn.dataTable && $.fn.dataTable.Responsive) {
            clearInterval(wait);
            libLoaded = true;
            registerCustomSorting();
            resolve();
          }
        }, 100);
        return;
      }

      // Start loading
      libLoading = true;
      mw.loader.getScript(DATATABLES_GADGET_URL)
        .then(() => {
          setTimeout(() => {
            libLoading = false;
            libLoaded = true;
            registerCustomSorting();
            resolve();
          }, 200);
        })
        .catch((err) => {
          libLoading = false;
          console.error('Failed to load DataTables gadget:', err);
          reject(err);
        });
    });
  };

  // --------------------------------------------------
  // Logic: UI Helpers (Overlay & Styles)
  // --------------------------------------------------
  const addLoadingOverlay = (table: HTMLElement): void => {
    if (table.parentElement?.classList.contains('datatable-lazy-wrapper')) {
      return; // Already has overlay
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'datatable-lazy-wrapper';
    wrapper.style.cssText = 'position: relative; min-height: 200px;';

    const overlay = document.createElement('div');
    overlay.className = 'datatable-lazy-overlay';
    overlay.style.cssText =
      'position: absolute; top: 0; left: 0; right: 0; bottom: 0; ' +
      'background: rgba(255, 255, 255, 0.8); display: flex; align-items: center; ' +
      'justify-content: center; z-index: 1000;';

    const spinner = document.createElement('div');
    spinner.style.cssText = 'text-align: center;';
    spinner.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin" style="font-size: 2em; color: #0645ad;"></i>' +
      '<div style="margin-top: 10px; font-size: 14px; color: #555;">Loading table...</div>';

    overlay.appendChild(spinner);

    if (table.parentNode) {
      table.parentNode.insertBefore(wrapper, table);
    }
    wrapper.appendChild(table);
    wrapper.appendChild(overlay);
  };

  const removeLoadingOverlay = (table: HTMLElement): void => {
    const wrapper = table.closest('.datatable-lazy-wrapper');
    if (wrapper) {
      const overlay = wrapper.querySelector('.datatable-lazy-overlay');
      if (overlay) {
        overlay.remove();
      }
    }
  };

  const addModalStyling = (): void => {
    if (!document.getElementById('datatables-modal-style')) {
      const style = document.createElement('style');
      style.id = 'datatables-modal-style';
      style.textContent =
        'div.dtr-modal div.dtr-modal-display { background-color: var(--theme-page-background-color) !important; }';
      document.head.appendChild(style);
    }
  };

  // --------------------------------------------------
  // Logic: Viewport Check
  // --------------------------------------------------
  const isMobileView = (): boolean => {
    return (
      document.body.classList.contains('mw-mf') ||
      document.body.classList.contains('is-mobile-device') ||
      window.innerWidth < 768
    );
  };

  // --------------------------------------------------
  // Logic: Table Initialization
  // --------------------------------------------------
  const initializeTable = (table: HTMLElement): void => {
    if (!libLoaded || !$.fn.DataTable || !$.fn.dataTable.Responsive) {
      console.warn('DataTables or Responsive not loaded');
      return;
    }

    if ($.fn.DataTable.isDataTable(table) || tablesInitialized.has(table)) {
      removeLoadingOverlay(table);
      return;
    }

    // Prepare table structure (thead/tbody fixes)
    let thead = table.querySelector('thead');
    if (!thead) {
      thead = document.createElement('thead');
      table.insertBefore(thead, table.firstChild);

      const headerRow = table.querySelector('tr.thead') || table.querySelector('tr');
      if (headerRow) {
        thead.appendChild(headerRow);
      }
    }

    let tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      const rows = Array.from(table.querySelectorAll('tr')).filter((row) => {
        return thead && !thead.contains(row);
      });
      rows.forEach((row) => {
        tbody!.appendChild(row);
      });
      table.appendChild(tbody);
    }

    if (!table.style.width || table.style.width.indexOf('100%') === -1) {
      table.style.width = '100%';
    }

    const isAlbumTrackTable = table.classList.contains('album-track-table');

    try {
      // Configuration
      const options: DataTableSettings = {
        responsive: {
          details: {
            display: DataTable.Responsive.display.modal({
              header: (row: DataTableApi) => {
                const data = row.data();
                // Special case for album-track-table
                if (isAlbumTrackTable) {
                  return 'Details for ' + (data[3] || '') + ' - ' + (data[1] || '');
                }
                return 'Details for ' + (data[0] || '') + ' ' + (data[1] || '');
              },
            }),
            type: 'inline',
            renderer: DataTable.Responsive.renderer.tableAll(),
            target: '',
          },
        },
        autoWidth: false,
        scrollX: false,
        pageLength: 10,
        deferRender: true,
        lengthChange: false,
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

      const isTracklistTable = table.closest('.tracklist') !== null;
      const columnDefs: Array<{ targets: number | number[]; type?: string }> = [];

      if (isTracklistTable) {
        columnDefs.push({
          targets: 0,
          type: 'track-number',
        });
      }

      if (columnDefs.length > 0) {
        options.columnDefs = columnDefs;
      }

      // Group column detection
      let groupColumnIndex = -1;
      if (isTracklistTable) {
        const headers = table.querySelectorAll('thead th');
        headers.forEach((header, i) => {
          if (header.textContent?.trim() === 'Group') {
            groupColumnIndex = i;
          }
        });
      }

      // Default order
      if (groupColumnIndex !== -1 && !table.getAttribute('data-order')) {
        options.order = [[groupColumnIndex, 'asc']];
      }

      // Custom page length
      const pageLength = table.getAttribute('data-page-length');
      if (pageLength) {
        options.pageLength = parseInt(pageLength, 10);
      }

      // Custom order via data attribute (JSON)
      const orderData = table.getAttribute('data-order');
      if (orderData) {
        try {
          const cleanOrder = orderData.replace(/&quot;/g, '"');
          options.order = JSON.parse(cleanOrder) as Array<[number, string]>;
        } catch (e) {
          console.warn('Failed to parse order:', e);
        }
      }

      // Disable SearchPanes if not available
      if (table.hasAttribute('data-search-panes') && !$.fn.dataTable.SearchPanes) {
        table.removeAttribute('data-search-panes');
      }

      const $table = $(table as unknown as HTMLElement) as unknown as JQuery;
      const dataTable = $table.DataTable(options);
      
      tablesInitialized.add(table);

      // Remove overlay and recalc
      removeLoadingOverlay(table);

      setTimeout(() => {
        try {
          if (dataTable.responsive) {
            dataTable.responsive.recalc();
          }
        } catch (e) {
          console.warn('Recalc error:', e);
        }
      }, 250);

    } catch (error) {
      console.error('Error initializing DataTable:', error);
      removeLoadingOverlay(table);
    }
  };

  // --------------------------------------------------
  // Logic: Lazy Loading
  // --------------------------------------------------
  const setupLazyLoading = (tables: HTMLElement[]): void => {
    if (!window.IntersectionObserver) {
      // Fallback
      tables.forEach((table) => {
        initializeTable(table);
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const table = entry.target as HTMLElement;
            observer.unobserve(table);
            ensureDataTablesLib().then(() => {
              initializeTable(table);
            });
          }
        });
      },
      {
        rootMargin: '50px',
        threshold: 0.01,
      }
    );

    tables.forEach((table) => {
      observer.observe(table);
    });
  };

  const initializeAllTables = (): void => {
    const tables = Array.from(
      document.querySelectorAll('table.dataTable, table.datatable')
    ) as HTMLElement[];

    if (tables.length === 0) {
      return;
    }

    ensureDataTablesLib()
      .then(() => {
        addModalStyling();

        // Init first table immediately
        if (tables[0]) {
          initializeTable(tables[0]);
        }

        // Overlay for others
        for (let i = 1; i < tables.length; i++) {
          addLoadingOverlay(tables[i]);
        }

        // Lazy load others
        if (tables.length > 1) {
          setupLazyLoading(tables.slice(1));
        }
      })
      .catch((err) => {
        console.error('Failed to load DataTables:', err);
      });
  };

  const init = (): void => {
    if (!isMobileView()) {
      return;
    }
    initializeAllTables();
  };

  // --------------------------------------------------
  // Execution
  // --------------------------------------------------
  mw.loader.using(['jquery']).then(() => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  });

  mw.hook('wikipage.content').add(($content: JQuery) => {
    if (!isMobileView()) {
      return;
    }

    ensureDataTablesLib().then(() => {
      addModalStyling();
      const contentEl = $content[0] as HTMLElement; // JQuery wrapper to Element
      if (!contentEl) return;

      const tables = Array.from(
        contentEl.querySelectorAll('table.dataTable, table.datatable')
      ) as HTMLElement[];

      if (tables.length === 0) {
        return;
      }

      // Init first table if not already
      if (tables[0] && !$.fn.DataTable.isDataTable(tables[0])) {
        initializeTable(tables[0]);
      }

      // Lazy load others
      if (tables.length > 1) {
        for (let i = 1; i < tables.length; i++) {
          if (!$.fn.DataTable.isDataTable(tables[i])) {
            addLoadingOverlay(tables[i]);
          }
        }
        setupLazyLoading(tables.slice(1));
      }
    });
  });

})(jQuery as unknown as JQueryStatic, mediaWiki as unknown as MediaWiki);