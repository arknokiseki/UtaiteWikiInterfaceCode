declare const mw: any;
declare const $: any;

interface MwApiQueryResponse {
  query?: {
    allcategories?: Array<{ category?: string; '*'?: string }>;
    allpages?: Array<{ title: string }>;
    pages?: Record<string, MwPage> | MwPage[];
  };
  'continue'?: any;
}
interface CacheData {
  expiry: number;
  data: string[];
}

interface MwPage {
  title?: string;
  missing?: boolean;
  categories?: Array<{ title: string }>;
  revisions?: Array<{
    timestamp: string;
    slots: { main: { content: string } };
  }>;
}

(function () {
  'use strict';

  if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
    return;
  }

  const contentModel: string = mw.config.get('wgPageContentModel');
  const excludedModels: string[] = ['css', 'javascript', 'json'];

  if (
    !mw.config.get('wgIsArticle') ||
    !mw.config.get('wgIsProbablyEditable') ||
    mw.config.get('wgArticleId') === 0 ||
    excludedModels.indexOf(contentModel) !== -1
  ) {
    return;
  }

  mw.loader.using(['mediawiki.api', 'mediawiki.util']).then(function () {
    const api = new mw.Api();

    // =========================
    // Config
    // =========================
    const MIN_QUERY = 2;                  // min chars before suggestions
    const SUGGEST_MAX = 20;               // max suggestions to show
    const CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour cache
    const CACHE_KEY = 'CategorySelectGetWikiCategories_V3';

    // Include empty category pages (Category: pages with zero members) in suggestions
    const INCLUDE_EMPTY_CATEGORY_PAGES = false;

    // Auto-create missing Category: pages (stubs) after adding new categories
    const AUTO_CREATE_CATEGORY_PAGES = false;
    const CATEGORY_PAGE_TEXT = ''; // e.g., 'This category groups related articles.'

    // Attempt to mark edits as bot (only works if account has 'bot' right)
    const FORCE_BOT_FLAG = true;

    // Optionally mark edits as minor
    const MARK_MINOR = false;

    // =========================
    // Derived constants
    // =========================
    const PAGE_TITLE: string = mw.config.get('wgPageName');
    const CAT_NS_ID = 14;
    const CAT_NS_NAME: string = (mw.config.get('wgFormattedNamespaces') || {})[CAT_NS_ID] || 'Category';

    // =========================
    // State
    // =========================
    let allCategories: string[] = [];
    let pageCatsVisible: string[] = [];
    let pageCatsHidden: string[] = [];
    let pendingAdd: Record<string, boolean> = {};
    let pendingRemove: Record<string, boolean> = {};
    let suggestIndex = -1;

    // =========================
    // Utilities
    // =========================
    const now = () => (new Date()).getTime();
    
    const escRe = (s: string) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const toSpaces = (name: string) => String(name || '').replace(/_/g, ' ');
    
    const toUnderscores = (name: string) => String(name || '').replace(/ /g, '_');
    
    const uniq = (arr: string[]): string[] => {
      const out: string[] = [];
      const seen: Record<string, number> = {};
      for (let i = 0; i < arr.length; i++) {
        const k = String(arr[i] || '').trim();
        if (!k) continue;
        const low = k.toLowerCase();
        if (!seen[low]) { seen[low] = 1; out.push(k); }
      }
      return out;
    };

    const escapeHTML = (s: string) => {
      const entityMap: Record<string, string> = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      };
      return String(s || '').replace(/[&<>"']/g, (c) => entityMap[c]);
    };

    const readCache = (): string[] | null => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const obj: CacheData = JSON.parse(raw);
        if (!obj || now() > obj.expiry) {
          localStorage.removeItem(CACHE_KEY);
          return null;
        }
        return obj.data;
      } catch (e) { return null; }
    };

    const writeCache = (data: string[]) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ expiry: now() + CACHE_TTL_MS, data: data }));
      } catch (e) {}
    };

    // =========================
    // Data fetchers
    // =========================
    const fetchAllCategoriesUsed = (cb: (cats: string[]) => void) => {
      const collected: string[] = [];
      const params: any = {
        action: 'query',
        list: 'allcategories',
        acprop: 'size|hidden',
        aclimit: 'max',
        format: 'json',
        'continue': ''
      };

      const next = (cont?: any) => {
        if (cont) {
          params.accontinue = cont.accontinue;
          params['continue'] = cont['continue'];
        }
        api.get(params).done((data: MwApiQueryResponse) => {
          const items = (data.query && data.query.allcategories) || [];
          for (let i = 0; i < items.length; i++) {
            const name = items[i].category || items[i]['*'] || '';
            if (name) collected.push(toSpaces(name));
          }
          if (data['continue']) next(data['continue']);
          else cb(uniq(collected));
        }).fail(() => cb([]));
      };
      next();
    };

    const fetchAllCategoryPages = (cb: (cats: string[]) => void) => {
      const collected: string[] = [];
      const params: any = {
        action: 'query',
        list: 'allpages',
        apnamespace: CAT_NS_ID,
        aplimit: 'max',
        format: 'json',
        'continue': ''
      };

      const next = (cont?: any) => {
        if (cont) {
          params.apcontinue = cont.apcontinue;
          params['continue'] = cont['continue'];
        }
        api.get(params).done((data: MwApiQueryResponse) => {
          const items = (data.query && data.query.allpages) || [];
          for (let i = 0; i < items.length; i++) {
            const title = items[i].title || ''; // 'Category:Name'
            const name = title.split(':').slice(1).join(':');
            if (name) collected.push(toSpaces(name));
          }
          if (data['continue']) next(data['continue']);
          else cb(uniq(collected));
        }).fail(() => cb([]));
      };
      next();
    };

    const getWikiCategories = (cb: (cats: string[]) => void) => {
      const cached = readCache();
      if (cached) { cb(cached); return; }

      if (INCLUDE_EMPTY_CATEGORY_PAGES) {
        fetchAllCategoriesUsed((used) => {
          fetchAllCategoryPages((pages) => {
            const merged = uniq(used.concat(pages));
            writeCache(merged);
            cb(merged);
          });
        });
      } else {
        fetchAllCategoriesUsed((used) => {
          writeCache(used);
          cb(used);
        });
      }
    };
    (window as any).getWikiCategories = getWikiCategories;

    const fetchPageCategories = (cb: (vis: string[], hid: string[]) => void) => {
      const vis: string[] = [];
      const hid: string[] = [];
      
      api.get({
        action: 'query', prop: 'categories', titles: PAGE_TITLE, cllimit: 'max', clshow: '!hidden', format: 'json'
      }).done((data: MwApiQueryResponse) => {
        const pages = (data.query && data.query.pages) as Record<string, MwPage> | undefined;
        
        if (pages) {
          for (const k in pages) {
            const cats = pages[k].categories || [];
            for (let i = 0; i < cats.length; i++) {
              vis.push(toSpaces((cats[i].title || '').split(':').slice(1).join(':')));
            }
          }
        }
        api.get({
          action: 'query', prop: 'categories', titles: PAGE_TITLE, cllimit: 'max', clshow: 'hidden', format: 'json'
        }).done((data2: MwApiQueryResponse) => {
          const pages2 = (data2.query && data2.query.pages) as Record<string, MwPage> | undefined;
          
          if (pages2) {
            for (const k2 in pages2) {
              const cats2 = pages2[k2].categories || [];
              for (let j = 0; j < cats2.length; j++) {
                hid.push(toSpaces((cats2[j].title || '').split(':').slice(1).join(':')));
              }
            }
          }
          cb(uniq(vis), uniq(hid));
        }).fail(() => cb(uniq(vis), []));
      }).fail(() => cb([], []));
    };

    // =========================
    // DOM & UI
    // =========================
    let $panel: any, $header: any, $status: any, $listVis: any, 
        $hiddenLabel: any, $listHid: any, $addBtn: any, $inputWrap: any, 
        $input: any, $suggest: any, $saveBtn: any, $cancelBtn: any, $toolbar: any;

    const buildUI = () => {
      const $catlinks = $('#catlinks');
      if (!$catlinks.length) return;

      $panel = $('<div class="cs-panel is-collapsed" id="csArticleCategories"></div>');
      const html = `
        <div class="cs-container">
          <div class="cs-header" role="button" tabindex="0" aria-expanded="false" aria-controls="csBody">
            <div class="cs-title">Categories</div>
            <div class="cs-status" aria-live="polite"></div>
          </div>
          <div class="cs-body" id="csBody" style="display:none;">
            <ul class="cs-list cs-visible"></ul>
            <div class="cs-addrow">
              <button type="button" class="cs-btn cs-add" aria-expanded="false" aria-controls="csInputWrap">+ Add category</button>
              <div class="cs-inputwrap" id="csInputWrap" style="display:none;">
                <input type="text" class="cs-input" placeholder="Type to search... (Enter to add)" maxlength="255" aria-expanded="false" role="combobox" aria-autocomplete="list" aria-owns="csSuggest" />
                <ul class="cs-suggest" id="csSuggest" role="listbox" aria-multiselectable="false" style="display:none;"></ul>
              </div>
            </div>
            <div class="cs-hidden-label" style="display:none;"><span>Hidden categories</span>:</div>
            <ul class="cs-list cs-hidden" style="display:none;"></ul>
            <div class="cs-toolbar">
              <button type="button" class="cs-btn cs-cancel">Cancel</button>
              <button type="button" class="cs-btn cs-save" disabled>Save</button>
            </div>
          </div>
        </div>`;
      
      $panel.html(html);

      // Cache selectors
      $header = $panel.find('.cs-header');
      $status = $panel.find('.cs-status');
      $listVis = $panel.find('.cs-list.cs-visible');
      $hiddenLabel = $panel.find('.cs-hidden-label');
      $listHid = $panel.find('.cs-list.cs-hidden');
      $addBtn = $panel.find('.cs-add');
      $inputWrap = $panel.find('.cs-inputwrap');
      $input = $panel.find('.cs-input');
      $suggest = $panel.find('.cs-suggest');
      $toolbar = $panel.find('.cs-toolbar');
      $cancelBtn = $panel.find('.cs-cancel');
      $saveBtn = $panel.find('.cs-save');

      $catlinks.after($panel);
      bindEvents();
    };

    const renderLists = () => {
      $listVis.empty();

      if (!pageCatsVisible.length && Object.keys(pendingAdd).length === 0) {
        $listVis.append('<li class="cs-empty">No categories yet.</li>');
      } else {
        for (let i = 0; i < pageCatsVisible.length; i++) {
          $listVis.append(renderChip(pageCatsVisible[i], false));
        }
        for (const name in pendingAdd) {
          if (Object.prototype.hasOwnProperty.call(pendingAdd, name)) {
            if (pageCatsVisible.indexOf(name) === -1 && pageCatsHidden.indexOf(name) === -1) {
              $listVis.append(renderChip(name, true));
            }
          }
        }
      }

      $listHid.empty();
      if (pageCatsHidden.length) {
        $hiddenLabel.show();
        $listHid.show();
        for (let i = 0; i < pageCatsHidden.length; i++) {
          $listHid.append(renderChip(pageCatsHidden[i], false, true));
        }
      } else {
        $hiddenLabel.hide();
        $listHid.hide();
      }
      updateActionBar();
    };

    const renderChip = (name: string, isNew: boolean, isHidden?: boolean) => {
      const li = $('<li class="cs-chip"></li>')
        .attr('data-name', name)
        .append($('<span class="cs-chip-name"></span>').text(name + (isHidden ? ' (hidden)' : '')))
        .append($(`<button type="button" class="cs-chip-remove" title="Remove" aria-label="Remove ${escapeHTML(name)}">×</button>`));
      
      if (isNew) li.addClass('cs-chip-new');
      if (pendingRemove[name]) li.addClass('cs-chip-removed');
      return li;
    };

    const bindEvents = () => {
      $header.on('click keydown', function (e: any) {
        if (e.type === 'keydown' && (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        const $body = $panel.find('.cs-body');
        const isExpanded = $body.is(':visible');

        $body.slideToggle(200);
        $panel.toggleClass('is-collapsed is-expanded');
        $(e.currentTarget).attr('aria-expanded', String(!isExpanded));
      });

      $addBtn.on('click', function () {
        const isOpen = $inputWrap.is(':visible');
        if (!isOpen) {
          $inputWrap.show();
          $addBtn.attr('aria-expanded', 'true');
          $input.val('').focus();
          suggestIndex = -1;
          updateSuggestions('');
        } else {
          $inputWrap.hide();
          $addBtn.attr('aria-expanded', 'false');
          $suggest.hide().empty();
          $input.val('');
        }
      });

      $cancelBtn.on('click', function () {
        resetEdits();
      });

      $saveBtn.on('click', saveChanges);

      $panel.on('click', '.cs-chip-remove', function (e: any) {
        const name = $(e.currentTarget).closest('.cs-chip').attr('data-name');
        if (pendingAdd[name]) {
          delete pendingAdd[name];
        } else {
          if (pendingRemove[name]) delete pendingRemove[name];
          else pendingRemove[name] = true;
        }
        renderLists();
      });

      let debounceTimer: any = null;
      $input.on('input', function (e: any) {
        const v = $.trim($(e.currentTarget).val());
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () { suggestIndex = -1; updateSuggestions(v); }, 120);
      });

      $input.on('keydown', function (e: any) {
        const visible = $suggest.is(':visible');
        const items = $suggest.find('li');
        if (e.key === 'ArrowDown' || e.keyCode === 40) {
          if (!visible || !items.length) return;
          e.preventDefault();
          suggestIndex = (suggestIndex + 1) % items.length;
          updateSuggestActive(items);
        } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
          if (!visible || !items.length) return;
          e.preventDefault();
          suggestIndex = (suggestIndex - 1 + items.length) % items.length;
          updateSuggestActive(items);
        } else if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          if (visible && suggestIndex > -1 && items.length) {
            const name = $(items[suggestIndex]).attr('data-name');
            pickCategory(name);
          } else {
            const raw = $.trim($input.val());
            if (raw) pickCategory(raw);
          }
        } else if (e.key === 'Escape' || e.keyCode === 27) {
          e.preventDefault();
          $suggest.hide().empty();
          suggestIndex = -1;
        }
      });

      $suggest.on('click', 'li', function (e: any) {
        const name = $(e.currentTarget).attr('data-name');
        pickCategory(name);
      });

      $input.on('blur', function () {
        setTimeout(function () { $suggest.hide(); }, 150);
      });
    };

    const pickCategory = (name: string) => {
      name = toSpaces(name || '').replace(/\s+/g, ' ').trim();
      if (!name) return;
      delete pendingRemove[name];
      pendingAdd[name] = true;
      $input.val('');
      $suggest.hide().empty();
      suggestIndex = -1;
      renderLists();
      $input.focus();
    };

    const highlightMatch = (text: string, query: string) => {
      const t = String(text || '');
      const q = String(query || '').trim();
      if (!q) return escapeHTML(t);
      const re = new RegExp('(' + escRe(q) + ')', 'ig');
      return escapeHTML(t).replace(re, '<span class="match">$1</span>');
    };

    const updateSuggestions = (query: string) => {
      if (query.length < MIN_QUERY) { $suggest.hide().empty(); return; }
      const q = query.toLowerCase();
      const already: Record<string, number> = {};
      let i;

      // exclude already present or pending adds
      for (i = 0; i < pageCatsVisible.length; i++) already[pageCatsVisible[i].toLowerCase()] = 1;
      for (i = 0; i < pageCatsHidden.length; i++) already[pageCatsHidden[i].toLowerCase()] = 1;
      for (const n in pendingAdd) if (Object.prototype.hasOwnProperty.call(pendingAdd, n)) already[n.toLowerCase()] = 1;

      const matches: string[] = [];
      for (i = 0; i < allCategories.length; i++) {
        const n = allCategories[i];
        if (already[n.toLowerCase()]) continue;
        if (n.toLowerCase().indexOf(q) !== -1) matches.push(n);
        if (matches.length >= SUGGEST_MAX) break;
      }

      // Offer the raw query as "new" option if not matched
      const rawName = query.replace(/\s+/g, ' ').trim();
      if (rawName) {
        let found = false;
        for (i = 0; i < matches.length; i++) {
          if (matches[i].toLowerCase() === rawName.toLowerCase()) {
            found = true;
            break;
          }
        }
        if (!found) {
          matches.unshift(rawName);
          if (matches.length > SUGGEST_MAX) matches.pop();
        }
      }

      $suggest.empty();
      for (i = 0; i < matches.length; i++) {
        const m = matches[i];
        const $li = $('<li role="option"></li>')
          .attr('data-name', m)
          .html(highlightMatch(m, query));
        $suggest.append($li);
      }
      $suggest.show();
      suggestIndex = -1;
      updateSuggestActive($suggest.find('li'));
    };

    const updateSuggestActive = (items: any) => {
      items.removeClass('is-active').attr('aria-selected', 'false');
      if (suggestIndex > -1 && suggestIndex < items.length) {
        const $it = $(items[suggestIndex]);
        $it.addClass('is-active').attr('aria-selected', 'true');
        // ensure visible
        const list = $suggest.get(0);
        const el = $it.get(0);
        if (list && el) {
          const top = el.offsetTop;
          const bottom = top + el.offsetHeight;
          if (top < list.scrollTop) list.scrollTop = top;
          else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
        }
      }
    };

    const hasChanges = () => {
      for (const k in pendingAdd) if (Object.prototype.hasOwnProperty.call(pendingAdd, k)) return true;
      for (const k in pendingRemove) if (Object.prototype.hasOwnProperty.call(pendingRemove, k)) return true;
      return false;
    };

    const updateActionBar = () => {
      const changes = hasChanges();
      $saveBtn.prop('disabled', !changes);
      if (changes) {
        const addCount = Object.keys(pendingAdd).length;
        const remCount = Object.keys(pendingRemove).length;
        const parts: string[] = [];
        if (addCount) parts.push(addCount + ' add' + (addCount > 1 ? 's' : ''));
        if (remCount) parts.push(remCount + ' remove' + (remCount > 1 ? 's' : ''));
        $status.text(parts.join(', ') + ' pending');
        $toolbar.css('display', 'flex');
      } else {
        $status.text('');
        $toolbar.hide().removeClass('is-visible');
      }
    };

    const resetEdits = () => {
      pendingAdd = {};
      pendingRemove = {};
      $input.val('');
      $inputWrap.hide();
      $addBtn.attr('aria-expanded', 'false');
      $suggest.hide().empty();
      suggestIndex = -1;
      renderLists();
    };

    // =========================
    // Editing
    // =========================
    const fetchWikitext = (cb: (err: Error | null, info?: { text: string; basetimestamp: string }) => void) => {
      api.get({
        action: 'query',
        prop: 'revisions',
        titles: PAGE_TITLE,
        rvprop: 'content|timestamp',
        rvslots: 'main',
        formatversion: 2
      }).done((data: MwApiQueryResponse) => {
        const pages = (data.query && data.query.pages) as MwPage[] | undefined;
        const page = pages && pages[0];

        if (!page || page.missing) { cb(new Error('Page missing')); return; }
        
        const rev = page.revisions && page.revisions[0];
        const text = (rev && rev.slots && rev.slots.main && rev.slots.main.content) || '';
        
        cb(null, { 
          text: text, 
          basetimestamp: (rev && rev.timestamp) || '' 
        });
      }).fail((code: string, _err: any) => { 
        cb(new Error(code || 'get failed')); 
      });
    };

    const buildCategoryRegex = (name: string) => {
      const namePattern = escRe(name).replace(/[ _]+/g, '[ _]+');
      const nsPattern = escRe(CAT_NS_NAME); 
      return new RegExp(
        `\\[\\[\\s*${nsPattern}\\s*:\\s*${namePattern}\\s*(?:\\|[^\\]]*)?\\]\\]`,
        'gi'
      );
    };

    const applyEditsToText = (text: string) => {
      let name;
      // Remove selected categories
      for (name in pendingRemove) {
        if (Object.prototype.hasOwnProperty.call(pendingRemove, name)) {
          text = text.replace(buildCategoryRegex(name), '');
        }
      }
      // Add new ones
      const additions: string[] = [];
      for (name in pendingAdd) {
        if (Object.prototype.hasOwnProperty.call(pendingAdd, name)) {
          const re = buildCategoryRegex(name);
          if (!re.test(text)) additions.push(`[[${CAT_NS_NAME}:${name}]]`);
        }
      }
      if (additions.length) {
        if (!/\n$/.test(text)) text += '\n';
        text += additions.join('\n') + '\n';
      }
      // Tidy up blank lines
      text = text.replace(/\n{3,}/g, '\n\n');
      return text;
    };

    const ensureCategoryPages = (names: string[], done: () => void) => {
      if (!AUTO_CREATE_CATEGORY_PAGES || !names || !names.length) { done && done(); return; }

      let i = 0; 
      const all = uniq(names.slice(0));
      
      const nextBatch = () => {
        if (i >= all.length) { done && done(); return; }
        const batch = all.slice(i, i + 50); i += 50;
        const titles: string[] = [];
        for (let k = 0; k < batch.length; k++) titles.push(`${CAT_NS_NAME}:${toUnderscores(batch[k])}`);

        api.get({ action: 'query', prop: 'info', titles: titles.join('|'), formatversion: 2 })
          .done((data: MwApiQueryResponse) => {
            const pages = (data.query && data.query.pages) as MwPage[] || [];
            const missing: string[] = [];
            
            for (let p = 0; p < pages.length; p++) {
                if (pages[p].missing && pages[p].title) missing.push(pages[p].title!);
            }

            let idx = 0;
            const createOne = () => {
              if (idx >= missing.length) { nextBatch(); return; }
              const t = missing[idx++];
              api.postWithToken('csrf', {
                action: 'edit',
                title: t,
                text: CATEGORY_PAGE_TEXT,
                summary: 'Create category page (auto)',
                createonly: 1,
                contentformat: 'text/x-wiki',
                contentmodel: 'wikitext'
              }).always(createOne);
            };
            createOne();
          })
          .fail(nextBatch);
      };
      nextBatch();
    };

    const saveChanges = () => {
      const addedNames = Object.keys(pendingAdd);
      $saveBtn.prop('disabled', true).text('Saving…');
      
      fetchWikitext((err, info) => {
        if (err || !info) { 
            alert('Could not fetch page text.'); 
            $saveBtn.text('Save'); 
            updateActionBar(); 
            return; 
        }
        
        const newText = applyEditsToText(info.text);
        if (newText === info.text) { 
            alert('No changes to save.'); 
            $saveBtn.text('Save'); 
            updateActionBar(); 
            return; 
        }

        const params: any = {
          action: 'edit',
          title: PAGE_TITLE,
          text: newText,
          summary: 'Update categories via CategorySelect gadget',
          basetimestamp: info.basetimestamp,
          contentformat: 'text/x-wiki',
          contentmodel: 'wikitext'
        };
        if (FORCE_BOT_FLAG) params.bot = 1;
        if (MARK_MINOR) params.minor = 1;

        api.postWithToken('csrf', params).done((res: any) => {
          if (res && res.edit && res.edit.result === 'Success') {
            ensureCategoryPages(addedNames, function () {
              pendingAdd = {};
              pendingRemove = {};
              fetchPageCategories(function (vis, hid) {
                pageCatsVisible = vis;
                pageCatsHidden = hid;
                renderLists();
                $saveBtn.text('Save');
                location.reload();
              });
            });
          } else {
            alert('Edit failed.');
            $saveBtn.text('Save');
            updateActionBar();
          }
        }).fail((code: string, err: any) => {
          alert('Edit failed: ' + (code || err || 'unknown'));
          $saveBtn.text('Save');
          updateActionBar();
        });
      });
    };

    // =========================
    // Boot
    // =========================
    buildUI();
    getWikiCategories(function (cats) {
      allCategories = cats || [];
      fetchPageCategories(function (vis, hid) {
        pageCatsVisible = vis;
        pageCatsHidden = hid;
        renderLists();
      });
    });
  });
})();