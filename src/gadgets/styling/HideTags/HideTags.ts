// @keep-use-strict: live runs this strict (see plugins/preserve-use-strict.ts)
mw.loader.using(['mediawiki.util']).then(function () {
    'use strict';

    const exactTags = [
        'autopatrolled',
        'commentadmin',
        'csmoderator'
    ];

    const prefixTags = [
        'smw'
    ];

    const selectors = [
        ...exactTags.map(tag => `.profile-user-group[data-group="${tag}"]`),
        ...prefixTags.map(prefix => `.profile-user-group[data-group^="${prefix}"]`)
    ];

    if (selectors.length > 0) {
        mw.util.addCSS(`
            ${selectors.join(',\n')} {
                display: none !important;
            }
        `);
    }
});

export {};
