/**
 * Custom preload templates
 * @author Grunny
 * From https://harrypotter.wikia.com/wiki/MediaWiki:Wikia.js
 * edited by leviathan_89 (version 1.06 - 07/2021)
 * edited by CoolMikeHatsune22 (for use on Miraheze)
 * edited by Makudoumee (for use on Utaite Wiki)
 *
 * Original Source Code:
 * https://dev.fandom.com/wiki/MediaWiki:PreloadTemplates.js?oldid=208770
 * https://dev.miraheze.org/wiki/PreloadTemplates/code.js
 *
 * ** Info: **
 * Template list loaded by default from "MediaWiki:Custom-PreloadTemplates",
 * each syntax is loaded by default from the "/preload" subpage of the
 * template.
 */

interface PreloadTemplatesConfig {
    primary: string;
    placeholderPrimary: string | null;
    secondary: string | null;
    placeholderSecondary: string | null;
    subpage: string;
    storageCacheAge: number;
    serverCacheAge: number;
}

interface PreloadTemplatesUserConfig {
    primary?: string;
    placeholderPrimary?: string | null;
    secondary?: string | null;
    placeholderSecondary?: string | null;
    subpage?: string;
    storageCacheAge?: number;
    serverCacheAge?: number;
}

interface CacheData {
    list: string;
    listSecondary: string;
    pagename: string;
    pagenameSecondary: string | null;
}

interface I18nMessage {
    plain: () => string;
}

interface I18nInterface {
    msg: (key: string, ...args: string[]) => I18nMessage;
    loadMessages: (page: string, options: { apiEntrypoint: string }) => JQuery.Promise<I18nInterface>;
}

interface MwConfig {
    wgAction: string;
    wgFormattedNamespaces: Record<string, string>;
}

interface CodeMirror5Instance {
    getDoc: () => {
        getCursor: () => unknown;
        replaceRange: (text: string, cursor: unknown) => void;
    };
}

interface CodeMirror6View {
    state: {
        selection?: {
            ranges?: Array<{ from: number; to: number }>;
        };
    };
    dispatch: (transaction: {
        changes: { from: number; to: number; insert: string };
        selection: { anchor: number };
    }) => void;
    focus: () => void;
}

interface VETarget {
    active: boolean;
    getSurface: () => {
        getModel: () => {
            getFragment: () => {
                insertContent: (content: string) => void;
            };
        };
    };
}

interface VEInterface {
    init?: {
        target?: VETarget;
    };
}

declare const mw: {
    config: {
        get: (keys: string[]) => MwConfig;
    };
    util: {
        wikiScript: () => string;
        getUrl: (page: string) => string;
    };
    html: {
        element: (tag: string, attributes: Record<string, unknown>, content?: string) => string;
    };
    loader: {
        using: (modules: string | string[]) => JQuery.Promise<void>;
        getState: (module: string) => string | null;
        load: (module: string) => void;
    };
    hook: (name: string) => {
        add: (callback: (...args: unknown[]) => void) => void;
        remove: (callback: (...args: unknown[]) => void) => void;
    };
    messages: {
        set: (messages: Record<string, string>) => void;
    };
    message: (...args: string[]) => I18nMessage;
    editingToolbar?: {
        getCodeMirrorView?: () => CodeMirror6View;
    };
};

declare global {
    interface Window {
        PreloadTemplatesInitialized?: boolean;
        PreloadTemplates?: PreloadTemplatesUserConfig;
        preloadTemplates_namespace?: string | number;
        ve?: VEInterface;
        sel?: {
            text: string;
        };
    }

    interface HTMLElement {
        CodeMirror?: CodeMirror5Instance;
        cmView?: {
            view: CodeMirror6View;
        };
        selectionStart?: number;
        selectionEnd?: number;
    }

    interface Document {
        selection?: {
            createRange: () => { text: string };
        };
    }
}

