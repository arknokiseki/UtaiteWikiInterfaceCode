/**
 * UserLinks Template JavaScript Handler
 * v1.0.1 — blog -> User blog:{username}
 */

interface MwApi {
    get: (params: Record<string, unknown>) => JQuery.Promise<QueryResponse>;
}

interface QueryResponse {
    query: {
        pages: Array<{
            missing?: boolean;
        }>;
    };
}

interface UserLinksHandler {
    init: () => void;
    processUsernameElements: () => void;
    enableTestMode: () => void;
    getCurrentUser: () => string | null;
    isAnonymous: () => boolean;
}

declare const mw: {
    config: {
        get: (key: string) => string | boolean | null;
    };
    util: {
        getUrl: (page: string) => string;
    };
    html: {
        escape: (text: string) => string;
    };
    Api?: new () => MwApi;
};

declare global {
    interface Window {
        userLinksTestMode?: boolean;
        userLinksHandler?: UserLinksHandler;
    }
}

(function (): void {
    'use strict';

    // Wait for DOM to be ready
    function ready(fn: () => void): void {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    // Get current user information
    function getCurrentUser(): string | null {
        return mw.config.get('wgUserName') as string | null;
    }

    // Check if user is anonymous
    function isAnonymous(): boolean {
        return getCurrentUser() === null;
    }

    // Create proper wiki link
    function createWikiLink(page: string, text: string): string {
        return '<a href="' + mw.util.getUrl(page) + '">' + mw.html.escape(text) + '</a>';
    }

    // Enhanced page existence check using MediaWiki API
    function enhancedCheckPageExists(pageName: string, callback: (exists: boolean) => void): void {
        if (typeof mw.Api === 'undefined') {
            // Fallback if API is not available
            callback(true);
            return;
        }

        const api = new mw.Api();
        api.get({
            action: 'query',
            titles: pageName,
            formatversion: 2
        })
            .done(function (data: QueryResponse): void {
                const page = data.query.pages[0];
                callback(!page.missing);
            })
            .fail(function (): void {
                // On failure, assume page exists
                callback(true);
            });
    }

    // Process username elements
    function processUsernameElements(): void {
        const username = getCurrentUser();
        const isAnon = isAnonymous();

        // Handle anonymous users
        if (isAnon || !username) {
            // Plain username
            const plainElements = document.querySelectorAll('.username-plain');
            for (let i = 0; i < plainElements.length; i++) {
                plainElements[i].textContent = 'anonymous user';
            }

            // Profile link
            const profileElements = document.querySelectorAll('.username-wikilink');
            for (let i = 0; i < profileElements.length; i++) {
                profileElements[i].textContent = 'anonymous user';
            }

            // Blog links - anonymous users don't have blog pages
            const blogElements = document.querySelectorAll('.username-blog');
            for (let i = 0; i < blogElements.length; i++) {
                blogElements[i].textContent = 'Blog';
            }

            const blogFullElements = document.querySelectorAll('.username-blog-full');
            for (let i = 0; i < blogFullElements.length; i++) {
                blogFullElements[i].textContent = 'Blog';
            }

            const customBlogLinkElements = document.querySelectorAll('.username-blog-link');
            for (let i = 0; i < customBlogLinkElements.length; i++) {
                customBlogLinkElements[i].textContent =
                    customBlogLinkElements[i].textContent || 'Blog';
            }

            // Contributions
            const contribElements = document.querySelectorAll('.username-contribs');
            for (let i = 0; i < contribElements.length; i++) {
                contribElements[i].textContent = 'contributions';
            }

            const contribFullElements = document.querySelectorAll('.username-contribs-full');
            for (let i = 0; i < contribFullElements.length; i++) {
                contribFullElements[i].textContent = 'contributions';
            }

            // Full profile links
            const profileLinksElements = document.querySelectorAll('.username-profile-links');
            for (let i = 0; i < profileLinksElements.length; i++) {
                profileLinksElements[i].textContent = 'Profile • Blog • Contributions';
            }

            const profileLinksParsedElements = document.querySelectorAll(
                '.username-profile-links-parsed'
            );
            for (let i = 0; i < profileLinksParsedElements.length; i++) {
                profileLinksParsedElements[i].textContent = 'Profile • Blog • Contributions';
            }

            return;
        }

        // Handle logged-in users
        const userPage = 'User:' + username;
        const userContribPage = 'Special:Contributions/' + username;
        // NEW: blog page uses "User blog:{username}"
        const userBlogPage = 'User blog:' + username;

        // Plain username
        const plainElements = document.querySelectorAll('.username-plain');
        for (let i = 0; i < plainElements.length; i++) {
            plainElements[i].textContent = username;
        }

        // Profile link
        const profileElements = document.querySelectorAll('.username-wikilink');
        for (let i = 0; i < profileElements.length; i++) {
            profileElements[i].innerHTML = createWikiLink(userPage, username);
        }

        // Blog links (checks for existence of User blog:{username})
        const blogElements = document.querySelectorAll('.username-blog');
        for (let i = 0; i < blogElements.length; i++) {
            (function (el: Element): void {
                enhancedCheckPageExists(userBlogPage, function (exists: boolean): void {
                    if (exists) {
                        el.innerHTML = createWikiLink(userBlogPage, 'Blog');
                    } else {
                        (el as HTMLElement).style.display = 'none';
                    }
                });
            })(blogElements[i]);
        }

        const blogFullElements = document.querySelectorAll('.username-blog-full');
        for (let i = 0; i < blogFullElements.length; i++) {
            (function (el: Element): void {
                enhancedCheckPageExists(userBlogPage, function (exists: boolean): void {
                    if (exists) {
                        el.innerHTML = createWikiLink(userBlogPage, username + ' Blog');
                    } else {
                        (el as HTMLElement).style.display = 'none';
                    }
                });
            })(blogFullElements[i]);
        }

        // Custom blog link (uses element text as label, always link)
        const customBlogLinkElements = document.querySelectorAll('.username-blog-link');
        for (let i = 0; i < customBlogLinkElements.length; i++) {
            (function (el: Element): void {
                const label = el.textContent || 'Blog';
                el.innerHTML = createWikiLink(userBlogPage, label);
            })(customBlogLinkElements[i]);
        }

        // Contributions
        const contribElements = document.querySelectorAll('.username-contribs');
        for (let i = 0; i < contribElements.length; i++) {
            contribElements[i].innerHTML = createWikiLink(userContribPage, 'contributions');
        }

        const contribFullElements = document.querySelectorAll('.username-contribs-full');
        for (let i = 0; i < contribFullElements.length; i++) {
            contribFullElements[i].innerHTML = createWikiLink(
                userContribPage,
                username + ' contributions'
            );
        }

        // Full profile links (basic)
        const profileLinksElements = document.querySelectorAll('.username-profile-links');
        for (let i = 0; i < profileLinksElements.length; i++) {
            const profileLink = createWikiLink(userPage, 'Profile');
            const blogLink = createWikiLink(userBlogPage, 'Blog');
            const contribLink = createWikiLink(userContribPage, 'Contributions');

            profileLinksElements[i].innerHTML = profileLink + ' • ' + blogLink + ' • ' + contribLink;
        }

        // Full profile links (parsed)
        const profileLinksParsedElements = document.querySelectorAll(
            '.username-profile-links-parsed'
        );
        for (let i = 0; i < profileLinksParsedElements.length; i++) {
            const profileLink = createWikiLink(userPage, 'Profile');
            const blogLink = createWikiLink(userBlogPage, 'Blog');
            const contribLink = createWikiLink(userContribPage, 'Contributions');

            profileLinksParsedElements[i].innerHTML =
                profileLink + ' • ' + blogLink + ' • ' + contribLink;
        }
    }

    // Test mode functionality
    function enableTestMode(): void {
        // Add test mode indicator
        const testIndicator = document.createElement('div');
        testIndicator.style.cssText =
            'position: fixed; top: 10px; right: 10px; background: #ff0; padding: 5px; border: 1px solid #000; z-index: 9999;';
        testIndicator.textContent = 'UserLinks Test Mode';
        document.body.appendChild(testIndicator);

        // Log current user info
        console.log('UserLinks Test Mode Enabled');
        console.log('Current User:', getCurrentUser());
        console.log('Is Anonymous:', isAnonymous());

        // Override page existence check for testing
        window.userLinksTestMode = true;
    }

    // Initialize the script
    function init(): void {
        // Check if test mode is enabled
        if (window.userLinksTestMode || mw.config.get('wgUserLinksTestMode')) {
            enableTestMode();
        }

        // Process all username elements
        processUsernameElements();

        // Set up observer for dynamically added elements
        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(function (
                mutations: MutationRecord[]
            ): void {
                mutations.forEach(function (mutation: MutationRecord): void {
                    if (mutation.type === 'childList') {
                        for (let i = 0; i < mutation.addedNodes.length; i++) {
                            const node = mutation.addedNodes[i];
                            if (node.nodeType === 1) {
                                // Element node
                                const usernameElements = (node as Element).querySelectorAll(
                                    '[class*="username-"]'
                                );
                                if (usernameElements.length > 0) {
                                    processUsernameElements();
                                }
                            }
                        }
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // Run when DOM is ready
    ready(function (): void {
        // Only run on pages that might contain UserLinks templates
        if (document.querySelector('[class*="username-"]')) {
            init();
        }
    });

    // Expose functions for testing
    window.userLinksHandler = {
        init: init,
        processUsernameElements: processUsernameElements,
        enableTestMode: enableTestMode,
        getCurrentUser: getCurrentUser,
        isAnonymous: isAnonymous
    };
})();