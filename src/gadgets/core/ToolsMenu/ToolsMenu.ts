/**
 * MediaWiki Tools Menu Gateway (for now serve as admin-only tools)
 * v1.1.0
 *
 * This utility script ensures that a "Tools" menu section exists,
 * preventing race conditions from other scripts. It can be called
 * by any other gadget that needs to add a link to the Tools menu.
 *
 * Self-destruct: If no tools are added within the timeout period,
 * the menu will be automatically removed.
 */

declare global {
    interface Window {
        ensureToolsMenu?: () => HTMLElement | null;
        toolsMenuInitialized?: boolean;
    }
}

(function (window: Window, document: Document): void {
    'use strict';

    const DEBUG = false;
    const SELF_DESTRUCT_DELAY = 5000;

    if (window.toolsMenuInitialized) {
        return;
    }

    let selfDestructTimer: ReturnType<typeof setTimeout> | null = null;
    let toolsSection: HTMLElement | null = null;

    /**
     * Checks if the tools menu is empty and removes it if so.
     */
    function checkAndDestroy(): void {
        const menuList = document.getElementById('tools-menu-list');
        if (!menuList) {
            return;
        }

        // Count actual tool items (exclude empty text nodes)
        const items = menuList.querySelectorAll('li');

        if (items.length === 0) {
            if (DEBUG) {
                console.log('ToolsMenu Gateway: No tools added. Self-destructing...');
            }

            // Remove the entire tools section if we created it
            if (toolsSection && toolsSection.parentNode) {
                toolsSection.parentNode.removeChild(toolsSection);
            }

            // Clean up global references
            delete window.ensureToolsMenu;
            delete window.toolsMenuInitialized;

            if (DEBUG) {
                console.log('ToolsMenu Gateway: Self-destruct complete.');
            }
        } else {
            if (DEBUG) {
                console.log('ToolsMenu Gateway: ' + items.length + ' tool(s) found. Keeping menu.');
            }
        }
    }

    /**
     * Schedules the self-destruct check.
     */
    function scheduleSelfDestruct(): void {
        if (selfDestructTimer) {
            clearTimeout(selfDestructTimer);
        }
        selfDestructTimer = setTimeout(checkAndDestroy, SELF_DESTRUCT_DELAY);
    }

    /**
     * Ensures the Tools menu and its list element exist, creating them if necessary.
     * This function is idempotent - it can be called multiple times safely.
     * @returns The list element (<ul>) where tool links should be added, or null if it fails.
     */
    function ensureToolsMenu(): HTMLElement | null {
        // If the menu list already exists, return it immediately.
        const existingList = document.getElementById('tools-menu-list');
        if (existingList) {
            // Reset self-destruct timer since menu is being accessed
            scheduleSelfDestruct();
            return existingList;
        }

        let targetList: HTMLElement | null = null;

        const citizenMenu = document.getElementById('citizen-main-menu');
        if (citizenMenu) {
            toolsSection = document.getElementById('p-tools');
            if (!toolsSection) {
                if (DEBUG) {
                    console.log('ToolsMenu Gateway: Creating Tools section for Citizen skin.');
                }
                toolsSection = document.createElement('nav');
                toolsSection.id = 'p-tools';
                toolsSection.className = 'citizen-menu mw-portlet mw-portlet-tools';

                toolsSection.innerHTML =
                    '<div class="citizen-menu__heading">Tools</div>' +
                    '<div class="citizen-menu__content">' +
                    '<ul class="citizen-menu__content-list" id="tools-menu-list">' +
                    '</ul>' +
                    '</div>';

                citizenMenu.appendChild(toolsSection);
            }
            targetList = toolsSection.querySelector('#tools-menu-list');
        }

        if (!targetList) {
            const toolsPortlet = document.getElementById('p-tb');
            if (toolsPortlet) {
                const portletList = toolsPortlet.querySelector('ul');
                if (portletList) {
                    portletList.id = 'tools-menu-list';
                    targetList = portletList as HTMLElement;
                }
            }
        }

        // Schedule self-destruct check
        scheduleSelfDestruct();

        return targetList;
    }

    window.ensureToolsMenu = ensureToolsMenu;
    window.toolsMenuInitialized = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function (): void {
            ensureToolsMenu();
        });
    } else {
        ensureToolsMenu();
    }
})(window, document);