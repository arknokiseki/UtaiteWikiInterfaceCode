/**
 * Discography Editor 
 * v0.0.1
 * initial code
 * @author Makudoumee
 */
(function (mw, $) {
  'use strict';

  // Run only on view action in Data pages (Data: or */Data/*)
  var ns = mw.config.get('wgCanonicalNamespace') || '';
  var pageName = mw.config.get('wgPageName');
  var isDataPage = ns === 'Data' || /\/Data\//.test(pageName);
  if (!isDataPage || mw.config.get('wgAction') !== 'view') return;

  var api = new mw.Api();
  var cfg = window.DiscographyEditorConfig || {};
  var templatePrefix = cfg.templatePrefix || 'User:Makudoumee/sandbox/templates';
  var T_DA = cfg.T_DA || (templatePrefix + '/D-Album');
  var T_DV = cfg.T_DV || (templatePrefix + '/D-Variant');
  var T_DT = cfg.T_DT || (templatePrefix + '/D-Track');

  function addButton() {
    var link = mw.util.addPortletLink('p-cactions', '#', 'Edit discography', 'ca-discography-editor', 'Open the discography editor');
    if (link) {
      $(link).on('click', function (e) {
        e.preventDefault();
        openEditor();
      });
    } else {
      $('<button class="de-btn" style="margin:8px 0;">Edit discography</button>')
        .insertAfter('#firstHeading')
        .on('click', openEditor);
    }
  }

  // Utilities
  function decodePageName(n) { return (n || pageName).replace(/_/g, ' '); }
  function getArtistFromTitle() {
    // Last subpage segment ([pagename] in Data:pagename or User:.../Data/pagename)
    var parts = decodePageName().split('/');
    return parts[parts.length - 1] || '';
  }
  function h(str) { return (str == null ? '' : String(str)); }
  function esc(val) {
    // minimal wikitext escaping for template params
    var s = h(val);
    // Convert pipe inside values to {{!}} to avoid breaking template params
    s = s.replace(/\|/g, '{{!}}');
    return s;
  }
  function joinDot(list) {
    // Join list as 'a · b · c'
    if (!list || !list.length) return '';
    return list.join(' · ');
  }
  function toISODate(d) {
    // Accept 'YYYY-MM-DD' or SMW object; return YYYY-MM-DD
    if (!d) return '';
    if (typeof d === 'string') {
      var m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? m[0] : d;
    }
    if (d.timestamp) {
      // MW timestamp like 2024-01-19T00:00:00Z
      return d.timestamp.substr(0, 10);
    }
    if (d.value) return toISODate(d.value);
    return '';
  }
  function pick(po, prop) {
    // Get first SMW printout value as string
    var arr = po[prop] || [];
    if (!arr.length) return '';
    var v = arr[0];
    if (v && typeof v === 'object') {
      if (v.fulltext) return v.fulltext;
      if (v.raw) return v.raw;
      if (v.value) return v.value;
      if (v.timestamp) return toISODate(v);
    }
    return v;
  }
  function pickAll(po, prop) {
    var arr = po[prop] || [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v && typeof v === 'object') {
        if (v.fulltext) out.push(v.fulltext);
        else if (v.raw) out.push(v.raw);
        else if (v.value) out.push(v.value);
        else if (v.timestamp) out.push(toISODate(v));
        else out.push(String(v));
      } else {
        out.push(String(v));
      }
    }
    return out;
  }

  function ask(query) {
    return api.post({ action: 'ask', format: 'json', query: query });
  }

  function loadModel() {
	  var dp = decodePageName();
	  var artist = getArtistFromTitle();
	
	  var qAlbums =
	    '[[kind::album]][[datapage::' + dp + ']]' +
	    '|?albumid|?albumtitle|?officialjaptitle|?officialromtitle|?officialengtitle|?label|?albumartist';
	
	  var qVariants =
	    '[[kind::variant]][[datapage::' + dp + ']]' +
	    '|?albumid|?variantkey|?variantname|?datereleased' +
	    '|?image|?imagealt|?imagealt2|?imagealt3|?imagealt4|?imagelink' +
	    '|?shops|?jpshops|?streams' +
	    '|?spotifyalbumid|?crossfadeyt|?ytxfddesc|?crossfadennd|?nndxfddesc' +
	    '|?trackcolwidth|?titlecolwidth|?detailscolwidth|?utaitecolwidth|?lyricistcolwidth|?composercolwidth|?arrangercolwidth';
	
	  var qTracks =
	    '[[kind::track]][[datapage::' + dp + ']]' +
	    '|?albumid|?variantkey|?tracknum|?title|?additionalshortinfo|?singers|?lyricist|?composer|?arranger';

    return $.when(ask(qAlbums), ask(qVariants), ask(qTracks)).then(function (aRes, vRes, tRes) {
      // jQuery when returns arrays [data, status, xhr]; use first item
      aRes = aRes[0] || aRes; vRes = vRes[0] || vRes; tRes = tRes[0] || tRes;
      var albumsById = {};
      var albumsList = [];

      // Albums
      var aResults = (aRes.query && aRes.query.results) || {};
      $.each(aResults, function (_, row) {
        var po = row.printouts || {};
        var albumid = pick(po, 'albumid') || '';
        if (!albumid) return;
        var album = {
          albumid: albumid,
          albumtitle: pick(po, 'albumtitle'),
          officialjaptitle: pick(po, 'officialjaptitle'),
          officialromtitle: pick(po, 'officialromtitle'),
          officialengtitle: pick(po, 'officialengtitle'),
          label: pick(po, 'label'),
          albumartist: pick(po, 'albumartist'),
          variants: []
        };
        albumsById[albumid] = album;
        albumsList.push(album);
      });

      // Variants
      var vResults = (vRes.query && vRes.query.results) || {};
      var variantsIndex = {}; // key: albumid|variantkey -> variant
      $.each(vResults, function (_, row) {
        var po = row.printouts || {};
        var albumid = pick(po, 'albumid');
        var variantkey = pick(po, 'variantkey');
        if (!albumid || !variantkey) return;
        var variant = {
          albumid: albumid,
          variantkey: variantkey,
          variantname: pick(po, 'variantname'),
          datereleased: toISODate((po.datereleased || [])[0]) || '',
          image: pick(po, 'image'),
          imagealt: pick(po, 'imagealt'),
          imagealt2: pick(po, 'imagealt2'),
          imagealt3: pick(po, 'imagealt3'),
          imagealt4: pick(po, 'imagealt4'),
          imagelink: pick(po, 'imagelink'),
          shops: joinDot(pickAll(po, 'shops')),
          jpshops: joinDot(pickAll(po, 'jpshops')),
          streams: joinDot(pickAll(po, 'streams')),
          spotifyalbumid: pick(po, 'spotifyalbumid'),
          crossfadeyt: pick(po, 'crossfadeyt'),
          ytxfddesc: pick(po, 'ytxfddesc'),
          crossfadennd: pick(po, 'crossfadennd'),
          nndxfddesc: pick(po, 'nndxfddesc'),
          trackcolwidth: pick(po, 'trackcolwidth'),
          titlecolwidth: pick(po, 'titlecolwidth'),
          detailscolwidth: pick(po, 'detailscolwidth'),
          utaitecolwidth: pick(po, 'utaitecolwidth'),
          lyricistcolwidth: pick(po, 'lyricistcolwidth'),
          composercolwidth: pick(po, 'composercolwidth'),
          arrangercolwidth: pick(po, 'arrangercolwidth'),
          tracks: []
        };
        variantsIndex[albumid + '|' + variantkey] = variant;
        var parentAlbum = albumsById[albumid];
        if (parentAlbum) parentAlbum.variants.push(variant);
        else {
          // Album not found from SMW (edge case) – create shell
          albumsById[albumid] = { albumid: albumid, albumtitle: '', variants: [variant] };
          albumsList.push(albumsById[albumid]);
        }
      });

      // Tracks
      var tResults = (tRes.query && tRes.query.results) || {};
      $.each(tResults, function (_, row) {
        var po = row.printouts || {};
        var albumid = pick(po, 'albumid');
        var variantkey = pick(po, 'variantkey');
        var key = albumid + '|' + variantkey;
        var variant = variantsIndex[key];
        if (!variant) return;
        var track = {
          tracknum: Number(pick(po, 'tracknum')) || 0,
          title: pick(po, 'title'),
          additionalshortinfo: pick(po, 'additionalshortinfo'),
          singers: pick(po, 'singers'),
          lyricist: pick(po, 'lyricist'),
          composer: pick(po, 'composer'),
          arranger: pick(po, 'arranger')
        };
        variant.tracks.push(track);
      });

      // Sort tracks by tracknum
      for (var i = 0; i < albumsList.length; i++) {
        var av = albumsList[i].variants || [];
        for (var j = 0; j < av.length; j++) {
          av[j].tracks.sort(function (a, b) { return a.tracknum - b.tracknum; });
        }
      }

      return {
        datapage: dp,
        artist: artist,
        albums: albumsList
      };
    });
  }

  // UI rendering
  var model; // global in module scope for simplicity

  function openEditor() {
    // Build shell
    var overlay = $('<div id="de-overlay"></div>');
    var dialog = $('<div id="de-dialog"></div>');
    var header = $('<div id="de-header"></div>');
    var content = $('<div id="de-content"></div>');
    var footer = $('<div id="de-footer"></div>');
    var title = $('<div id="de-title"></div>').text('Discography editor — ' + decodePageName());
    var btnClose = $('<button class="de-btn ghost">Close</button>').on('click', function () { overlay.hide().remove(); });

    header.append(title).append(btnClose);
    footer.append(
      $('<button class="de-btn danger">Save</button>').on('click', saveEditor),
      $('<button class="de-btn secondary">Cancel</button>').on('click', function () { overlay.hide().remove(); })
    );
    dialog.append(header, content, footer);
    overlay.append(dialog);
    $('body').append(overlay);
    overlay.show();

    // Load data from SMW then render
    loadModel().then(function (m) {
      model = m;
      renderContent(content);
    }).fail(function (e) {
      content.empty().append($('<div>').text('Could not load data from SMW (action=ask).'));
    });
  }

  function renderContent($root) {
    $root.empty();

    var toolbar = $('<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"></div>');
    toolbar.append(
      $('<span class="de-chip"></span>').text('Artist: ' + (model.artist || '')),
      $('<button class="de-btn">Add album</button>').on('click', function () {
        model.albums.push({
          albumid: '',
          albumtitle: '',
          officialjaptitle: '',
          officialromtitle: '',
          officialengtitle: '',
          label: '',
          albumartist: '',
          variants: []
        });
        renderContent($root);
      })
    );
    $root.append(toolbar);

    // Albums list
    var list = $('<div class="de-list"></div>');
    for (var i = 0; i < model.albums.length; i++) {
      list.append(renderAlbum(model.albums[i], i));
    }
    $root.append(list);
  }

  function renderAlbum(album, idx) {
    var section = $('<div class="de-section"></div>');
    var hd = $('<div class="de-section-hd"></div>');
    var bd = $('<div class="de-section-bd"></div>');
    var ctrl = $('<div class="de-item-controls"></div>');
    var moveUp = $('<button class="de-btn ghost" title="Move up">▲</button>').on('click', function () {
      if (idx > 0) {
        var t = model.albums[idx - 1]; model.albums[idx - 1] = model.albums[idx]; model.albums[idx] = t;
        renderContent($('#de-content'));
      }
    });
    var moveDn = $('<button class="de-btn ghost" title="Move down">▼</button>').on('click', function () {
      if (idx < model.albums.length - 1) {
        var t = model.albums[idx + 1]; model.albums[idx + 1] = model.albums[idx]; model.albums[idx] = t;
        renderContent($('#de-content'));
      }
    });
    var del = $('<button class="de-btn danger" title="Delete album">Delete</button>').on('click', function () {
      if (confirm('Delete album "' + (album.albumid || album.albumtitle || '') + '"?')) {
        model.albums.splice(idx, 1);
        renderContent($('#de-content'));
      }
    });
    ctrl.append(moveUp, moveDn, del);

    hd.append($('<strong>Album</strong>')).append(ctrl);

    var grid = $('<div class="de-grid"></div>');
    function f(label, value, setter, span) {
      var w = $('<div class="de-field"></div>').css('grid-column', 'span ' + (span || 3));
      var input = $('<input type="text">').val(value || '').on('input', function () { setter(this.value); });
      w.append($('<label>').text(label), input);
      return w;
    }
    grid.append(
      f('albumid', album.albumid, function (v) { album.albumid = v; }, 3),
      f('albumtitle', album.albumtitle, function (v) { album.albumtitle = v; }, 5),
      f('officialjaptitle', album.officialjaptitle, function (v) { album.officialjaptitle = v; }, 4),
      f('officialromtitle', album.officialromtitle, function (v) { album.officialromtitle = v; }, 4),
      f('officialengtitle', album.officialengtitle, function (v) { album.officialengtitle = v; }, 4),
      f('label', album.label, function (v) { album.label = v; }, 6),
      f('albumartist', album.albumartist, function (v) { album.albumartist = v; }, 6)
    );
    bd.append(grid);

    // Variants header
    bd.append($('<div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;"></div>')
      .append($('<strong>Variants</strong>'))
      .append($('<button class="de-btn">Add variant</button>').on('click', function () {
        album.variants.push({
          albumid: album.albumid || '',
          variantkey: '',
          variantname: '',
          datereleased: '',
          image: '',
          imagealt: '',
          imagealt2: '',
          imagealt3: '',
          imagealt4: '',
          imagelink: '',
          shops: '',
          jpshops: '',
          streams: '',
          spotifyalbumid: '',
          crossfadeyt: '',
          ytxfddesc: '',
          crossfadennd: '',
          nndxfddesc: '',
          trackcolwidth: '',
          titlecolwidth: '',
          detailscolwidth: '',
          utaitecolwidth: '',
          lyricistcolwidth: '',
          composercolwidth: '',
          arrangercolwidth: '',
          tracks: []
        });
        renderContent($('#de-content'));
      }))
    );

    // Variants list
    var vlist = $('<div class="de-list"></div>');
    for (var i = 0; i < album.variants.length; i++) {
      vlist.append(renderVariant(album, album.variants[i], i));
    }
    bd.append(vlist);

    section.append(hd, bd);
    return section;
  }

  function renderVariant(album, variant, idx) {
    var section = $('<div class="de-section"></div>');
    var hd = $('<div class="de-section-hd"></div>');
    var bd = $('<div class="de-section-bd"></div>');

    var ctrl = $('<div class="de-item-controls"></div>');
    var moveUp = $('<button class="de-btn ghost" title="Move up">▲</button>').on('click', function () {
      if (idx > 0) {
        var t = album.variants[idx - 1]; album.variants[idx - 1] = album.variants[idx]; album.variants[idx] = t;
        renderContent($('#de-content'));
      }
    });
    var moveDn = $('<button class="de-btn ghost" title="Move down">▼</button>').on('click', function () {
      if (idx < album.variants.length - 1) {
        var t = album.variants[idx + 1]; album.variants[idx + 1] = album.variants[idx]; album.variants[idx] = t;
        renderContent($('#de-content'));
      }
    });
    var del = $('<button class="de-btn danger" title="Delete variant">Delete</button>').on('click', function () {
      if (confirm('Delete variant "' + (variant.variantkey || variant.variantname || '') + '"?')) {
        album.variants.splice(idx, 1);
        renderContent($('#de-content'));
      }
    });
    ctrl.append(moveUp, moveDn, del);

    hd.append($('<strong>Variant</strong>'), $('<span class="de-chip"></span>').text(album.albumid || ''), ctrl);

    var grid = $('<div class="de-grid"></div>');
    function f(label, value, setter, span, type) {
      var w = $('<div class="de-field"></div>').css('grid-column', 'span ' + (span || 3));
      var input = $('<input type="' + (type || 'text') + '">').val(value || '').on('input', function () { setter(this.value); });
      w.append($('<label>').text(label), input);
      return w;
    }
    function ta(label, value, setter, span, note) {
      var w = $('<div class="de-field"></div>').css('grid-column', 'span ' + (span || 6));
      var input = $('<textarea rows="2">').val(value || '').on('input', function () { setter(this.value); });
      w.append($('<label>').text(label), input);
      if (note) w.append($('<div class="de-note">').text(note));
      return w;
    }
    grid.append(
      f('albumid', variant.albumid || album.albumid, function (v) { variant.albumid = v; }, 3),
      f('variantkey', variant.variantkey, function (v) { variant.variantkey = v; }, 3),
      f('variantname', variant.variantname, function (v) { variant.variantname = v; }, 6),
      f('datereleased (YYYY-MM-DD)', variant.datereleased, function (v) { variant.datereleased = v; }, 3, 'date'),
      f('image', variant.image, function (v) { variant.image = v; }, 3),
      f('imagealt', variant.imagealt, function (v) { variant.imagealt = v; }, 3),
      f('imagealt2', variant.imagealt2, function (v) { variant.imagealt2 = v; }, 3),
      f('imagealt3', variant.imagealt3, function (v) { variant.imagealt3 = v; }, 3),
      f('imagealt4', variant.imagealt4, function (v) { variant.imagealt4 = v; }, 3),
      f('imagelink', variant.imagelink, function (v) { variant.imagelink = v; }, 6),
      ta('jpshops', variant.jpshops, function (v) { variant.jpshops = v; }, 6, 'Example: [[Amazon.co.jp]] · [[HMV]]'),
      ta('shops', variant.shops, function (v) { variant.shops = v; }, 6, 'Example: [[Bandcamp]] · [[Amazon]]'),
      ta('streams', variant.streams, function (v) { variant.streams = v; }, 6, 'Example: [[Spotify]] · [[Apple Music]]'),
      f('spotifyalbumid', variant.spotifyalbumid, function (v) { variant.spotifyalbumid = v; }, 6),
      f('crossfadeyt', variant.crossfadeyt, function (v) { variant.crossfadeyt = v; }, 4),
      f('ytxfddesc', variant.ytxfddesc, function (v) { variant.ytxfddesc = v; }, 8),
      f('crossfadennd', variant.crossfadennd, function (v) { variant.crossfadennd = v; }, 4),
      f('nndxfddesc', variant.nndxfddesc, function (v) { variant.nndxfddesc = v; }, 8),
      f('trackcolwidth', variant.trackcolwidth, function (v) { variant.trackcolwidth = v; }, 3),
      f('titlecolwidth', variant.titlecolwidth, function (v) { variant.titlecolwidth = v; }, 3),
      f('detailscolwidth', variant.detailscolwidth, function (v) { variant.detailscolwidth = v; }, 3),
      f('utaitecolwidth', variant.utaitecolwidth, function (v) { variant.utaitecolwidth = v; }, 3),
      f('lyricistcolwidth', variant.lyricistcolwidth, function (v) { variant.lyricistcolwidth = v; }, 3),
      f('composercolwidth', variant.composercolwidth, function (v) { variant.composercolwidth = v; }, 3),
      f('arrangercolwidth', variant.arrangercolwidth, function (v) { variant.arrangercolwidth = v; }, 3)
    );

    bd.append(grid);

    // Tracks
    var tracksHdr = $('<div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;"></div>')
      .append($('<strong>Tracks</strong>'))
      .append($('<button class="de-btn">Add track</button>').on('click', function () {
        variant.tracks.push({ tracknum: (variant.tracks.length + 1), title: '', additionalshortinfo: '', singers: '', lyricist: '', composer: '', arranger: '' });
        renderContent($('#de-content'));
      }));
    bd.append(tracksHdr);

    var tbl = $('<table class="de-table"></table>');
    tbl.append('<thead><tr><th>#</th><th>Title</th><th>Details</th><th>Utaite</th><th>Lyricist</th><th>Composer</th><th>Arranger</th><th>Actions</th></tr></thead>');
    var tb = $('<tbody></tbody>');
    for (var i = 0; i < variant.tracks.length; i++) {
      (function (track, tIdx) {
        var tr = $('<tr></tr>');
        var num = $('<input type="text" style="width:50px">').val(track.tracknum).on('input', function () { track.tracknum = Number(this.value.replace(/[^\d]/g, '')) || 0; });
        tr.append($('<td></td>').append(num));
        function tdInput(key, w) {
          var td = $('<td></td>');
          var inp = $('<input type="text">').css('width', (w || '100%')).val(track[key] || '').on('input', function () { track[key] = this.value; });
          td.append(inp); return td;
        }
        tr.append(
          tdInput('title'),
          tdInput('additionalshortinfo'),
          tdInput('singers'),
          tdInput('lyricist'),
          tdInput('composer'),
          tdInput('arranger')
        );
        var actions = $('<td></td>');
        var up = $('<button class="de-btn ghost" title="Up">▲</button>').on('click', function () {
          if (tIdx > 0) {
            var tmp = variant.tracks[tIdx - 1]; variant.tracks[tIdx - 1] = variant.tracks[tIdx]; variant.tracks[tIdx] = tmp;
            renderContent($('#de-content'));
          }
        });
        var dn = $('<button class="de-btn ghost" title="Down">▼</button>').on('click', function () {
          if (tIdx < variant.tracks.length - 1) {
            var tmp = variant.tracks[tIdx + 1]; variant.tracks[tIdx + 1] = variant.tracks[tIdx]; variant.tracks[tIdx] = tmp;
            renderContent($('#de-content'));
          }
        });
        var del = $('<button class="de-btn danger" title="Delete">Delete</button>').on('click', function () {
          if (confirm('Delete track #' + track.tracknum + '?')) {
            variant.tracks.splice(tIdx, 1);
            renderContent($('#de-content'));
          }
        });
        actions.append(up, dn, del);
        tr.append(actions);
        tb.append(tr);
      })(variant.tracks[i], i);
    }
    tbl.append(tb);
    bd.append(tbl);

    section.append(hd, bd);
    return section;
  }

  // Save
  function saveEditor() {
    var wikitext = buildWikitext(model);
    // Load current content, replace <onlyinclude>...</onlyinclude>
    api.get({
      action: 'query', prop: 'revisions', rvprop: ['content', 'timestamp'].join('|'),
      titles: pageName, formatversion: 2
    }).then(function (data) {
      var page = (data.query.pages && data.query.pages[0]) || {};
      var text = (page.revisions && page.revisions[0] && page.revisions[0].content) || '';
      var ts = (page.revisions && page.revisions[0] && page.revisions[0].timestamp) || undefined;

      var newText;
      var re = /<onlyinclude>[\s\S]*?<\/onlyinclude>/i;
      if (re.test(text)) {
        newText = text.replace(re, '<onlyinclude>\n' + wikitext + '\n</onlyinclude>');
      } else {
        newText = '<onlyinclude>\n' + wikitext + '\n</onlyinclude>\n';
      }
      if (!confirm('Save changes to ' + decodePageName() + '?')) return $.Deferred().reject();

      return api.postWithToken('csrf', {
        action: 'edit',
        title: pageName,
        text: newText,
        summary: 'Discography: update data via DiscographyEditor',
        basetimestamp: ts,
        minor: true
      });
    }).then(function () {
      mw.notify('Saved. Purging page …', { type: 'success' });
      // Purge to force SMW reparse and UI refresh
      return api.post({ action: 'purge', titles: pageName });
    }).then(function () {
      location.reload();
    }).fail(function (e) {
      console.error(e);
      mw.notify('Save failed. See console.', { type: 'error' });
    });
  }

  function buildWikitext(m) {
	  var out = [];
	  out.push('<!-- Discography data generated by DiscographyEditor -->\n');
	
	  for (var i = 0; i < m.albums.length; i++) {
	    var a = m.albums[i];
	    out.push('{{' + T_DA);
	    if (m.artist) out.push(' | artist=' + esc(m.artist));
	    out.push(' | albumid=' + esc(a.albumid));
	    if (a.albumtitle) out.push(' | albumtitle=' + esc(a.albumtitle));
	    if (a.officialjaptitle) out.push(' | officialjaptitle=' + esc(a.officialjaptitle));
	    if (a.officialromtitle) out.push(' | officialromtitle=' + esc(a.officialromtitle));
	    if (a.officialengtitle) out.push(' | officialengtitle=' + esc(a.officialengtitle));
	    if (a.label) out.push(' | label=' + esc(a.label));
	    if (a.albumartist) out.push(' | albumartist=' + esc(a.albumartist));
	    out.push(' | variants=');
	
	    for (var j = 0; j < a.variants.length; j++) {
	      var v = a.variants[j];
	      out.push('{{' + T_DV);
	      if (m.artist) out.push(' | artist=' + esc(m.artist));
	      out.push(' | albumid=' + esc(v.albumid || a.albumid));
	      out.push(' | variantkey=' + esc(v.variantkey));
	      if (v.variantname) out.push(' | variantname=' + esc(v.variantname));
	      if (v.datereleased) out.push(' | datereleased=' + esc(v.datereleased));
	      if (v.image) out.push(' | image=' + esc(v.image));
	      if (v.imagealt) out.push(' | imagealt=' + esc(v.imagealt));
	      if (v.imagealt2) out.push(' | imagealt2=' + esc(v.imagealt2));
	      if (v.imagealt3) out.push(' | imagealt3=' + esc(v.imagealt3));
	      if (v.imagealt4) out.push(' | imagealt4=' + esc(v.imagealt4));
	      if (v.imagelink) out.push(' | imagelink=' + esc(v.imagelink));
	      if (v.jpshops) out.push(' | jpshops=' + esc(v.jpshops));
	      if (v.shops) out.push(' | shops=' + esc(v.shops));
	      if (v.streams) out.push(' | streams=' + esc(v.streams));
	      if (v.spotifyalbumid) out.push(' | spotifyalbumid=' + esc(v.spotifyalbumid));
	      if (v.crossfadeyt) out.push(' | crossfadeyt=' + esc(v.crossfadeyt));
	      if (v.ytxfddesc) out.push(' | ytxfddesc=' + esc(v.ytxfddesc));
	      if (v.crossfadennd) out.push(' | crossfadennd=' + esc(v.crossfadennd));
	      if (v.nndxfddesc) out.push(' | nndxfddesc=' + esc(v.nndxfddesc));
	      if (v.trackcolwidth) out.push(' | trackcolwidth=' + esc(v.trackcolwidth));
	      if (v.titlecolwidth) out.push(' | titlecolwidth=' + esc(v.titlecolwidth));
	      if (v.detailscolwidth) out.push(' | detailscolwidth=' + esc(v.detailscolwidth));
	      if (v.utaitecolwidth) out.push(' | utaitecolwidth=' + esc(v.utaitecolwidth));
	      if (v.lyricistcolwidth) out.push(' | lyricistcolwidth=' + esc(v.lyricistcolwidth));
	      if (v.composercolwidth) out.push(' | composercolwidth=' + esc(v.composercolwidth));
	      if (v.arrangercolwidth) out.push(' | arrangercolwidth=' + esc(v.arrangercolwidth));
	      out.push(' | tracks=');
	
	      for (var k = 0; k < v.tracks.length; k++) {
	        var t = v.tracks[k];
	        out.push('{{' + T_DT + '|' + esc(t.tracknum));
	        if (m.artist) out.push('|artist=' + esc(m.artist));
	        out.push('|albumid=' + esc(v.albumid || a.albumid));
	        out.push('|variantkey=' + esc(v.variantkey));
	        if (t.title) out.push('|title=' + esc(t.title));
	        if (t.additionalshortinfo) out.push('|additionalshortinfo=' + esc(t.additionalshortinfo));
	        if (t.singers) out.push('|singers=' + esc(t.singers));
	        if (t.lyricist) out.push('|lyricist=' + esc(t.lyricist));
	        if (t.composer) out.push('|composer=' + esc(t.composer));
	        if (t.arranger) out.push('|arranger=' + esc(t.arranger));
	        out.push('}}');
	      }
	
	      out.push('}}'); // end variant
	    }
	
	    out.push('}}'); // end album
	    out.push('');
	  }
	
	  return out.join('\n');
	}

  // Init
  mw.loader.using(['mediawiki.api', 'mediawiki.util']).then(addButton);
})(mw, jQuery);