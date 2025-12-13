export {};

declare global {
    interface Window {
        VideoPreviewLoaded?: boolean;
    }
}

(function() {
    'use strict';
    
    if (window.VideoPreviewLoaded) {
        return;
    }
    window.VideoPreviewLoaded = true;

    interface VideoDetails {
        type: 'youtube' | 'niconico';
        id: string;
        embedUrl: string;
    }

    const abortOnMobile = (): boolean => {
        const body = document.body;
        if (!body) return false;

        if (body.classList.contains('mw-mf') || body.classList.contains('is-mobile-device')) {
            return true;
        }

        return false;
    };

    if (abortOnMobile()) return;

    const createPreviewElement = () => {
        const preview = document.createElement('div');
        preview.className = 'video-preview-container';

        const iframe = document.createElement('iframe');
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowfullscreen', '1');

        preview.appendChild(iframe);
        document.body.appendChild(preview);

        return {
            container: preview,
            iframe: iframe
        };
    };

    const previewElements = createPreviewElement();
    let hideTimeout: number | undefined;

    const getVideoDetails = (href: string | null): VideoDetails | null => {
        if (!href) return null;

        const ytMatch = href.match(/(?:v=|be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch) {
            return {
                type: 'youtube',
                id: ytMatch[1],
                embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0`
            };
        }

        const nndMatch = href.match(/(?:nicovideo\.jp\/watch\/)?(sm\d+)/);
        if (nndMatch) {
            return {
                type: 'niconico',
                id: nndMatch[1],
                embedUrl: `https://embed.nicovideo.jp/watch/${nndMatch[1]}?autoplay=1&mute=1`
            };
        }

        return null;
    };

    const showPreview = (event: MouseEvent) => {
        const target = event.currentTarget as HTMLAnchorElement;
        const href = target.getAttribute('href');
        const videoDetails = getVideoDetails(href);

        if (!videoDetails) {
            return;
        }

        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
        }

        const rect = target.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        previewElements.container.style.top = `${rect.bottom + scrollTop + 10}px`;
        previewElements.container.style.left = `${rect.left + scrollLeft}px`;
        previewElements.container.className = `video-preview-container ${videoDetails.type}`;
        previewElements.iframe.src = videoDetails.embedUrl;
        previewElements.container.style.display = 'block';
    };

    const hidePreview = () => {
        hideTimeout = window.setTimeout(() => {
            previewElements.container.style.display = 'none';
            previewElements.iframe.src = '';
        }, 300);
    };

    const initVideoLinks = () => {
        const links = document.querySelectorAll(
            'a[href*="youtube.com/watch"], ' +
            'a[href*="youtu.be/"], ' +
            'a[href*="nicovideo.jp/watch/"]'
        );

        links.forEach((link) => {
            if (link.getAttribute('data-preview-initialized')) {
                return;
            }

            const href = link.getAttribute('href');
            if (!getVideoDetails(href)) {
                return;
            }

            link.setAttribute('data-preview-initialized', 'true');
            (link as HTMLElement).addEventListener('mouseenter', showPreview as EventListener);
            (link as HTMLElement).addEventListener('mouseleave', hidePreview);
        });

        previewElements.container.addEventListener('mouseenter', () => {
            if (hideTimeout) {
                window.clearTimeout(hideTimeout);
            }
        });

        previewElements.container.addEventListener('mouseleave', hidePreview);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVideoLinks);
    } else {
        initVideoLinks();
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                initVideoLinks();
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();