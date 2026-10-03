// @keep-use-strict: live runs this strict (see plugins/preserve-use-strict.ts)
/**
 * gadget-SonglistRenderer.js
 * Client-side renderer for Songlist JSON data.
 */
(function (mw, _$) {
    'use strict';

    // Video-ID templates → rendered as icon links inside notes/text fields
    const VIDEO_TEMPLATES = {
        'YT':  {
            url: (id: any) => `https://youtu.be/${id}`,
            icon: '<i class="fa-brands fa-youtube" style="color:#d20438"></i>'
        },
        'NND': {
            url: (id: any) => `https://www.nicovideo.jp/watch/${id}`,
            icon: '<i class="uw-icon uw-nicovideo"></i>'
        },
        'BB':  {
            url: (id: any) => `https://www.bilibili.com/video/${id}/`,
            icon: '<i class="fa-brands fa-bilibili" style="color:#74C0FC"></i>'
        },
    };

    // Interwiki registry matching your templates
    const INTERWIKI_TEMPLATES = {
        'VLW': { server: 'miraheze', wiki: 'vocaloidlyrics' },
        'VW': { server: 'fandom', wiki: 'vocaloid' },
        'VYW': { server: 'fandom', wiki: 'virtualyoutuber' },
        'VTW': { server: 'fandom', wiki: 'virtualyoutuber' },
        'JPOP': { server: 'fandom', wiki: 'jpop' },
        'KPOP': { server: 'fandom', wiki: 'kpop' },
        'ULW': { server: 'fandom', wiki: 'utaulyrics' },
        'SVW': { server: 'fandom', wiki: 'synthv' },
        'PSW': { server: 'fandom', wiki: 'vocaloid' },
        'OW': { server: 'fandom', wiki: 'odorite' },
        'CW': { server: 'fandom', wiki: 'cevio' },
        'DVW': { server: 'fandom', wiki: 'deepvocal' }
    };

    // Note templates: JS replicas of the server-side {{Twitter}}, {{TH}}, {{UT}}
    // and {{YTB}} templates, so notes render in the client-side desktop table
    // the same way the real parser renders them on mobile. Each receives
    // (arg1, arg2) captured from {{Name|arg1|arg2}}.
    const NOTE_TEMPLATES = {
        // {{Twitter|handle|tooltip}} → twitter icon linking to x.com/handle
        'TWITTER': function (a1: any, a2: any) {
            const handle = (a1 || '').trim();
            const link = '<a href="https://x.com/' + encodeURIComponent(handle) +
                '" class="external" target="_blank" rel="noopener noreferrer">' +
                '<span class="icon-link"><i class="fa-brands fa-twitter"></i></span></a>';
            return a2
                ? '<span><abbr title="' + escapeHtml(a2) + '">' + link + '</abbr></span>'
                : '<span>' + link + '</span>';
        },
        // {{TH|page|display}} → external link to en.touhouwiki.net
        'TH': function (a1: any, a2: any) {
            const page = (a1 || '').trim().replace(/ /g, '_');
            const disp = a2 || a1 || '';
            return '<a href="http://en.touhouwiki.net/wiki/' + encodeURI(page) +
                '" class="external" target="_blank" rel="noopener noreferrer">' +
                escapeHtml(disp) + '</a>';
        },
        // {{UT|name|part}} → (Part of the [[Utattemita Tours/part|name]])
        'UT': function (a1: any, a2: any) {
            const page = 'Utattemita Tours' + (a2 ? '/' + a2 : '');
            return '(Part of the <a href="' + escapeHtml(mw.util.getUrl(page)) +
                '">' + escapeHtml(a1 || '') + '</a>)';
        },
        // {{YTB|page}} → (Entry of the [[page]])
        'YTB': function (a1: any) {
            return '(Entry of the <a href="' + escapeHtml(mw.util.getUrl(a1 || '')) +
                '">' + escapeHtml(a1 || '') + '</a>)';
        }
    };

    // Icons for other streaming services.
    // fa: FontAwesome brand class + optional color
    // uw: UW icon set slug (renders as uw-icon uw-<slug>)
    // If a service is not listed, falls back to a generic link icon.
    // Object.create(null): service_name comes from page-editable JSON, so a
    // plain object literal would let "constructor" / "__proto__" resolve to
    // inherited members and emit class="uw-undefined" (or, for
    // DISABLED_SERVICES, call an unintended function on user data).
    const SERVICE_ICONS = Object.assign(Object.create(null), {
        soundcloud:  { fa: 'fa-soundcloud',  color: '#ff7700' },
        spotify:     { fa: 'fa-spotify',     color: '#1DB954' },
        tiktok:      { fa: 'fa-tiktok',      color: null },
        bandcamp:    { fa: 'fa-bandcamp',     color: '#1da0c3' },
        applemusic:  { fa: 'fa-apple',        color: '#FC3C44' },
        amazonmusic: { fa: 'fa-amazon',       color: '#00A8E1' },
        koebu:       { uw: 'koebu' },
        tmbox:       { uw: 'tmbox' },
        twitcast:    { uw: 'twitcast' },
    });

    // Services whose links are dead: render the icon with no link, and show
    // the video/playlist id on hover instead. Mirrors the {{External}} template
    // with |disabled=true. Value = function extracting the id from video_link.
    const DISABLED_SERVICES = Object.assign(Object.create(null), {
        tmbox: (link: any) => {
            const m = /tmbox\.net\/pl\/([^/?#]+)/i.exec(link || '');
            return m ? m[1] : (link || '');
        },
    });

    // Scheme allowlist for anything that becomes an href. escapeHtml() stops a
    // value breaking OUT of the attribute, but does nothing about the scheme --
    // "javascript:alert(1)" survives it intact and is clickable. video_link is
    // free-form, page-editable JSON, so it must be checked here.
    const SAFE_URL = /^https?:\/\//i;

    function renderOtherService(svc: any) {
        svc = svc || {};
        const rawLink = svc.video_link || '';
        const name = String(svc.service_name || '').toLowerCase();
        const info = SERVICE_ICONS[name];

        let iconHtml;
        if (!info) {
            iconHtml = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
        } else if (info.fa) {
            const style = info.color ? ` style="color:${info.color}"` : '';
            iconHtml = `<i class="fa-brands ${info.fa}"${style}></i>`;
        } else {
            iconHtml = `<i class="uw-icon uw-${info.uw}"></i>`;
        }

        // Defunct service (e.g. TmBox): keep the icon, drop the dead link,
        // show the id on hover.
        if (DISABLED_SERVICES[name]) {
            const id = DISABLED_SERVICES[name](rawLink);
            return `<abbr class="no-external" title="${escapeHtml(id)}">${iconHtml}</abbr>`;
        }

        // Not an http(s) url: render the icon unlinked with the value on hover.
        // Covers javascript:/data: as well as the four koebu rows that store a
        // bare sha1 id instead of a url -- those were previously emitted as a
        // broken <a href="ba4c8a...">, so this is also a correctness fix.
        if (!SAFE_URL.test(rawLink)) {
            return `<abbr class="no-external" title="${escapeHtml(rawLink)}">${iconHtml}</abbr>`;
        }

        return `<abbr class="no-external" title="${escapeHtml(svc.service_name || 'link')}"><a href="${escapeHtml(rawLink)}" target="_blank" rel="noopener noreferrer">${iconHtml}</a></abbr>`;
    }

    function escapeHtml(str: any) {
        return (String(str || '').replace as any)(/[&<>"']/g, function (m: any) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[m];
        });
    }

    /*
     * Bold/italic has to be resolved BEFORE the segment walk below, because a
     * span routinely straddles a match boundary -- ''{{Wp|Bocchi the Rock!}}''
     * is 17 of the 43 marked-up notes in the corpus. But the walk runs
     * escapeHtml() over every plain slice, so the <b>/<i> this step used to
     * insert came back out as literal text: desktop showed the tags while the
     * server-side Lua path rendered them properly (F6).
     *
     * Park the tags on private-use sentinels instead. escapeHtml() does not
     * touch U+E000..U+E003, so they survive the walk intact and escapeText()
     * turns them into real tags once escaping is done -- which also means a
     * span that opens before a template and closes after it still works, since
     * each half lands in its own plain slice.
     */
    const MARK_B0 = '\uE000', MARK_B1 = '\uE001';
    const MARK_I0 = '\uE002', MARK_I1 = '\uE003';
    const SENTINELS = /[\uE000-\uE003]/g;

    // Escape a plain-text slice, then promote the sentinels it carries. Only
    // ever called on text that sits OUTSIDE a wikitext construct.
    function escapeText(str: any) {
        return escapeHtml(str)
            .replace(/\uE000/g, '<b>').replace(/\uE001/g, '</b>')
            .replace(/\uE002/g, '<i>').replace(/\uE003/g, '</i>');
    }

    // Single-pass segment walk replacing templates, piped links, plain links, and external links
    function parseWikiMarkup(text: any) {
        if (!text) return '';
        // Strip HTML comments, drop any sentinel the source smuggled in (else a
        // note could emit its own <b>), then park the wikitext markup.
        text = text
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(SENTINELS, '')
            .replace(/'{5}(.+?)'{5}/g, MARK_B0 + MARK_I0 + '$1' + MARK_I1 + MARK_B1)
            .replace(/'{3}(.+?)'{3}/g, MARK_B0 + '$1' + MARK_B1)
            .replace(/'{2}(.+?)'{2}/g, MARK_I0 + '$1' + MARK_I1);
        const regex = /\{\{([^|{}\n]+)\|([^|{}\n]+)(?:\|([^|{}\n]*))?\}\}|\[\[([^\]|]+)\|([^\]]+)\]\]|\[\[([^\]|]+)\]\]|\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g;

        let result = '';
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            result += escapeText(text.slice(lastIndex, match.index));
            lastIndex = regex.lastIndex;

            if (match[1]) {
                const tpl = match[1].toUpperCase();
                const arg1 = match[2];
                const arg2 = match[3];
                const vid = (VIDEO_TEMPLATES as any)[tpl];
                const iw = (INTERWIKI_TEMPLATES as any)[tpl];
                if (vid) {
                    const id = arg1.trim();
                    const url = escapeHtml(vid.url(id));
                    const label = escapeHtml(arg2 || id);
                    result += `<abbr class="no-external" title="${label}"><a href="${url}" target="_blank" rel="noopener noreferrer">${vid.icon}</a></abbr>`;
                } else if (iw) {
                    const slug = arg1.replace(/ /g, '_');
                    const display = arg2 || arg1.replace(/-P /g, 'P ');
                    const url = iw.server === 'miraheze' ? `https://${iw.wiki}.miraheze.org/wiki/${slug}` : `https://${iw.wiki}.fandom.com/wiki/${slug}`;
                    const tooltip = `${display} on ${iw.server === 'miraheze' ? "Miraheze's" : "Fandom's"} ${iw.wiki} Wiki`;
                    result += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><abbr title="${escapeHtml(tooltip)}">${escapeHtml(display)}</abbr></a>`;
                } else if ((NOTE_TEMPLATES as any)[tpl]) {
                    result += (NOTE_TEMPLATES as any)[tpl](arg1, arg2);
                } else {
                    result += escapeHtml(match[0]);
                }
            } else if (match[4]) {
                result += `<a href="${escapeHtml(mw.util.getUrl(match[4]))}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[5])}</a>`;
            } else if (match[6]) {
                result += `<a href="${escapeHtml(mw.util.getUrl(match[6]))}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[6])}</a>`;
            } else if (match[7]) {
                result += `<a href="${escapeHtml(match[7])}" class="external" target="_blank" rel="noopener noreferrer">${escapeHtml(match[8])}</a>`;
            }
        }
        result += escapeText(text.slice(lastIndex));
        // Any sentinel still standing sat inside a link target or label, where
        // promoting it would push a tag into an href. Drop those.
        return result.replace(SENTINELS, '');
    }

    // ── Deleted / Privated badges ────────────────────────────────────────
    // Must stay byte-identical to Template:Deleted media and
    // Template:Privated media. This path has no wikitext parser, so it cannot
    // call them -- it inlines the same markup, exactly as ✨Original and
    // 🔁Self-cover do. tests/renderer.test.js compares the two.
    //
    // The templates test each site independently, so they emit yt before nnd
    // before bb whatever order |site= listed them in. Iterate SITE_ORDER, not
    // the row's array, or a row saved as ["nnd","yt"] renders reversed here
    // and in template order on mobile.
    const SITE_ORDER = ['yt', 'nnd', 'bb'];

    const NND_ICON = '<span class="niconico-icon nnd-link" style="width: 19px; height: 17px;"></span>';
    const BB_ICON = '<i class="fa-brands fa-bilibili" style="color: #74C0FC;"></i>';

    // The two templates differ only on YouTube: Deleted's icon carries fa-lg
    // and Privated's does not. That asymmetry is live on the wiki, so it is
    // copied rather than corrected -- normalising it would resize a badge
    // that renders fine today.
    const MEDIA_BADGES = {
        deleted: {
            cls: 'deleted-media-badge',
            word: 'Deleted',
            icons: { yt: '<i class="fa-brands fa-youtube fa-lg"></i>', nnd: NND_ICON, bb: BB_ICON }
        },
        privated: {
            cls: 'privated-media-badge',
            word: 'Privated',
            icons: { yt: '<i class="fa-brands fa-youtube"></i>', nnd: NND_ICON, bb: BB_ICON }
        }
    };

    /**
     * Render the Deleted or Privated badge for a row.
     *
     * @param {string} kind    'deleted' or 'privated'
     * @param {?string[]} sites affected site keys, in any order. Unknown keys
     *                          are ignored, matching {{#pos:}} finding nothing;
     *                          a missing or empty array gives a bare badge with
     *                          no icon, matching a plain {{Deleted media}}.
     * @returns {string} HTML
     */
    function renderMediaBadge(kind: any, sites: any) {
        const badge = (MEDIA_BADGES as any)[kind];
        const affected = sites || [];
        const icons = SITE_ORDER
            .filter(key => affected.indexOf(key) !== -1)
            .map(key => badge.icons[key])
            .join('');
        return `<span class="${badge.cls} select-none">${icons}&nbsp;${badge.word}</span>`;
    }

    (window as any).SonglistRenderer = {
        parseWikiMarkup: parseWikiMarkup,
        renderMediaBadge: renderMediaBadge,
        renderOtherService: renderOtherService,
        getOptions: function ($table: any) {
            let jsonPage = $table.attr('data-json');
            if (!jsonPage) {
                const root = (mw.config.get('wgTitle') || '').split('/')[0];
                jsonPage = root + '/Songs/songs.json';
            }

            return {
                ajax: {
                    url: mw.util.getUrl(jsonPage, { action: 'raw', ctype: 'application/json' }),
                    dataSrc: ''
                },
                columns: [
                    {
                        data: null,
                        render: (_data: any, _type: any, _row: any, meta: any) => meta.row + 1
                    },
                    {
                        data: 'title',
                        render: function (data: any, _type: any, row: any) {
                            let s = `<span class="slcrud-title-text">${parseWikiMarkup(data || '(untitled)')}</span>`;
                            if (row.version) s += `&#160;<small>-${escapeHtml(row.version)} ver.-</small>`;
                            if (row.title_translation) s += `<br/><small>(${escapeHtml(row.title_translation)})</small>`;
                            if (row.title_note) s += `<br/><small>${escapeHtml(row.title_note)}</small>`;
                            return s;
                        }
                    },
                    {
                        data: null,
                        render: function (_data: any, _type: any, row: any) {
                            let parts = [];
                            if (row.youtube_id) {
                                const id = row.youtube_id;
                                parts.push(`<span class="video-link yt-link" data-yt-id="${escapeHtml(id)}" style="color:#d20438"><abbr class="no-external" title="&nbsp;${escapeHtml(id)}"><a href="https://youtu.be/${escapeHtml(id)}" target="_blank" rel="noopener noreferrer" style="color: inherit;"><i class="fa-brands fa-youtube"></i></a></abbr></span>`);
                            } else {
                                parts.push(`<span class="video-link yt-link pointer-events-none dead-icon-link" style="color: #d0d0d0 !important; opacity: 0.7;"><i class="fa-brands fa-youtube"></i></span>`);
                            }

                            if (row.niconico_id) {
                                const id = row.niconico_id;
                                parts.push(`<abbr class="no-external" title="&nbsp;${escapeHtml(id)}"><span class="nnd-link" data-nnd-id="${escapeHtml(id)}"><a href="https://www.nicovideo.jp/watch/${escapeHtml(id)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color);"><i class="uw-icon uw-nicovideo uw-lg"></i></a></span></abbr>`);
                            } else {
                                parts.push(`<i class="uw-icon uw-nicovideo uw-lg pointer-events-none" style="color: #d0d0d0 !important; opacity: 0.7;"></i>`);
                            }

                            if (row.bilibili_id) {
                                const id = row.bilibili_id;
                                parts.push(`<abbr class="no-external" title="&nbsp;${escapeHtml(id)}"><a href="https://www.bilibili.com/video/${escapeHtml(id)}/" target="_blank" rel="noopener noreferrer" style="color: #74C0FC;"><i class="fa-brands fa-bilibili"></i></a></abbr>`);
                            }
                            if (row.other_services && row.other_services.length) {
                                row.other_services.forEach(function (svc: any) {
                                    parts.push(renderOtherService(svc));
                                });
                            }
                            return parts.join('');
                        }
                    },
                    {
                        data: 'featured_artists',
                        render: function (data: any) {
                            if (!data || data.length === 0) return '&ndash;';
                            return data.map((artist: any) => `<span class="orikyoku-badge__featuring">${parseWikiMarkup(artist)}</span>`).join('');
                        }
                    },
                    {
                        data: null,
                        render: function (_data: any, _type: any, row: any) {
                            let parts = [];
                            if (row.is_original) {
                                parts.push('<span class="orikyoku-badge">✨Original</span>');
                                (row.orikyoku_with || []).forEach(function (w: any) {
                                    if (w) parts.push(`<span class="orikyoku-badge__with">${parseWikiMarkup(w)}</span>`);
                                });
                            }
                            // Must stay byte-identical to Template:Self cover.
                            // This path has no parser, so it cannot call the
                            // template -- it inlines the same markup, exactly
                            // as ✨Original and the Deleted/Privated badges do.
                            // tests/renderer.test.js compares the two.
                            if (row.is_self_cover) parts.push('<span class="self-cover-badge select-none">🔁Self-cover</span>');

                            (row.notes || []).forEach((n: any) => {
                                if (!n) return;
                                const r = parseWikiMarkup(n);
                                // {{UT}}/{{YTB}} etc. already emit their own
                                // (parentheses); don't double-wrap those.
                                parts.push(/^\(.*\)$/.test(r) ? r : `(${r})`);
                            });

                            const isDeleted = (row.deleted_sites && row.deleted_sites.length > 0) || row.status === 'deleted';
                            if (isDeleted) parts.push(renderMediaBadge('deleted', row.deleted_sites));

                            const isPrivated = (row.privated_sites && row.privated_sites.length > 0) || row.status === 'private';
                            if (isPrivated) parts.push(renderMediaBadge('privated', row.privated_sites));

                            return parts.length > 0 ? parts.join('<br/>') : 'N/A';
                        }
                    },
                    {
                        data: 'upload_date',
                        render: function (data: any) {
                            const raw = data;
                            const isUnknown = !raw || raw === '' || raw === 'N/A' || raw === '-' || raw.toLowerCase() === 'unknown';
                            return isUnknown ? 'N/A' : escapeHtml(raw);
                        }
                    }
                ]
            };
        }
    };
})(mediaWiki, jQuery);

export {};
