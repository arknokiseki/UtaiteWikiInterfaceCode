/**
 * UserBlog Support Gadget v1.1.1
 * Handles avatar fetching, timestamp formatting, and blog listing/post layouts
 * for the User_blog (3000) namespace.
 */

// --- Interfaces ---

interface ApiUserProfileItem {
    'profile-avatar'?: string;
    [key: string]: unknown;
}

interface ApiUserProfileResponse {
    query?: {
        queryuserprofilev2?: ApiUserProfileItem[];
    };
}

interface ApiRevision {
    timestamp: string;
}

interface ApiPageWithRevisions {
    revisions?: ApiRevision[];
    [key: string]: unknown;
}

interface ApiQueryRevisionsResponse {
    query?: {
        pages?: Record<string, ApiPageWithRevisions>;
    };
}

interface ApiAllPagesItem {
    title: string;
}

interface ApiAllPagesResponse {
    query?: {
        allpages?: ApiAllPagesItem[];
    };
}

// Combined API Response type for flexibility with the generic get method
type ApiAnyResponse = ApiUserProfileResponse & ApiQueryRevisionsResponse & ApiAllPagesResponse;

interface MwApi {
    get: (params: Record<string, unknown>) => JQuery.Promise<ApiAnyResponse>;
}

// --- Global Declarations ---

declare const mw: {
    config: {
        get: <T>(key: string) => T;
    };
    util: {
        getUrl: (title: string, params?: Record<string, string>) => string;
    };
    Api: new () => MwApi;
    loader: {
        using: (modules: string[]) => JQuery.Promise<void>;
    };
};

