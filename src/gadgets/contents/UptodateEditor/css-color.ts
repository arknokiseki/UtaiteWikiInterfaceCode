/**
 * Classifies the `bordercolor` value the way Module:Freshness/core does, so the
 * modal can tell an editor what will actually happen before they save.
 *
 * Three outcomes matter:
 *
 *   hex   — `#RRGGBB`. Faded toward grey numerically in Lua. This is the only
 *           form the module accepts today, and its behaviour is unchanged.
 *   css   — any other CSS colour we are willing to emit: X11 names, `var(--x)`,
 *           `rgb()`, short hex. Lua cannot resolve these to RGB, so the fade is
 *           handed to the browser via `color-mix()`. Requires the pending
 *           Module:Freshness/core patch; without it these render as the default.
 *   invalid — silently ignored by the module, which falls back to its default
 *           colour with no warning. This is what made `magenta` look broken.
 *
 * Pure: no `mw` dependency.
 */

export type ColorKind = 'empty' | 'hex' | 'css' | 'invalid';

/** Exactly `#RRGGBB` or `RRGGBB` — what `core.is_hex` accepts. */
export function isHexColor(value: string): boolean {
    return /^#?[0-9a-fA-F]{6}$/.test(value.trim());
}

/**
 * Conservative allowlist of CSS colour syntaxes safe to place in an inline
 * style attribute. Anything that could break out of the attribute is rejected
 * here; MediaWiki's sanitizer is a second line of defence, not the first.
 */
export function isCssColor(value: string): boolean {
    const s = value.trim();
    if (s === '') return false;
    if (/[;{}"'<>\\]/.test(s)) return false;

    const low = s.toLowerCase();
    if (low.indexOf('expression') !== -1) return false;
    if (low.indexOf('javascript') !== -1) return false;
    if (low.indexOf('url') !== -1) return false;

    // #RGB, #RGBA, #RRGGBB, #RRGGBBAA
    if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return true;
    // X11 / CSS named colours, plus keywords like `transparent`, `currentColor`
    if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(s)) return true;
    // var(--name) and var(--name, fallback)
    if (/^var\(\s*--[\w-]+\s*(,[^()]*)?\)$/.test(s)) return true;
    // rgb()/rgba()/hsl()/hsla(), legacy comma and modern space syntax
    if (/^(rgba?|hsla?)\([\d\s.,%/a-z]*\)$/i.test(s)) return true;

    return false;
}

/** Which of the three module outcomes this value will hit. */
export function classifyColor(value: string): ColorKind {
    if (value.trim() === '') return 'empty';
    if (isHexColor(value)) return 'hex';
    if (isCssColor(value)) return 'css';
    return 'invalid';
}

/** Editor-facing explanation of what the module will do with this value. */
export function describeColor(value: string): string {
    switch (classifyColor(value)) {
        case 'empty':
            return '';
        case 'hex':
            return 'Valid. Fades toward grey as the list ages, reaching full grey at 30 months.';
        case 'css':
            return 'Accepted, and faded in the browser via color-mix(). '
                + 'Requires the Module:Freshness patch — without it this renders as the default colour.';
        default:
            return 'Not a colour Freshness recognises. It will be ignored and the default colour used instead.';
    }
}
