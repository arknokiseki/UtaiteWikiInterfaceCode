import { PluginOption } from 'vite';

// C0 controls other than tab, LF and CR, plus DEL
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * MediaWiki replaces raw control characters with U+FFFD when a page is saved, so
 * a built file containing one silently changes on sync. esbuild prints string
 * escapes such as '\u0001' as the raw character, so fail the build instead.
 * Build the character at runtime (String.fromCharCode) where one is needed.
 */
export default function noControlChars(): PluginOption {
  return {
    name: 'no-control-chars',
    apply: 'build',
    enforce: 'post',

    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        const text = output.type === 'chunk' ? output.code
          : typeof output.source === 'string' ? output.source : null;
        if (text === null) continue;
        const m = CONTROL.exec(text);
        if (m) {
          const code = m[0].charCodeAt(0).toString(16).padStart(4, '0');
          this.error(`${fileName}: raw control character U+${code} at offset ${m.index}; `
            + 'MediaWiki would replace it with U+FFFD on save');
        }
      }
    },
  };
}
