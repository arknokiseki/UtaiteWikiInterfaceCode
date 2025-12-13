/**
 * MediaWiki Modal Builder
 * v1.2.2
 * This utility script provides a reusable function to create consistent,
 * theme-aware modals for various tools.
 */

interface ThemeConfig {
    accent: string;
}

interface ThemeMap {
    delete: ThemeConfig;
    rename: ThemeConfig;
    upload: ThemeConfig;
    categorize: ThemeConfig;
    docs: ThemeConfig;
    default: ThemeConfig;
    [key: string]: ThemeConfig;
}

interface ModalOptions {
    toolId: string;
    title: string;
    contentHtml: string;
    theme?: keyof ThemeMap | string;
    onClose?: () => void;
    showFooter?: boolean;
    footerHtml?: string;
}

interface ModalInstance {
    open: () => void;
    close: () => void;
    readonly element: HTMLDivElement;
    readonly container: Element | null;
}

interface ModalBuilderInterface {
    initialized: boolean;
    themes: ThemeMap;
    init: () => void;
    create: (options: ModalOptions) => ModalInstance;
}

declare const mw: {
    config: {
        get: (key: string) => string[] | null;
    };
    html: {
        escape: (text: string) => string;
    };
};

declare global {
    interface Window {
        ModalBuilder?: ModalBuilderInterface;
        createToolModal?: (options: ModalOptions) => ModalInstance;
    }
}

((window: Window, document: Document): void => {
    'use strict';

    if (window.ModalBuilder) return;

    const allowedGroups: string[] = ['bureaucrat', 'content-moderator', 'sysop', 'interface-admin'];
    const userGroups: string[] = mw.config.get('wgUserGroups') || [];
    const hasPermission: boolean = allowedGroups.some(group => userGroups.includes(group));

    if (!hasPermission) return;

    const ModalBuilder: ModalBuilderInterface = {
        initialized: false,

        themes: {
            delete: { accent: '#ef4444' },
            rename: { accent: '#a855f7' },
            upload: { accent: '#16a34a' },
            categorize: { accent: '#3b82f6' },
            docs: { accent: '#06b6d4' },
            default: { accent: '#6366f1' }
        },

        init(): void {
            if (this.initialized) return;
            this.initialized = true;
        },

        create(options: ModalOptions): ModalInstance {
            this.init();

            const {
                toolId,
                title,
                contentHtml,
                theme = 'default',
                onClose,
                showFooter = false,
                footerHtml = ''
            } = options;

            const overlayId = `${toolId}-overlay`;
            const existingModal = document.getElementById(overlayId);
            if (existingModal) existingModal.remove();

            const themeConfig: ThemeConfig = this.themes[theme] || this.themes.default;

            const modal = document.createElement('div') as HTMLDivElement;
            modal.className = 'tm-overlay';
            modal.id = overlayId;
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', `${toolId}-title`);
            modal.style.setProperty('--tm-accent', themeConfig.accent);

            modal.innerHTML = `
                <div class="tm-backdrop"></div>
                <div class="tm-container">
                    <div class="tm-header">
                        <h2 class="tm-title" id="${toolId}-title">${mw.html.escape(title)}</h2>
                        <button class="tm-close" type="button" aria-label="Close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="tm-body">${contentHtml}</div>
                    ${showFooter ? `<div class="tm-footer">${footerHtml}</div>` : ''}
                </div>
            `;

            document.body.appendChild(modal);

            const closeButton = modal.querySelector('.tm-close') as HTMLButtonElement;
            const container = modal.querySelector('.tm-container');

            const handleEscape = (e: KeyboardEvent): void => {
                if (e.key === 'Escape') closeModal();
            };

            const openModal = (): void => {
                requestAnimationFrame(() => {
                    modal.classList.add('is-open');
                    document.body.style.overflow = 'hidden';
                    document.addEventListener('keydown', handleEscape);
                });
            };

            const closeModal = (): void => {
                modal.classList.remove('is-open');
                document.body.style.overflow = '';
                document.removeEventListener('keydown', handleEscape);
                if (typeof onClose === 'function') {
                    setTimeout(onClose, 150);
                }
            };

            closeButton.addEventListener('click', closeModal);
            modal.addEventListener('click', (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (target === modal || target.classList.contains('tm-backdrop')) {
                    closeModal();
                }
            });

            return {
                open: openModal,
                close: closeModal,
                get element(): HTMLDivElement {
                    return modal;
                },
                get container(): Element | null {
                    return container;
                }
            };
        }
    };

    window.ModalBuilder = ModalBuilder;
    window.createToolModal = ModalBuilder.create.bind(ModalBuilder);

})(window, document);