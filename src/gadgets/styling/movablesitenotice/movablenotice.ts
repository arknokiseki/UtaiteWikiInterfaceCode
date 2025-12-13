/**
 * Movable and Resizable Site Notice with MediaWiki Parser
 * Makes the site notice behave like a standard window and renders wiki content properly.
 */

// --- Type Definitions ---

interface ApiParseResponse {
    parse?: {
        text?: {
            '*': string;
        };
    };
    error?: {
        code: string;
        info: string;
    };
}

interface MwApi {
    post: (params: Record<string, unknown>) => JQuery.Promise<ApiParseResponse>;
    get: (params: Record<string, unknown>) => JQuery.Promise<ApiParseResponse>;
}

declare const mw: {
    Api: new () => MwApi;
};

// declare const mediaWiki: typeof mw;

// --- Implementation ---

(function (): void {
    'use strict';
    console.log('Enhanced movable notice container initialized - v0.1.7');

    if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
        return;
    }

    function enhanceNoticeContainer(): void {
        // Get the notice element
        const noticeContainer = document.querySelector('.citizen-sitenotice-container') as HTMLElement;

        if (!noticeContainer) {
            // Try again later if element not found
            setTimeout(enhanceNoticeContainer, 500);
            return;
        }

        // Set position to fixed to ensure proper dragging
        noticeContainer.style.position = 'fixed';

        // Add resize handles
        addResizeHandles(noticeContainer);

        // Variables for tracking drag state
        let isDragging = false;
        let isResizing = false;
        let resizeDirection = '';
        let startX = 0, startY = 0;
        let startWidth = 0, startHeight = 0;
        let startLeft = 0, startTop = 0;

        // Load saved position and size if available
        loadSavedPositionAndSize(noticeContainer);

        // Create header for better drag handling
        createHeader(noticeContainer);

        // Check if the notice should be hidden based on user preference
        if (localStorage.getItem('notice-dismissed') === 'true') {
            noticeContainer.style.display = 'none';
        }

        function createHeader(container: HTMLElement): void {
            // Check if header already exists
            if (container.querySelector('.notice-header')) return;

            // Find the original dismiss button for reference
            const originalDismissBtn = container.querySelector('.mw-dismissable-notice-close a') as HTMLElement;

            // Create a dedicated header
            const header = document.createElement('div');
            header.className = 'notice-header';
            header.innerHTML = '<span class="notice-title">ℹ️ Wiki Notice</span><span class="notice-close">[<a href="#">dismiss</a>]</span>';

            // Create a content container
            const content = document.createElement('div');
            content.className = 'notice-content';

            // Find the existing siteNotice and move it into the content container
            const siteNotice = container.querySelector('#siteNotice') as HTMLElement;
            if (siteNotice) {
                // Clone it to preserve event handlers
                const siteNoticeClone = siteNotice.cloneNode(true) as HTMLElement;
                content.appendChild(siteNoticeClone);

                // Hide the original but keep it in DOM for any scripts that might reference it
                siteNotice.style.display = 'none';
            }

            // Add header and content to container (without removing the original content)
            container.insertBefore(header, container.firstChild);
            container.insertBefore(content, header.nextSibling);

            // Handle our custom dismiss button
            const closeBtn = header.querySelector('.notice-close a');
            if (closeBtn) {
                closeBtn.addEventListener('click', function (e: Event): void {
                    e.preventDefault();
                    dismissNotice(container, originalDismissBtn);
                });
            }

            // Add expand/collapse button
            const expandBtn = document.createElement('span');
            expandBtn.className = 'notice-expand';
            expandBtn.textContent = '□';
            expandBtn.title = 'Expand/Collapse';
            if (closeBtn && closeBtn.parentNode) {
                header.insertBefore(expandBtn, closeBtn.parentNode);
            }

            expandBtn.addEventListener('click', function (): void {
                container.classList.toggle('collapsed');
                saveState(container);
            });

            // Add refresh button
            const refreshBtn = document.createElement('span');
            refreshBtn.className = 'notice-refresh';
            refreshBtn.innerHTML = '↻';
            refreshBtn.title = 'Refresh Notice';
            header.insertBefore(refreshBtn, expandBtn);

            refreshBtn.addEventListener('click', function (): void {
                refreshNotice(container);
            });

            // Restore collapsed state
            if (localStorage.getItem('notice-collapsed') === 'true') {
                container.classList.add('collapsed');
            }
        }

        function dismissNotice(container: HTMLElement, originalDismissBtn: HTMLElement | null): void {
            // 1. Try clicking the original MediaWiki dismiss button
            if (originalDismissBtn) {
                try {
                    originalDismissBtn.click();
                } catch (e) {
                    console.error('Failed to trigger original dismiss button:', e);
                }
            }

            // 2. Try finding a newly rendered dismiss button (in case DOM changed)
            const currentDismissBtn = document.querySelector('.mw-dismissable-notice-close a') as HTMLElement;
            if (currentDismissBtn && currentDismissBtn !== originalDismissBtn) {
                try {
                    currentDismissBtn.click();
                } catch (e) {
                    console.error('Failed to trigger current dismiss button:', e);
                }
            }

            // 3. Fallback: hide and remember
            container.style.display = 'none';
            localStorage.setItem('notice-dismissed', 'true');

            // Show reset button
            const resetBtn = document.getElementById('notice-reset-btn');
            if (resetBtn) {
                resetBtn.style.display = 'block';
            }

            console.log('Notice dismissed');
        }

        function addResizeHandles(container: HTMLElement): void {
            const handles = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];

            handles.forEach(function (direction) {
                const handle = document.createElement('div');
                handle.className = 'resize-handle resize-' + direction;
                handle.setAttribute('data-direction', direction);
                container.appendChild(handle);

                // Add resize event listeners
                handle.addEventListener('mousedown', initResize as EventListener);
                handle.addEventListener('touchstart', initResize as EventListener, { passive: false });
            });
        }

        function loadSavedPositionAndSize(container: HTMLElement): void {
            const savedLeft = localStorage.getItem('notice-position-left');
            const savedTop = localStorage.getItem('notice-position-top');
            const savedWidth = localStorage.getItem('notice-width');
            const savedHeight = localStorage.getItem('notice-height');

            if (savedLeft && savedTop) {
                container.style.left = savedLeft;
                container.style.top = savedTop;
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            } else {
                // Default position
                const rect = container.getBoundingClientRect();
                container.style.right = 'auto';
                container.style.bottom = 'auto';
                container.style.left = (window.innerWidth - rect.width - 50) + 'px';
                container.style.top = '100px';
            }

            if (savedWidth && savedHeight) {
                container.style.width = savedWidth;
                container.style.height = savedHeight;
                container.style.maxWidth = 'none';
                container.style.maxHeight = 'none';
            } else {
                // Default size
                container.style.width = '300px';
                container.style.height = 'auto';
            }
        }

        function getClientCoordinates(e: MouseEvent | TouchEvent): { x: number; y: number } {
            let clientX = 0;
            let clientY = 0;

            if (window.TouchEvent && e instanceof TouchEvent) {
                if (e.touches && e.touches[0]) {
                    clientX = e.touches[0].clientX;
                    clientY = e.touches[0].clientY;
                }
            } else {
                clientX = (e as MouseEvent).clientX;
                clientY = (e as MouseEvent).clientY;
            }
            return { x: clientX, y: clientY };
        }

        function initDrag(e: MouseEvent | TouchEvent): void {
            const target = e.target as HTMLElement;
            // Ignore if we're clicking a button or handle
            if (target.closest('.notice-close, .notice-expand, .notice-refresh, .resize-handle')) return;

            // Only drag from the header
            const header = noticeContainer.querySelector('.notice-header');
            if (!header || !header.contains(target)) return;

            e.preventDefault();

            isDragging = true;

            const coords = getClientCoordinates(e);
            startX = coords.x;
            startY = coords.y;

            const rect = noticeContainer.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            noticeContainer.classList.add('dragging');

            document.addEventListener('mousemove', drag as EventListener);
            document.addEventListener('touchmove', drag as EventListener, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }

        function drag(e: MouseEvent | TouchEvent): void {
            if (!isDragging && !isResizing) return;

            e.preventDefault();

            const coords = getClientCoordinates(e);
            const clientX = coords.x;
            const clientY = coords.y;

            if (isDragging) {
                const dx = clientX - startX;
                const dy = clientY - startY;

                noticeContainer.style.left = (startLeft + dx) + 'px';
                noticeContainer.style.top = (startTop + dy) + 'px';
            } else if (isResizing) {
                let newWidth = startWidth;
                let newHeight = startHeight;
                let newLeft = startLeft;
                let newTop = startTop;

                if (resizeDirection.indexOf('e') !== -1) {
                    newWidth = startWidth + (clientX - startX);
                }
                if (resizeDirection.indexOf('s') !== -1) {
                    newHeight = startHeight + (clientY - startY);
                }
                if (resizeDirection.indexOf('w') !== -1) {
                    newWidth = startWidth - (clientX - startX);
                    newLeft = startLeft + (clientX - startX);
                }
                if (resizeDirection.indexOf('n') !== -1) {
                    newHeight = startHeight - (clientY - startY);
                    newTop = startTop + (clientY - startY);
                }

                // Apply minimum size constraints
                newWidth = Math.max(200, newWidth);
                newHeight = Math.max(100, newHeight);

                noticeContainer.style.width = newWidth + 'px';
                noticeContainer.style.height = newHeight + 'px';
                noticeContainer.style.left = newLeft + 'px';
                noticeContainer.style.top = newTop + 'px';
            }
        }

        function stopDrag(): void {
            if (isDragging || isResizing) {
                noticeContainer.classList.remove('dragging');
                noticeContainer.classList.remove('resizing');

                saveState(noticeContainer);

                isDragging = false;
                isResizing = false;
            }

            document.removeEventListener('mousemove', drag as EventListener);
            document.removeEventListener('touchmove', drag as EventListener);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
        }

        function initResize(e: MouseEvent | TouchEvent): void {
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            resizeDirection = (e.target as HTMLElement).getAttribute('data-direction') || '';

            const coords = getClientCoordinates(e);
            startX = coords.x;
            startY = coords.y;

            const rect = noticeContainer.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;

            noticeContainer.classList.add('resizing');

            document.addEventListener('mousemove', drag as EventListener);
            document.addEventListener('touchmove', drag as EventListener, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }

        function saveState(container: HTMLElement): void {
            localStorage.setItem('notice-position-left', container.style.left);
            localStorage.setItem('notice-position-top', container.style.top);
            localStorage.setItem('notice-width', container.style.width);
            localStorage.setItem('notice-height', container.style.height);
            localStorage.setItem('notice-collapsed', String(container.classList.contains('collapsed')));
        }

        function fetchMediaWikiPage(pageName: string): Promise<string | null> {
            return new Promise(function (resolve, reject) {
                const baseUrl = window.location.origin;
                const rawUrl = baseUrl + '/wiki/' + pageName + '?action=raw';

                fetch(rawUrl)
                    .then(function (response) {
                        if (!response.ok) {
                            console.warn('Page not found or error: ' + pageName);
                            return null;
                        }
                        return response.text();
                    })
                    .then(function (content) {
                        resolve(content);
                    })
                    .catch(function (error) {
                        console.error('Error fetching MediaWiki page:', error);
                        reject(error);
                    });
            });
        }

        function parseWikiText(wikiText: string): Promise<string> {
            return new Promise(function (resolve) {
                if (window.mw && window.mw.Api) {
                    try {
                        const api = new mw.Api();
                        api.post({
                            action: 'parse',
                            text: wikiText,
                            contentmodel: 'wikitext',
                            format: 'json'
                        }).then(function (data: ApiParseResponse) {
                            if (data && data.parse && data.parse.text) {
                                resolve(data.parse.text['*']);
                            } else {
                                console.warn('Failed to parse wikitext using mw.Api');
                                resolve('<div class="mw-parser-output">' + wikiText + '</div>');
                            }
                        }).catch(function (error: unknown) {
                            console.error('Error parsing wiki text:', error);
                            resolve('<div class="mw-parser-output">' + wikiText + '</div>');
                        });
                    } catch (e) {
                        console.error('Error using mw.Api:', e);
                        resolve('<div class="mw-parser-output">' + wikiText + '</div>');
                    }
                } else {
                    const baseUrl = window.location.origin;
                    const apiUrl = baseUrl + '/api.php?action=parse&text=' +
                        encodeURIComponent(wikiText) +
                        '&contentmodel=wikitext&disablelimitreport=true&format=json&origin=*';

                    fetch(apiUrl)
                        .then(function (response) { return response.json(); })
                        .then(function (data: ApiParseResponse) {
                            if (data && data.parse && data.parse.text) {
                                resolve(data.parse.text['*']);
                            } else {
                                console.warn('Failed to parse wikitext using API');
                                resolve('<div class="mw-parser-output">' + wikiText + '</div>');
                            }
                        })
                        .catch(function (error) {
                            console.error('Error parsing wiki text:', error);
                            resolve('<div class="mw-parser-output">' + wikiText + '</div>');
                        });
                }
            });
        }

        function refreshNotice(container: HTMLElement): void {
            const refreshBtn = container.querySelector('.notice-refresh');
            if (refreshBtn) {
                refreshBtn.classList.add('loading');
                refreshBtn.textContent = '⟳';
            }

            fetchMediaWikiPage('MediaWiki:Sitenotice_id')
                .then(function (sitenoticeId) {
                    console.log('Sitenotice ID:', sitenoticeId);

                    let sitenoticePage = 'MediaWiki:Sitenotice';

                    if (sitenoticeId !== null) {
                        const id = sitenoticeId.trim();
                        if (id === '0') {
                            return fetchMediaWikiPage('MediaWiki:Sitenotice')
                                .then(function (content) {
                                    if (!content || content.trim() === '') {
                                        console.log('MediaWiki:Sitenotice is empty, trying MediaWiki:Sitenotice-0');
                                        return fetchMediaWikiPage('MediaWiki:Sitenotice-0');
                                    }
                                    return content;
                                });
                        } else {
                            console.log('Using MediaWiki:Sitenotice-' + id);
                            return fetchMediaWikiPage('MediaWiki:Sitenotice-' + id);
                        }
                    } else {
                        console.log('No Sitenotice ID found, using MediaWiki:Sitenotice');
                        return fetchMediaWikiPage(sitenoticePage);
                    }
                })
                .then(function (wikiContent) {
                    if (wikiContent && wikiContent.trim() !== '') {
                        console.log('Got wiki content, parsing...');
                        return parseWikiText(wikiContent);
                    } else {
                        console.warn('No content found for sitenotice');
                        return null;
                    }
                })
                .then(function (parsedHtml) {
                    if (parsedHtml) {
                        console.log('Parsed HTML content, updating...');

                        const contentContainer = container.querySelector('.notice-content #siteNotice');
                        if (contentContainer) {
                            contentContainer.innerHTML = parsedHtml;

                            // Process any scripts in the parsed content to execute them
                            const scripts = contentContainer.getElementsByTagName('script');
                            for (let i = 0; i < scripts.length; i++) {
                                const script = scripts[i];
                                const newScript = document.createElement('script');

                                for (let j = 0; j < script.attributes.length; j++) {
                                    const attr = script.attributes[j];
                                    newScript.setAttribute(attr.name, attr.value);
                                }

                                newScript.innerHTML = script.innerHTML;
                                if (script.parentNode) {
                                    script.parentNode.replaceChild(newScript, script);
                                }
                            }

                            console.log('Sitenotice content updated successfully');

                            // Show the notice if it was dismissed
                            if (container.style.display === 'none') {
                                container.style.display = 'flex';
                                localStorage.removeItem('notice-dismissed');

                                const resetBtn = document.getElementById('notice-reset-btn');
                                if (resetBtn) {
                                    resetBtn.style.display = 'none';
                                }
                            }
                        }
                    }
                })
                .catch(function (error) {
                    console.error('Failed to refresh sitenotice:', error);
                })
                .finally(function () {
                    if (refreshBtn) {
                        refreshBtn.classList.remove('loading');
                        refreshBtn.textContent = '↻';
                    }
                });
        }

        // Add event listeners for dragging
        noticeContainer.addEventListener('mousedown', initDrag as EventListener);
        noticeContainer.addEventListener('touchstart', initDrag as EventListener, { passive: false });

        // Double-click header to toggle collapse
        noticeContainer.addEventListener('dblclick', function (e: MouseEvent): void {
            const header = noticeContainer.querySelector('.notice-header');
            const target = e.target as HTMLElement;
            if (header && header.contains(target) && !target.closest('.notice-close, .notice-expand, .notice-refresh')) {
                noticeContainer.classList.toggle('collapsed');
                saveState(noticeContainer);
            }
        });

        // Add a reset button
        if (!document.getElementById('notice-reset-btn')) {
            const resetBtn = document.createElement('button');
            resetBtn.id = 'notice-reset-btn';
            resetBtn.textContent = 'Reset Wiki Notice';
            resetBtn.style.display = 'none';
            resetBtn.style.position = 'fixed';
            resetBtn.style.bottom = '10px';
            resetBtn.style.right = '10px';
            resetBtn.style.zIndex = '999';
            resetBtn.style.padding = '5px 10px';
            resetBtn.style.fontSize = '12px';
            resetBtn.style.cursor = 'pointer';

            resetBtn.addEventListener('click', function (this: HTMLButtonElement): void {
                localStorage.removeItem('notice-dismissed');
                noticeContainer.style.display = 'flex';
                this.style.display = 'none';
            });

            document.body.appendChild(resetBtn);

            if (localStorage.getItem('notice-dismissed') === 'true') {
                resetBtn.style.display = 'block';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function (): void {
            setTimeout(enhanceNoticeContainer, 500);
        });
    } else {
        setTimeout(enhanceNoticeContainer, 500);
    }
})();