(function (): void {
    'use strict';

    if (window.PreloadTemplatesInitialized) {
        return;
    }
    window.PreloadTemplatesInitialized = true;

    // =================
    //   Configuration
    // =================
    /* Default per-wiki configuration */
    const config: PreloadTemplatesConfig = {
        // List of boilerplates to be populated into the first (primary) dropdown.
        primary: 'MediaWiki:PreloadTemplates/primary',
        // Primary dropdown placeholder text. Set as null to use default.
        placeholderPrimary: '(insert boilerplate)',

        // List of boilerplates to be populated into the secondary dropdown. Set as null if unneeded
        secondary: 'MediaWiki:PreloadTemplates/secondary',
        // Secondary dropdown placeholder text. Set as null if unneeded
        placeholderSecondary: '(insert template)',

        // Suffix of each preload template
        subpage: 'preload',

        // Maximum cache age in local storage
        storageCacheAge: 15 * 60 * 1000, // 15 minutes

        // Maximum cache age of response from server (when fetching list of preload templates)
        serverCacheAge: 15 * 60 // 15 minutes
    };

    /* Individual user can choose to override */
    const userConfig: PreloadTemplatesUserConfig = {
        primary: (window.PreloadTemplates || {}).primary,
        placeholderPrimary: (window.PreloadTemplates || {}).placeholderPrimary,
        secondary: (window.PreloadTemplates || {}).secondary,
        placeholderSecondary: (window.PreloadTemplates || {}).placeholderSecondary,
        subpage: (window.PreloadTemplates || {}).subpage,
        storageCacheAge: (window.PreloadTemplates || {}).storageCacheAge,
        serverCacheAge: (window.PreloadTemplates || {}).serverCacheAge
    };

    // =================
    //   Run
    // =================
    let i18n: I18nInterface;
    let $main: JQuery<HTMLElement>;
    let $help: JQuery<HTMLElement>;

    const mwc = mw.config.get(['wgAction', 'wgFormattedNamespaces']);
    const $module = $('div#wpSummaryLabel'); // UCP source editors
    const $moduleOld = $('div.module_content:first'); // Old Non-UCP Source Editor
    const visualEditorSelector = 'div.ve-ui-toolbar.ve-ui-positionedTargetToolbar'; // Visual Editor

    const LC_PREFIX_PLTEMPLATES_PRIMARY = 'wiki_preload_templates_data_primary';
    const LC_PREFIX_PLTEMPLATES_SECONDARY = 'wiki_preload_templates_data_secondary';
    const LC_PREFIX_PLTEMPLATES_LIST_PAGENAME_PRIMARY = 'wiki_preload_templates_list-pagename_primary';
    const LC_PREFIX_PLTEMPLATES_LIST_PAGENAME_SECONDARY = 'wiki_preload_templates_list-pagename_secondary';
    const LC_PREFIX_PLTEMPLATES_EXPIRATION = 'wiki_preload_templates_expiration';

    if (mwc.wgAction !== 'edit') {
        return;
    }

    // =============
    //   Functions
    // =============

    // Get plain message from i18n
    function msg(message: string): string {
        return i18n.msg(message).plain();
    }

    // Parse MediaWiki code to allow the use of includeonly and noninclude tags in the preload page
    function parseMW(source: string): string {
        return source.replace(
            /<includeonly>(\n)?|(\n)?<\/includeonly>|\s*<noinclude>[^]*?<\/noinclude>/g,
            ''
        );
    }

    // Error alert
    function notFound(page: string): void {
        alert(i18n.msg('error', '"' + page + '"').plain());
    }

    // Save list of templates to local cache
    function saveListOfTemplatesToCache(data: CacheData): void {
        localStorage.setItem(LC_PREFIX_PLTEMPLATES_PRIMARY, data.list);
        localStorage.setItem(LC_PREFIX_PLTEMPLATES_SECONDARY, data.listSecondary);
        localStorage.setItem(LC_PREFIX_PLTEMPLATES_LIST_PAGENAME_PRIMARY, data.pagename);
        localStorage.setItem(
            LC_PREFIX_PLTEMPLATES_LIST_PAGENAME_SECONDARY,
            data.pagenameSecondary || ''
        );
        if (config.storageCacheAge > 0) {
            localStorage.setItem(
                LC_PREFIX_PLTEMPLATES_EXPIRATION,
                String(new Date(Date.now() + config.storageCacheAge).getTime())
            );
        }
    }

    // Clear list of templates from cache
    function clearListOfTemplatesCache(): void {
        localStorage.removeItem(LC_PREFIX_PLTEMPLATES_PRIMARY);
        localStorage.removeItem(LC_PREFIX_PLTEMPLATES_SECONDARY);
        localStorage.removeItem(LC_PREFIX_PLTEMPLATES_LIST_PAGENAME_PRIMARY);
        localStorage.removeItem(LC_PREFIX_PLTEMPLATES_LIST_PAGENAME_SECONDARY);
    }

    // Fetch list of templates to local cache
    function getListOfTemplatesFromCache(
        pagename: string,
        pagenameSecondary: string | null
    ): [string, string] | null {
        const cacheExpiredTime = localStorage.getItem(LC_PREFIX_PLTEMPLATES_EXPIRATION);
        const cachedPagename = localStorage.getItem(LC_PREFIX_PLTEMPLATES_LIST_PAGENAME_PRIMARY);
        const cachedPagenameSecondary = localStorage.getItem(
            LC_PREFIX_PLTEMPLATES_LIST_PAGENAME_SECONDARY
        );

        if (
            cacheExpiredTime === null ||
            isNaN(+cacheExpiredTime) ||
            Date.now() > +cacheExpiredTime ||
            cachedPagename !== pagename ||
            cachedPagenameSecondary !== pagenameSecondary
        ) {
            clearListOfTemplatesCache();
            return null;
        }

        return [
            localStorage.getItem(LC_PREFIX_PLTEMPLATES_PRIMARY) || '',
            localStorage.getItem(LC_PREFIX_PLTEMPLATES_SECONDARY) || ''
        ];
    }

    // Inserts text at the cursor's current position - originally from Wookieepedia
    function insertAtCursor(myField: HTMLTextAreaElement | HTMLElement, myValue: string): void {
        if (document.selection) {
            // IE support
            (myField as HTMLElement).focus();
            window.sel = document.selection.createRange();
            window.sel.text = myValue;
        } else if (
            (myField as HTMLTextAreaElement).selectionStart ||
            (myField as HTMLTextAreaElement).selectionStart === 0
        ) {
            // MOZILLA/NETSCAPE support
            const textArea = myField as HTMLTextAreaElement;
            const startPos = textArea.selectionStart;
            const endPos = textArea.selectionEnd;
            textArea.value =
                textArea.value.substring(0, startPos) +
                myValue +
                textArea.value.substring(endPos, textArea.value.length);
        } else {
            (myField as HTMLTextAreaElement).value += myValue;
        }
    }

    // Get preload text and add it to the text area
    function getPreloadPage(title: string): void {
        // check if subpage is standard or is case by case
        const namespace = (function (): string {
            if (typeof window.preloadTemplates_namespace === 'undefined') {
                return mwc.wgFormattedNamespaces['10'];
            }
            const nsKey = String(window.preloadTemplates_namespace);
            if (typeof mwc.wgFormattedNamespaces[nsKey] !== 'undefined') {
                return mwc.wgFormattedNamespaces[nsKey];
            }
            for (const key in mwc.wgFormattedNamespaces) {
                if (mwc.wgFormattedNamespaces[key] === nsKey) {
                    return mwc.wgFormattedNamespaces[key];
                }
            }
            return mwc.wgFormattedNamespaces['10'];
        })();

        const namespacePagename = (function (): string {
            if (namespace) return namespace + ':';
            return '';
        })();

        const effectiveSubpage = userConfig.subpage || config.subpage;
        const page =
            effectiveSubpage === 'case-by-case'
                ? namespacePagename + title
                : namespacePagename + title + '/' + effectiveSubpage;

        $.get(mw.util.wikiScript(), {
            title: page,
            action: 'raw',
            ctype: 'text/plain'
        })
            .done(function (preloadData: string) {
                // Parse some MediaWiki tags
                const preloadDataParsed = parseMW(preloadData);
                // Display error if no useful data is present
                if (preloadDataParsed === '') {
                    notFound(page);
                    return;
                }

                // Insert syntax
                const cke = document.getElementsByClassName('cke_source');
                const textbox = document.getElementById('wpTextbox1') as HTMLTextAreaElement | null;
                const cm5 = $('.CodeMirror').get(0) as HTMLElement | undefined;
                const cm6 = $('.cm-editor').get(0) as HTMLElement | undefined;

                if (window.ve && window.ve.init && window.ve.init.target && window.ve.init.target.active) {
                    // UCP Visual Editor (Source mode)
                    window.ve.init.target
                        .getSurface()
                        .getModel()
                        .getFragment()
                        .insertContent(preloadDataParsed);
                } else if (cke.length) {
                    // Visual editor
                    insertAtCursor(cke[0] as HTMLElement, preloadDataParsed);
                } else if (cm5) {
                    // CodeMirrorV5 [legacy]: text editor with syntax highlight
                    const cmEditor = cm5.CodeMirror;
                    if (cmEditor) {
                        const cmdDoc = cmEditor.getDoc();
                        cmdDoc.replaceRange(preloadDataParsed, cmdDoc.getCursor());
                    }
                } else if (cm6) {
                    // CodeMirrorV6: text editor with syntax highlight
                    // Enhanced CM6 detection with multiple fallback methods
                    const insertIntoCM6 = function (view: CodeMirror6View | null): boolean {
                        if (!view || !view.state) {
                            console.warn('[PreloadTemplates] CM6 view not available');
                            return false;
                        }

                        try {
                            const cmCursor =
                                (view.state.selection &&
                                    view.state.selection.ranges &&
                                    view.state.selection.ranges[0]) ||
                                { from: 0, to: 0 };
                            view.dispatch({
                                changes: {
                                    from: cmCursor.from,
                                    to: cmCursor.to,
                                    insert: preloadDataParsed
                                },
                                selection: { anchor: cmCursor.from }
                            });
                            view.focus();
                            return true;
                        } catch (e) {
                            console.error('[PreloadTemplates] CM6 insertion error:', e);
                            return false;
                        }
                    };

                    // Try to find the CM6 view directly from the editor element
                    let view: CodeMirror6View | null = null;

                    // Method 1: Check common properties on the CM6 element
                    const cm6Extended = cm6 as HTMLElement & {
                        cmView?: { view: CodeMirror6View };
                        CodeMirror?: { view: CodeMirror6View };
                        [key: string]: unknown;
                    };

                    if (cm6Extended.cmView && cm6Extended.cmView.view) {
                        view = cm6Extended.cmView.view;
                    } else if (cm6Extended.CodeMirror && (cm6Extended.CodeMirror as { view?: CodeMirror6View }).view) {
                        view = (cm6Extended.CodeMirror as { view: CodeMirror6View }).view;
                    }

                    // Method 2: Try mw.editingToolbar
                    if (!view && mw.editingToolbar && mw.editingToolbar.getCodeMirrorView) {
                        try {
                            view = mw.editingToolbar.getCodeMirrorView();
                        } catch (e) {
                            // Silently fail and try next method
                        }
                    }

                    // Method 3: Search through the element's properties for the view
                    if (!view) {
                        for (const prop in cm6Extended) {
                            if (
                                Object.prototype.hasOwnProperty.call(cm6Extended, prop) &&
                                cm6Extended[prop] &&
                                typeof cm6Extended[prop] === 'object'
                            ) {
                                const propObj = cm6Extended[prop] as Record<string, unknown>;
                                if (propObj.state && propObj.dispatch) {
                                    view = propObj as unknown as CodeMirror6View;
                                    break;
                                }
                                if (
                                    propObj.view &&
                                    (propObj.view as Record<string, unknown>).state &&
                                    (propObj.view as Record<string, unknown>).dispatch
                                ) {
                                    view = propObj.view as CodeMirror6View;
                                    break;
                                }
                            }
                        }
                    }

                    // Method 4: Try getting from contenteditable element
                    if (!view) {
                        const contentEditable = cm6.querySelector(
                            '[contenteditable="true"]'
                        ) as HTMLElement | null;
                        if (
                            contentEditable &&
                            (contentEditable as HTMLElement & { cmView?: { view: CodeMirror6View } }).cmView &&
                            (contentEditable as HTMLElement & { cmView: { view: CodeMirror6View } }).cmView.view
                        ) {
                            view = (contentEditable as HTMLElement & { cmView: { view: CodeMirror6View } }).cmView.view;
                        }
                    }

                    // Method 5: Use the hook system as last resort
                    if (!view) {
                        let hookExecuted = false;
                        const cm6Edit = function (_: unknown, cmEditor: unknown): void {
                            if (hookExecuted) return;

                            let hookView: CodeMirror6View | null = null;
                            if (cmEditor && typeof cmEditor === 'object') {
                                const cmEditorObj = cmEditor as Record<string, unknown>;
                                if (cmEditorObj.view) {
                                    hookView = cmEditorObj.view as CodeMirror6View;
                                } else if (cmEditorObj.state) {
                                    hookView = cmEditor as CodeMirror6View;
                                }
                            }

                            if (hookView && insertIntoCM6(hookView)) {
                                hookExecuted = true;
                                mw.hook('ext.CodeMirror.ready').remove(cm6Edit);
                            }
                        };
                        mw.hook('ext.CodeMirror.ready').add(cm6Edit);

                        // Fallback timeout
                        setTimeout(function () {
                            if (!hookExecuted) {
                                console.warn('[PreloadTemplates] Hook timeout, using textbox fallback');
                                if (textbox) {
                                    insertAtCursor(textbox, preloadDataParsed);
                                    textbox.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                                mw.hook('ext.CodeMirror.ready').remove(cm6Edit);
                            }
                        }, 500);
                    } else {
                        // Successfully found view directly
                        insertIntoCM6(view);
                    }
                } else if (textbox) {
                    insertAtCursor(textbox, preloadDataParsed);
                } else {
                    console.warn('[PreloadTemplates] Could not find textbox to bind to');
                }
            })
            .fail(function () {
                notFound(page);
            });
    }

    function appendModule(vsEditor?: boolean): void {
        if (vsEditor === true) {
            $(visualEditorSelector).after($main);
        } else {
            // Appending HTML to editor
            if ($module.length) {
                $module.after($main);
            } else if ($moduleOld.length) {
                $moduleOld.append($main);
            }
        }
    }

    // Add selector to editor
    function preInit(i18nData: I18nInterface): void {
        i18n = i18nData;
        $main = $('<div>', { id: 'preload-templates' });
        $main.append(
            $('<span>', {
                text: msg('preload')
            })
        );
        $help = $('<div>', {
            id: 'pt-help'
        }).append(
            $('<a>', {
                target: '_blank',
                href: 'https://dev.miraheze.org/wiki/PreloadTemplates',
                title: msg('devWiki'),
                text: '?'
            })
        );
        appendModule();
    }

    function listHTML(parsed: string, placeholder: string | null): string {
        return (
            mw.html.element(
                'option',
                {
                    selected: true,
                    disabled: true
                },
                placeholder || msg('choose')
            ) +
            parsed
                .split('\n')
                .map(function (line: string): string {
                    // Ignore empty lines
                    if (line.trim() === '') {
                        return '';
                    }
                    // Text in a list is the template name
                    if (line.indexOf('*') === 0) {
                        const title = line.substring(1).trim();

                        // Text after pipe is display name
                        if (title.indexOf('|') !== -1) {
                            const parts = title.split('|');
                            return mw.html.element(
                                'option',
                                {
                                    value: parts[0].trim()
                                },
                                parts[1].trim()
                            );
                        } else {
                            return mw.html.element(
                                'option',
                                {
                                    value: title
                                },
                                title
                            );
                        }
                    } else {
                        // Rest are normal strings
                        return mw.html.element(
                            'option',
                            {
                                disabled: true
                            },
                            line.trim()
                        );
                    }
                })
                .join('')
        );
    }

    // =================
    //   Initialization
    // =================

    // If the initialization failed
    function initFail(): void {
        const primaryPlPagename = userConfig.primary || config.primary;
        $main.append(
            i18n
                .msg(
                    'error',
                    mw.html.element(
                        'a',
                        {
                            href: mw.util.getUrl(primaryPlPagename)
                        },
                        primaryPlPagename
                    )
                )
                .plain(),
            $help
        );
    }

    function init(): void {
        if ($('#pt-list').length > 0 || $('#pt-list-secondary').length > 0) {
            return; // Initialize only once
        }
        const primaryPlPagename = userConfig.primary || config.primary;
        const secondaryPlPagename = userConfig.secondary || config.secondary;
        const fetchedFromCache = getListOfTemplatesFromCache(
            primaryPlPagename,
            secondaryPlPagename
        );
        if (fetchedFromCache !== null) {
            populateDropdowns(fetchedFromCache[0], fetchedFromCache[1]);
            return;
        }
        $.get(mw.util.wikiScript(), {
            title: primaryPlPagename,
            action: 'raw',
            ctype: 'text/plain',
            maxage: config.serverCacheAge,
            smaxage: config.serverCacheAge
        })
            .done(function (listData: string) {
                if (secondaryPlPagename) {
                    $.get(mw.util.wikiScript(), {
                        title: secondaryPlPagename,
                        action: 'raw',
                        ctype: 'text/plain',
                        maxage: config.serverCacheAge,
                        smaxage: config.serverCacheAge
                    })
                        .done(function (listSecondary: string) {
                            populateDropdowns(listData, listSecondary);
                            saveListOfTemplatesToCache({
                                list: listData,
                                listSecondary: listSecondary,
                                pagename: primaryPlPagename,
                                pagenameSecondary: secondaryPlPagename
                            });
                        })
                        .fail(function () {
                            // Continue even when failed to fetch the secondary list
                            populateDropdowns(listData, '');
                        });
                } else {
                    populateDropdowns(listData, '');
                    saveListOfTemplatesToCache({
                        list: listData,
                        listSecondary: '',
                        pagename: primaryPlPagename,
                        pagenameSecondary: null
                    });
                }
            })
            .fail(initFail);
    }

    function populateDropdowns(listPrimary: string, listSecondary: string): void {
        const parsedPrimary = parseMW(listPrimary); // Parse data for MediaWiki tags
        const parsedSecondary = parseMW(listSecondary); // Parse data for MediaWiki tags

        // Display error if no valid data is present
        if (parsedPrimary === '') {
            initFail();
            return;
        }

        // Create preload templates dropdown
        const dropdown = $('<select>', {
            id: 'pt-list',
            title: msg('help'),
            html: listHTML(parsedPrimary, userConfig.placeholderPrimary ?? config.placeholderPrimary)
        }).on('change', function () {
            const $this = $(this);
            const val = $this.val() as string;

            // Restore default option
            $this.find('option:first-child').prop('selected', true);

            // Preload the template on click
            getPreloadPage(val);
        });

        // Create secondaryDropdown
        const dropdownSecondary = $('<select>', {
            id: 'pt-list-secondary',
            title: msg('help'),
            html:
                parsedSecondary === ''
                    ? undefined
                    : listHTML(
                          parsedSecondary,
                          userConfig.placeholderSecondary ?? config.placeholderSecondary
                      ),
            style: parsedSecondary === '' ? 'display:none;' : undefined
        }).on('change', function () {
            const $this = $(this);
            const val = $this.val() as string;

            // Restore default option
            $this.find('option:first-child').prop('selected', true);

            // Preload the template on click
            getPreloadPage(val);
        });

        // Append template list and messages
        $main.append(dropdown, dropdownSecondary, $help);
    }

    function loadMessages(): JQuery.Promise<I18nInterface> {
        const deferred = $.Deferred<I18nInterface>();
        if (mw.loader.getState('ext.gadget.i18n-js')) {
            mw.loader.load('ext.gadget.i18n-js');
            mw.hook('dev.i18n').add(function (i18nLib: { loadMessages: (page: string, options: { apiEntrypoint: string }) => JQuery.Promise<I18nInterface> }) {
                i18nLib
                    .loadMessages('MediaWiki:PreloadTemplates', { apiEntrypoint: 'self' })
                    .done(function (messages: I18nInterface | undefined) {
                        deferred.resolve(messages || loadFallbackMessages());
                    });
            });
            return deferred.promise();
        }
        deferred.resolve(loadFallbackMessages());
        return deferred.promise();
    }

    function loadFallbackMessages(): I18nInterface {
        mw.messages.set({
            PreloadTemplates__preload: 'Preload template:',
            PreloadTemplates__choose: '(choose)',
            PreloadTemplates__help:
                'Select a template to insert its preloaded syntax at the current position',
            PreloadTemplates__devWiki: 'Check the documentation on Dev Wiki',
            PreloadTemplates__error: 'No valid syntax found at $1 or page is missing.'
        });
        return {
            msg: function (...args: string[]): I18nMessage {
                args[0] = 'PreloadTemplates__' + args[0];
                return mw.message.apply(null, args);
            },
            loadMessages: function (): JQuery.Promise<I18nInterface> {
                return $.Deferred<I18nInterface>().resolve(this).promise();
            }
        };
    }

    $.when(loadMessages(), mw.loader.using('mediawiki.util')).then(function (
        i18nData: I18nInterface
    ) {
        preInit(i18nData);
        // Doesn't work for Visual Editor, disabled
        // mw.hook('ve.activationComplete').add(function () { // Visual Editor
        //     appendModule(true);
        // });
        if (mwc.wgAction === 'edit') {
            mw.hook('wikipage.content').add(function () {
                // Add small delay to ensure DOM is ready
                setTimeout(init, 100);
            });
        }
    });
})();