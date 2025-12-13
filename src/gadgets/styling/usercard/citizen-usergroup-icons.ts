interface RoleConfig {
    icon: string;
    color: string;
}

interface FontAwesomeApi {
    dom: {
        i2svg: (params: { node: Node }) => void;
    };
}

declare global {
    interface Window {
        FontAwesome?: FontAwesomeApi;
    }
}

declare const mw: {
    hook: (name: string) => {
        add: (handler: (content: JQuery<HTMLElement>) => void) => void;
    };
};

declare const mediaWiki: typeof mw;

// --- Implementation ---

(function (mw: typeof mediaWiki, $: JQueryStatic): void {
    'use strict';

    if (document.body.classList.contains('mw-mf') || document.body.classList.contains('is-mobile-device')) {
        return;
    }

    const ROLE_ICON_MAP: Record<string, RoleConfig> = {
        'user':              { icon: 'fa-user',            color: '#95a5a6' },
        'sysop':             { icon: 'fa-shield',          color: '#c0392b' },
        'suppress':          { icon: 'fa-eye-slash',       color: '#34495e' },
        'steward':           { icon: 'fa-scale-balanced',  color: '#f39c12' },
        'smweditor':         { icon: 'fa-pen-to-square',   color: '#00cec9' },
        'smwcurator':        { icon: 'fa-layer-group',     color: '#2980b9' },
        'rollbacker':        { icon: 'fa-rotate-left',     color: '#d35400' },
        'no-ipinfo':         { icon: 'fa-ban',             color: '#7f8c8d' },
        'interface-admin':   { icon: 'fa-code',            color: '#16a085' },
        'csmoderator':       { icon: 'fa-comments',        color: '#ff9f43' },
        'content-moderator': { icon: 'fa-broom',           color: '#6c5ce7' },
        'confirmed':         { icon: 'fa-circle-check',    color: '#16a085' },
        'commentadmin':      { icon: 'fa-comment-dots',    color: '#2ecc71' },
        'checkuser':         { icon: 'fa-user-secret',     color: '#2c3e50' },
        'chatmod':           { icon: 'fa-comment',         color: '#fd7e14' },
        'bureaucrat':        { icon: 'fa-crown',           color: '#8e44ad' },
        'bot':               { icon: 'fa-robot',           color: '#3498db' },
        'blockedfromchat':   { icon: 'fa-comment-slash',   color: '#e74c3c' },
        'autopatrolled':     { icon: 'fa-check-double',    color: '#27ae60' },
        'autoconfirmed':     { icon: 'fa-user-check',      color: '#1abc9c' }
    };

    function iconizeRoles(root: Element): void {
        const list = root.querySelector('ul.citizen-userInfo-usergroups');
        if (!list) return;

        const items = list.querySelectorAll('li.citizen-userInfo-usergroup');
        for (let i = 0; i < items.length; i++) {
            const li = items[i] as HTMLElement;
            if (li.dataset.uwRoleIconized === '1') continue;

            const id = li.id || '';
            const m = id.match(/^group-(.+)-member$/);
            if (!m) continue;

            const key = m[1]; // e.g., 'interface-admin'
            const cfg = ROLE_ICON_MAP[key] || ROLE_ICON_MAP.user;

            const a = li.querySelector('a');
            if (!a) continue;

            if (a.querySelector('.uw-role-icon')) {
                li.dataset.uwRoleIconized = '1';
                continue;
            }

            const badge = document.createElement('span');
            badge.className = 'uw-role-icon';
            badge.style.backgroundColor = cfg.color;

            const icon = document.createElement('i');
            icon.className = 'fa-solid ' + cfg.icon;
            icon.setAttribute('aria-hidden', 'true');

            badge.appendChild(icon);
            a.insertBefore(badge, a.firstChild);
            li.dataset.uwRoleIconized = '1';
        }

        if (window.FontAwesome && window.FontAwesome.dom && typeof window.FontAwesome.dom.i2svg === 'function') {
            window.FontAwesome.dom.i2svg({ node: list });
        }
    }

    function runAll(): void {
        const cards = document.querySelectorAll('#citizen-userMenu__card');
        for (let i = 0; i < cards.length; i++) {
            iconizeRoles(cards[i]);
        }
    }

    // Initial run
    $(runAll);

    mw.hook('wikipage.content').add(function ($content: JQuery<HTMLElement>): void {
        $content.find('#citizen-userMenu__card').each(function (this: Element) {
            iconizeRoles(this);
        });
    });

    const obs = new MutationObserver(function (muts: MutationRecord[]): void {
        for (let i = 0; i < muts.length; i++) {
            const mut = muts[i];
            const addedNodes = mut.addedNodes;
            for (let j = 0; j < addedNodes.length; j++) {
                const n = addedNodes[j];
                if (n.nodeType !== 1) continue;
                
                const element = n as Element;
                if (element.id === 'citizen-userMenu__card') {
                    iconizeRoles(element);
                } else if (element.querySelector) {
                    const card = element.querySelector('#citizen-userMenu__card');
                    if (card) iconizeRoles(card);
                }
            }
        }
    });

    obs.observe(document.body, { childList: true, subtree: true });

})(mediaWiki, jQuery);