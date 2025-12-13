import { PluginOption } from 'vite';
import { getFileType } from '../dev-utils/utils.js';
import { generateStylesheetBanner } from '../dev-utils/generate-banner.js';
import { GadgetsDefinition } from '../dev-utils/types.js';

/**
 * A Vite plugin that automatically adds a custom banner to each LESS/CSS file 
 * 
 * @param ghUrl 
 * @param ghBranch 
 * @param gadgetsDefinition 
 * @returns 
 */
export default function generateCssBanner(ghUrl: string, ghBranch: string, gadgetsDefinition: GadgetsDefinition): PluginOption {
  const fn = generateStylesheetBanner({ ghUrl, ghBranch, gadgetsDefinition });

  return {
    name: 'generate-css-banner',
    apply: 'build',
    enforce: 'pre',
    
    transform(src: string, id: string) {
      if (getFileType(id) === 'style') {
        return fn(id, src);
      }
      return src;
    },
  }
}