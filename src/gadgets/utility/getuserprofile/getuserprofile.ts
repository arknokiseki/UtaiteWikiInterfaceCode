// @keep-use-strict: live runs this strict (see plugins/preserve-use-strict.ts)
"use strict";
/**
 * Avatar Fetcher Gadget
 * Scans for .useravatar-container elements, shows a placeholder, then swaps in each
 * user's UserProfileV2 avatar.
 *
 * list=queryuserprofilev2 (extension UserProfileV2) takes exactly ONE user per request
 * (param `user_name`). It has no batch mode: `us_users` doesn't exist (-> missingparam)
 * and a pipe-separated user_name crashes the API. So: one request per unique user, a few
 * at a time, cached for the browser session. Unknown users simply keep the placeholder.
 */
(function (mw, $) {
    'use strict';
    // Site logo as a thumbnail: the original is 1106px wide, far too big for a 20px avatar
    const PLACEHOLDER_THUMB = 'https://static.wikitide.net/utaitewiki/thumb/e/e6/Site-logo.png/';
    const MAX_PARALLEL = 4;
    const CACHE_KEY = 'utaite-useravatar-v1';
    // username -> avatar URL, or '' when the user has none / doesn't exist here
    const cache = loadCache();
    // username -> elements still waiting for that avatar
    const waiting = {};
    const queue: any = [];
    let running = 0;
    function loadCache() {
        try {
            return JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
        }
        catch (e) {
            return {};
        }
    }
    function saveCache() {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        }
        catch (e) {
            // storage full or blocked: the in-memory cache still works for this page
        }
    }
    function extractAvatar(data: any) {
        const q = data && data.query;
        const item = Array.isArray(q) ? q[0] : (q && q.queryuserprofilev2 ? q.queryuserprofilev2[0] : undefined);
        let url = item && typeof item['profile-avatar'] === 'string' ? item['profile-avatar'] : '';
        if (url.indexOf('//') === 0) {
            url = 'https:' + url;
        }
        return url;
    }
    function apply(username: any) {
        const url = cache[username];
        const $els = (waiting as any)[username] || [];
        delete (waiting as any)[username];
        requestAnimationFrame(function () {
            $els.forEach(function ($el: any) {
                const $img = $el.find('img').removeClass('useravatar-loading');
                // data-fallback ({{GetUserAvatar|fallback=File.png}}) covers users with no
                // account here, or only the extension's default avatar
                const fallback = String($el.data('fallback') || '');
                const src = url && !/\/default\.png(\?|$)/.test(url) ? url : (fallback || url);
                if (src) {
                    $img.attr('src', src); // otherwise the placeholder logo stays
                }
            });
        });
    }
    function pump() {
        while (running < MAX_PARALLEL && queue.length) {
            const username = queue.shift();
            running++;
            new mw.Api().get({
                action: 'query',
                format: 'json',
                list: 'queryuserprofilev2',
                user_name: username
            }).then(function (data) {
                cache[username] = extractAvatar(data);
            }, function (code) {
                // e.g. userprofilev2-apierror-invalidusername: no local account with that name.
                // Remember it so we don't ask again this session; not worth a console error.
                cache[username] = '';
                console.debug('[getuserprofile] no avatar for', username, code);
            }).always(function () {
                running--;
                saveCache();
                apply(username);
                pump();
            });
        }
    }
    function processAvatars($content: any) {
        const $containers = $content.find('.useravatar-container').not('.processed');
        if ($containers.length === 0)
            return;
        $containers.addClass('processed');
        $containers.each(function () {
            const $el = $(this);
            const username = String($el.data('username') || '').trim();
            if (!username)
                return;
            const size = $el.data('size') || 138;
            const radius = $el.data('radius') || '50%';
            const $placeholder = $('<img>', {
                src: PLACEHOLDER_THUMB + (size <= 80 ? '80px' : '160px') + '-Site-logo.png',
                class: 'useravatar-img useravatar-loading',
                alt: username
            }).css({
                width: size + 'px',
                height: size + 'px',
                borderRadius: radius,
                display: 'inline-block',
                verticalAlign: 'middle',
                objectFit: 'cover'
            });
            $el.empty().append($placeholder);
            const isNew = !(waiting as any)[username];
            ((waiting as any)[username] = (waiting as any)[username] || []).push($el);
            if (Object.prototype.hasOwnProperty.call(cache, username)) {
                apply(username);
            }
            else if (isNew && queue.indexOf(username) === -1) {
                queue.push(username);
            }
        });
        pump();
    }
    // Ensure API module is loaded before attaching hook
    mw.loader.using(['mediawiki.api']).then(function () {
        mw.hook('wikipage.content').add(processAvatars);
    });
})(mediaWiki, jQuery);

export {};
