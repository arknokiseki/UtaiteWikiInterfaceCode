import { readFileSync } from 'fs';
import { PluginOption } from 'vite';

const MARKER = '__KEEP_USE_STRICT__();';

/**
 * Rollup treats every gadget file as an ES module and drops its 'use strict'
 * directives, but ResourceLoader runs gadget code as a classic script, so the
 * code would silently run in sloppy mode.
 *
 * Files whose source contains `@keep-use-strict` keep their directives: they are
 * swapped for a marker call before bundling (which tree-shaking keeps) and put
 * back after. Opt-in, because the existing gadgets have always been deployed
 * without them.
 */
export default function preserveUseStrict(): PluginOption {
  return {
    name: 'preserve-use-strict',
    apply: 'build',
    enforce: 'post',

    transform(code: string, id: string) {
      if (!/\.(ts|js)$/.test(id)) return null;
      let original: string;
      try {
        original = readFileSync(id, 'utf8');
      } catch {
        return null;
      }
      if (!original.includes('@keep-use-strict')) return null;
      // a directive at the start of the file or of a function body
      const out = code.replace(/(^|\{)(\s*)(['"])use strict\3;?/g, `$1$2${MARKER}`);
      return { code: out, map: null };
    },

    renderChunk(code: string) {
      if (!code.includes(MARKER)) return null;
      return { code: code.split(MARKER).join('"use strict";'), map: null };
    },
  };
}
