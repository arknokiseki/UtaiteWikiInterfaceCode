/**
 * CustomIconManager.js
 * Provides a Modal UI editor for MediaWiki:CustomIcon.json.
 * Only executes on Special:CustomIcon.
 */
mw.loader.using(['mediawiki.api', 'mediawiki.notify']).then(function () {
    if (mw.config.get('wgCanonicalSpecialPageName') !== 'CustomIcon') return;

    const editBtn = document.querySelector('.id-edit-icons-btn');
    if (!editBtn) return;

    editBtn.addEventListener('click', function () {
        const api = new mw.Api();

        api.get({
            action: 'query',
            titles: 'MediaWiki:CustomIcon.json',
            prop: 'revisions',
            rvprop: 'content',
            rvslots: 'main',
            formatversion: 2
        }).then(data => {
            const page = data.query.pages[0];
            const content = page.missing ? '{\n  \n}' : page.revisions[0].slots.main.content;
            const contentHtml = `
                <div style="margin-bottom: 10px; font-size: 14px;">
                    <p>Edit the mapping below. <strong>Key</strong> = class name (e.g., <code>uw-kakkokawa</code>), <strong>Value</strong> = SVG filename (e.g., <code>Amatsuki_kakkokawa.svg</code>).</p>
                </div>
                <textarea id="uw-icon-json-editor" style="width: 100%; height: 350px; font-family: 'Courier New', monospace; background: #1e1e1e; color: #d4d4d4; padding: 12px; border: 1px solid #444; border-radius: 6px; resize: vertical; line-height: 1.5;" spellcheck="false">${mw.html.escape(content)}</textarea>
            `;

            const footerHtml = `
                <button id="uw-icon-save" class="mw-ui-button mw-ui-progressive" style="background: var(--tm-accent);">Save Changes</button>
                <span id="uw-icon-status" style="margin-left: 15px; color: #666; font-size: 0.9em; font-weight: bold;"></span>
            `;

            const modal = (window as any).createToolModal({
                toolId: 'custom-icon-editor',
                title: 'Edit Custom Icons Database',
                theme: 'docs',
                contentHtml: contentHtml,
                showFooter: true,
                footerHtml: footerHtml
            });

            modal.open();

            document.getElementById('uw-icon-save')!.addEventListener('click', function() {
                const newJsonStr = (document.getElementById('uw-icon-json-editor')! as any).value;
                const statusIndicator = document.getElementById('uw-icon-status');

                try {
                    const parsed = JSON.parse(newJsonStr);
                    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                        throw new Error("Root must be a JSON object.");
                    }
                } catch (e) {
                    statusIndicator!.style.color = '#ef4444'; // red
                    statusIndicator!.textContent = '❌ Invalid JSON syntax!';
                    mw.notify('Invalid JSON syntax: ' + e.message, { type: 'error' });
                    return;
                }

                statusIndicator!.style.color = 'inherit';
                statusIndicator!.textContent = 'Saving to wiki...';

                api.postWithToken('csrf', {
                    action: 'edit',
                    title: 'MediaWiki:CustomIcon.json',
                    text: newJsonStr,
                    summary: 'Updated Custom Icons mapping via Modal UI',
                    minor: true
                }).then(() => {
                    statusIndicator!.style.color = '#16a34a';
                    statusIndicator!.textContent = '✔ Saved successfully!';
                    mw.notify('Icons updated successfully! Refreshing page...');

                    localStorage.removeItem('uw_custom_icons_css');
                    localStorage.removeItem('uw_custom_icons_time');

                    setTimeout(() => window.location.reload(), 1500);
                }).catch(err => {
                    statusIndicator!.style.color = '#ef4444'; // red
                    statusIndicator!.textContent = '❌ Failed to save.';
                    mw.notify('API Error: ' + err, { type: 'error' });
                });
            });
        }).catch(err => {
            mw.notify('Failed to load JSON data: ' + err, { type: 'error' });
        });
    });
});

export {};