declare const mediaWiki: typeof mw;

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    mw.loader.using(['mediawiki.api']).then(function (): void {
        $(function (): void {
            // console.log('Userblog Support v1.1.1 Initialized');

            const USER_BLOG_NAMESPACE = 3000;
            const FALLBACK_AVATAR = 'https://static.wikitide.net/utaitewiki/e/e6/Site-logo.png';

            /**
             * Fetches the user's avatar URL from the API
             */
            function getUserAvatar(username: string): JQuery.Promise<string> {
                return new mw.Api().get({
                    action: 'query',
                    format: 'json',
                    list: 'queryuserprofilev2',
                    user_name: username.replace(/_/g, ' ')
                }).then(function (data: ApiUserProfileResponse): string {
                    if (data && data.query && data.query.queryuserprofilev2 && data.query.queryuserprofilev2[0]) {
                        return data.query.queryuserprofilev2[0]['profile-avatar'] || FALLBACK_AVATAR;
                    }
                    return FALLBACK_AVATAR;
                }).catch(function (): string {
                    return FALLBACK_AVATAR;
                }) as JQuery.Promise<string>;
            }

            /**
             * Calculates how long ago a timestamp was.
             */
            function calculateTimeAgo(isoTimestamp: string): string {
                const now = new Date().getTime();
                const past = new Date(isoTimestamp).getTime();
                const seconds = Math.floor((now - past) / 1000);

                let interval = seconds / 31536000;
                if (interval > 1) return Math.floor(interval) + " years ago";
                interval = seconds / 2592000;
                if (interval > 1) return Math.floor(interval) + " months ago";
                interval = seconds / 86400;
                if (interval > 1) return Math.floor(interval) + " days ago";
                interval = seconds / 3600;
                if (interval > 1) return Math.floor(interval) + " hours ago";
                interval = seconds / 60;
                if (interval > 1) return Math.floor(interval) + " minutes ago";
                
                return Math.floor(seconds) + " seconds ago";
            }

            /**
             * Adds a "Create New Post" button to the listing page for the blog owner.
             */
            function initializeCreateButton(container: HTMLElement, blogOwnerUsername: string): void {
                const currentUserName = mw.config.get<string>('wgUserName');
                
                if (currentUserName === blogOwnerUsername.replace(/_/g, ' ')) {
                    // console.log('User is the owner. Adding create button.');
                    const createButton = document.createElement('a');
                    createButton.className = 'wds-button';
                    createButton.textContent = 'Create New Post';
                    createButton.style.marginBottom = '20px';
                    createButton.style.display = 'inline-block';
                    createButton.href = '#';

                    createButton.addEventListener('click', function (e: MouseEvent): void {
                        e.preventDefault();
                        const postTitle = window.prompt('Enter the title for your new blog post:', '');

                        if (postTitle && postTitle.trim() !== '') {
                            const newPageName = 'User_blog:' + blogOwnerUsername + '/' + postTitle.trim();
                            const newPostUrl = mw.util.getUrl(newPageName, { action: 'edit' });
                            window.location.href = newPostUrl;
                        }
                    });

                    if (container.firstChild) {
                        container.insertBefore(createButton, container.firstChild);
                    } else {
                        container.appendChild(createButton);
                    }
                }
            }

            /**
             * Sets up the header for an individual blog post page.
             */
            function initializePostPage(): void {
                // console.log('Mode: Initializing Individual Post Page');
                const fullPageName = mw.config.get<string>('wgPageName');
                const pageNameWithoutNamespace = fullPageName.slice(fullPageName.indexOf(':') + 1);
                const username = pageNameWithoutNamespace.split('/')[0];
                const userPageLink = mw.util.getUrl('User:' + username);
                const userBlogLink = mw.util.getUrl('User_blog:' + username);
                const usernameText = username.replace(/_/g, ' ');

                const blogHeaderHTML =
                    '<div class="custom-blog-subtitle">' +
                        '<a href="' + userPageLink + '">' +
                            '<div class="custom-blog-avatar">' +
                                '<img src="' + FALLBACK_AVATAR + '" class="blog-avatar-loading" data-username="' + usernameText + '" />' +
                            '</div>' +
                        '</a>' +
                        '<div class="custom-blog-details">' +
                            '<a href="' + userPageLink + '">' + usernameText + '</a>' +
                            '<span class="custom-blog-bullet">•</span>' +
                            '<span class="custom-blog-timestamp">loading...</span>' +
                            '<span class="custom-blog-bullet">•</span>' +
                            '<a href="' + userBlogLink + '">User blog:' + usernameText + '</a>' +
                        '</div>' +
                    '</div>';

                const targetElement = document.querySelector('.citizen-page-heading');
                if (targetElement) {
                    targetElement.insertAdjacentHTML('afterend', blogHeaderHTML);

                    // Load the user's avatar
                    getUserAvatar(username).then(function (avatarUrl: string): void {
                        const avatarImg = document.querySelector('.blog-avatar-loading') as HTMLImageElement;
                        if (avatarImg) {
                            avatarImg.src = avatarUrl;
                            avatarImg.classList.remove('blog-avatar-loading');
                        }
                    });
                }

                new mw.Api().get({
                    action: 'query',
                    prop: 'revisions',
                    titles: fullPageName,
                    rvlimit: 1,
                    rvprop: 'timestamp',
                    format: 'json'
                }).then(function (data: ApiQueryRevisionsResponse): void {
                    const pages = data.query?.pages;
                    if (!pages) return;

                    const pageId = Object.keys(pages)[0];
                    if (pageId !== "-1" && pages[pageId].revisions && pages[pageId].revisions!.length > 0) {
                        const timestamp = pages[pageId].revisions![0].timestamp;
                        const timeAgo = calculateTimeAgo(timestamp);
                        const timestampElement = document.querySelector('.custom-blog-timestamp');
                        if (timestampElement) {
                            timestampElement.textContent = timeAgo;
                        }
                    }
                });
            }

            /**
             * Sets up the main blog listing page for a user.
             */
            function initializeListingPage(): void {
                // console.log('Mode: Initializing Main Listing Page');

                const pageActions = document.querySelector('.page-actions') as HTMLElement;
                if (pageActions) {
                    pageActions.style.display = 'none';
                }

                const toc = document.getElementById('citizen-toc');
                if (toc) {
                    toc.remove();
                }

                const contentArea = document.getElementById('mw-content-text');
                if (!contentArea) return;

                const fullPageName = mw.config.get<string>('wgPageName');
                const username = fullPageName.slice(fullPageName.indexOf(':') + 1);
                const usernameText = username.replace(/_/g, ' ');

                contentArea.innerHTML = '<div class="blog-listing-container"><h2>' + usernameText + '\'s Blog Posts</h2><div class="blog-listing-loader">Loading posts...</div></div>';
                const listingContainer = document.querySelector('.blog-listing-container') as HTMLElement;

                initializeCreateButton(listingContainer, username);

                new mw.Api().get({
                    action: 'query',
                    list: 'allpages',
                    apnamespace: USER_BLOG_NAMESPACE,
                    apprefix: username + '/',
                    aplimit: 50,
                    format: 'json'
                }).then(function (data: ApiAllPagesResponse): void {
                    const posts = data.query?.allpages;
                    const loader = document.querySelector('.blog-listing-loader');
                    if (loader) {
                        loader.remove();
                    }

                    if (!posts || posts.length === 0) {
                        listingContainer.insertAdjacentHTML('beforeend', '<p>This user hasn\'t written any blog posts yet.</p>');
                        return;
                    }

                    let postsHTML = '';
                    for (let i = 0; i < posts.length; i++) {
                        const post = posts[i];
                        const postTitle = post.title.slice(post.title.indexOf('/') + 1).replace(/_/g, ' ');
                        const postUrl = mw.util.getUrl(post.title);
                        postsHTML +=
                            '<div class="blog-listing-post">' +
                            '<h3 class="blog-listing-title">' +
                            '<a href="' + postUrl + '">' + postTitle + '</a>' +
                            '</h3>' +
                            '<div class="blog-listing-read-post">' +
                            '<a href="' + postUrl + '" class="read-more-button">Read Full Post</a>' +
                            '</div>' +
                            '</div>';
                    }
                    listingContainer.insertAdjacentHTML('beforeend', postsHTML);

                }).catch(function (): void {
                    const loader = document.querySelector('.blog-listing-loader');
                    if (loader) {
                        loader.remove();
                    }
                    listingContainer.insertAdjacentHTML('beforeend', '<p>Sorry, there was an error trying to load the blog posts.</p>');
                });
            }

            // === MAIN LOGIC GATE ===
            const wgNamespaceNumber = mw.config.get<number>('wgNamespaceNumber');
            const wgAction = mw.config.get<string>('wgAction');

            if (wgNamespaceNumber === USER_BLOG_NAMESPACE && wgAction === 'view') {
                const pageTitle = mw.config.get<string>('wgTitle');
                if (pageTitle.split('/').length > 1) {
                    initializePostPage();
                } else {
                    initializeListingPage();
                }
            }
        });
    });
})(mediaWiki, jQuery);