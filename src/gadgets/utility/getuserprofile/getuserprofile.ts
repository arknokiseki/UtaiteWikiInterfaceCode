/**
 * Avatar Fetcher Gadget
 * Scans for .useravatar-container elements, places placeholders, 
 * and batches API requests to fetch real avatars.
 */

interface UserProfileItem {
    name: string;
    'profile-avatar': string; // Key specific to SocialProfile/queryuserprofilev2
    [key: string]: unknown;
}

interface ApiUserProfileResponse {
    query?: {
        queryuserprofilev2?: UserProfileItem[];
    };
}

interface MwApi {
    get: (params: Record<string, unknown>) => JQuery.Promise<ApiUserProfileResponse>;
}

declare const mw: {
    hook: (name: string) => {
        add: (handler: (content: JQuery<HTMLElement>) => void) => void;
    };
    Api: new () => MwApi;
    loader: {
        using: (modules: string[]) => JQuery.Promise<void>;
    };
};

declare const mediaWiki: typeof mw;

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    const BATCH_SIZE = 50;

    // Map username to list of jQuery elements waiting for that avatar
    type UserMap = Record<string, JQuery<HTMLElement>[]>;

    /**
     * Fetches avatar URLs for a batch of users and updates the DOM.
     */
    function fetchAvatars(userList: string[], userMap: UserMap): void {
        const api = new mw.Api();

        api.get({
            action: 'query',
            format: 'json',
            list: 'queryuserprofilev2',
            us_users: userList.join('|')
        }).then(function (data: ApiUserProfileResponse): void {
            if (!data.query || !data.query.queryuserprofilev2) return;

            // Use requestAnimationFrame to batch DOM updates for performance
            requestAnimationFrame(function (): void {
                const results = data.query?.queryuserprofilev2 || [];

                results.forEach(function (userData: UserProfileItem): void {
                    const name = userData.name;
                    const avatarUrl = userData['profile-avatar'];

                    if (avatarUrl && userMap[name]) {
                        userMap[name].forEach(function ($el: JQuery<HTMLElement>): void {
                            const $img = $el.find('img');
                            // Update src and remove loading class
                            $img.attr('src', avatarUrl).removeClass('useravatar-loading');
                        });
                        // Clean up map entry
                        delete userMap[name]; 
                    }
                });
            });
        }).catch(function (err: unknown): void {
            console.error('Avatar batch failed', err);
        });
    }

    /**
     * Main processor called on page load or content refresh (e.g., Live Preview)
     */
    function processAvatars($content: JQuery<HTMLElement>): void {
        const $containers = $content.find('.useravatar-container').not('.processed');
        if ($containers.length === 0) return;

        $containers.addClass('processed');

        const userMap: UserMap = {};
        const uniqueUsers: string[] = [];

        $containers.each(function (): void {
            const $el = $(this);
            const username = $el.data('username') as string | undefined;

            if (!username) return;

            if (!userMap[username]) {
                userMap[username] = [];
                uniqueUsers.push(username);
            }
            userMap[username].push($el);

            const size = ($el.data('size') as number) || 138;
            const radius = ($el.data('radius') as string) || '50%';

            // Create placeholder immediately
            const $placeholder = $('<img>', {
                src: 'https://static.wikitide.net/utaitewiki/e/e6/Site-logo.png',
                class: 'useravatar-img useravatar-loading',
                alt: username
            }).css({
                width: size + 'px',
                height: size + 'px',
                borderRadius: radius,
                display: 'inline-block',
                verticalAlign: 'middle'
            });

            $el.empty().append($placeholder);
        });

        // Batch requests
        for (let i = 0; i < uniqueUsers.length; i += BATCH_SIZE) {
            const batch = uniqueUsers.slice(i, i + BATCH_SIZE);
            fetchAvatars(batch, userMap);
        }
    }

    // Ensure API module is loaded before attaching hook
    mw.loader.using(['mediawiki.api']).then(function (): void {
        mw.hook('wikipage.content').add(processAvatars);
    });

})(mediaWiki, jQuery);