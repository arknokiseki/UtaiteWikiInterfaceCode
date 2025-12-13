import { writeWikitextFile } from '../dev-utils/generate-gadgets-definition-wikitext.js';
import { PluginOption } from 'vite';
import type { GadgetsDefinition } from '../dev-utils/types.js';

/**
 * A Vite plugin that automatically generates the contents of MediaWiki:Gadgets-definition 
 * The contents are saved onto dist/gadgets/gadgets-definition.wikitext
 *
 * @param gadgetsDefinition 
 * @returns 
 */
export default function generateGadgetsDefinitionWikitext(
  gadgetsDefinition: GadgetsDefinition
): PluginOption {
  
  return {
    name: 'generate-gadgets-definition-wikitext',
    enforce: 'post', // Enforce after Vite build plugins
    apply: 'build',

    // Build Mode
    closeBundle() {
      const startTime = Date.now();
      this.info('Creating dist/gadgets/gadgets-definition.wikitext...');
      writeWikitextFile(gadgetsDefinition)
        .then(() => this.info(`Created dist/gadgets/gadgets-definition.wikitext in ${(Date.now() - startTime) / 1000} s`));
    },
  }
}