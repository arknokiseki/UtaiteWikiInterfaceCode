declare const mw: any;
declare const $: any;
declare const require: any; 

interface MwApiPostSettings {
  action: string;
  formatversion?: number;
  titles?: string;
  [key: string]: any;
}

(function () {
  // ===================================================================
  // Bottom Toolbar
  // ===================================================================

  // 1. Guard Clauses
  if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
    return;
  }
  
  if (mw.config.get('wgAction') !== 'view' || $('#bottom-toolbar').length) {
    return;
  }

  const mobileQuery: MediaQueryList = window.matchMedia('(max-width: 767px)');
  if (mobileQuery.matches) {
    return;
  }

  // --- 2. Get Page-Specific Info ---
  const pageName: string = mw.config.get('wgPageName');
  const server: string = mw.config.get('wgServer');
  const api = new mw.Api();

  // --- 3. Create the HTML Structure ---
  const toolbarHTML = `
    <div id="bottom-toolbar">
      <ul class="tools">
        <li id="toolbar-watch"></li>
        <li class="tools-dropdown">
          <a href="#">My Tools</a>
          <div class="dropdown-content">
            <ul>
              <li><a id="toolbar-history" href="${server}/wiki/${pageName}?action=history">Page History</a></li>
              <li><a id="toolbar-whatlinkshere" href="${server}/wiki/Special:WhatLinksHere/${pageName}">What Links Here</a></li>
              <li><a id="toolbar-docs" href="#">Documentation Browser</a></li>
            </ul>
          </div>
        </li>
        <li id="displayTimer">
          <a href="${server}/wiki/${pageName}?action=purge" title="Purge the page cache"></a>
        </li>
      </ul>
    </div>`;

  // --- 4. Add the Toolbar & Initialize Watchstar ---
  $('body').append(toolbarHTML);
  const $watchLinkOriginal = $('#ca-watch a, #ca-unwatch a');

  if ($watchLinkOriginal.length) {
    const $clonedLink = $watchLinkOriginal.clone();
    const $kbdHintOriginal = $watchLinkOriginal.siblings('kbd');

    $('#toolbar-watch').append($clonedLink).append($kbdHintOriginal.clone());

    const requireMW = (window as any).require; 
    
    if (typeof requireMW === 'function') {
        const watch = requireMW('mediawiki.page.watch.ajax');
        if (watch && watch.watchstar) {
            watch.watchstar($clonedLink, pageName);
        }
    }
  } else {
    $('#toolbar-watch').hide();
  }

  // --- 5. Clock Functionality ---
  function updateClock(): void {
    const now = new Date();
    const displayString = now.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Tokyo'
    }) + ' ' + now.toLocaleTimeString('en-GB', {
      hour12: false, timeZone: 'Asia/Tokyo'
    }) + ' (JST)';
    
    $('#displayTimer a').text(displayString);
  }

  setInterval(updateClock, 1000);
  updateClock();

  // --- 6. Asynchronous Action Handler ---
  function handlePurgeClick(event: Event): void {
    event.preventDefault();
    api.post({
      action: 'purge',
      formatversion: 2,
      titles: pageName
    } as MwApiPostSettings).done(function () {
      mw.notify('Page cache purged successfully!', { tag: 'purge' });
    }).fail(function () {
      mw.notify('Error: Could not purge page.', { type: 'error' });
    });
  }

  $('body').on('click', '#displayTimer a', handlePurgeClick);

  // --- 7. Keep toolbar hidden when window resizes to mobile ---
  function checkAndRemoveOnMobile(_e: MediaQueryListEvent | MediaQueryList): void {
    if (mobileQuery.matches) {
      $('#bottom-toolbar').remove();
    }
  }

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', checkAndRemoveOnMobile as any);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(checkAndRemoveOnMobile);
  }

  $(window).on('resize orientationchange', function () {
    if (window.matchMedia('(max-width: 767px)').matches) {
      $('#bottom-toolbar').css('display', 'none');
    }
  });

  // --- 8. Docs trigger ---
  $('body').on('click', '#toolbar-docs', function (e: Event) {
    e.preventDefault();

    mw.notify('Opening Documentation Browser…', { tag: 'docs-launch' });

    const moduleName = 'ext.gadget.docsbrowser';
    
    mw.loader.using(moduleName, function () {
      if (typeof (window as any).openDocsBrowser === 'function') {
        try {
          (window as any).openDocsBrowser();
          return;
        } catch (err) {
          console.error('openDocsBrowser call failed after loader.using', err);
          mw.notify('Error opening Documentation Browser (check console).', { type: 'error' });
          return;
        }
      } else {
        fallbackLoadRaw();
      }
    }, function () {
      fallbackLoadRaw();
    });

    function fallbackLoadRaw(): void {
      mw.notify('Loading Documentation Browser (fallback)…', { tag: 'docs-loader' });

      const gadgetUrl = mw.util.getUrl('MediaWiki:Gadget-DocsBrowser.js', { action: 'raw', ctype: 'text/javascript' });

      $.getScript(gadgetUrl)
        .done(function () {
          mw.notify('Documentation Browser loaded.', { tag: 'docs-loader' });
          if (typeof (window as any).openDocsBrowser === 'function') {
            try {
              (window as any).openDocsBrowser();
            } catch (err) {
              console.error('openDocsBrowser after load failed', err);
              mw.notify('Loaded but failed to open the Documentation Browser. Check console.', { type: 'error' });
            }
          } else {
            mw.notify('Loaded script but launcher not found. Ensure MediaWiki:Gadget-DocsBrowser.js defines window.openDocsBrowser.', { type: 'error' });
            console.warn('Docs loaded but window.openDocsBrowser missing.');
          }
        })
        .fail(function (_jqxhr: any, status: string, error: string) {
          console.error('Failed to load Docs gadget:', status, error);
          mw.notify('Could not load Documentation Browser. Contact an admin.', { type: 'error' });
        });
    }
  });

})();