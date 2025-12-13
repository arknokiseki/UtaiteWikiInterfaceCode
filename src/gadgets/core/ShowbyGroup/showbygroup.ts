declare const mw: {
    config: {
        get: (key: string) => string | string[] | null;
    };
};

(function (): void {
    'use strict';

    $(function (): void {
        const userGroups = (mw.config.get('wgUserGroups') as string[] | null) || [];
        const userName = mw.config.get('wgUserName') as string | null;
        const $body = $('body');

        const hierarchy: string[] = [
            'user',
            'autoconfirmed',
            'confirmed',
            'member',
            'content-moderator',
            'sysop',
            'interface-admin',
            'bureaucrat'
        ];

        if (userName) {
            $body.addClass('user-status-loggedin');

            let maxIndex = 0;
            userGroups.forEach(function (g: string): void {
                const idx = hierarchy.indexOf(g);
                if (idx > maxIndex) maxIndex = idx;
            });

            for (let i = 0; i <= maxIndex; i++) {
                $body.addClass('user-level-' + hierarchy[i]);
            }

            userGroups.forEach(function (g: string): void {
                $body.addClass('user-group-' + g);
            });

            if (maxIndex >= hierarchy.indexOf('sysop')) {
                $body.addClass('user-is-admin');
            }
        } else {
            $body.addClass('user-status-anonymous');
        }
    });
})();