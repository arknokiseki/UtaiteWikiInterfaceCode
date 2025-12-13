import { relative, resolve } from 'path';
import { normalizePath } from 'vite';
import wrap from 'word-wrap'; 
import { GadgetDefinition, GadgetsDefinition } from './types.js';
import { getFileType } from './utils.js';
import { RenderedChunk } from "rollup";
import { resolveSrcPath } from './utils.js';

/**
 * Creates a piece of text to be added to bundled JS & CSS files
 * 
 * @param ghUrl URL to Git Repository
 * @param ghBranch name of Git branch (default: development)
 * @param id id of bundle input
 * @param gadgetDefinition defines gadget metadata
 * @returns 
 */
function generateBanner({ ghUrl, ghBranch = 'development', id, gadgetDefinition }: { ghUrl: string, ghBranch?: string, id: string, gadgetDefinition?: GadgetDefinition }): string {
  const projectRootDir = resolve(__dirname, "../");
  
  const fileType = getFileType(id);
  let tag = '';
  switch (fileType) {
    case 'script':
      tag = '[[Category:Scripts]]';
      break;
    case 'style':
      tag = '[[Category:Stylesheets]]';
      break;
  }

  const url = `${ghUrl}/blob/${ghBranch}/${normalizePath(relative(projectRootDir, id))}`;

  const { description = '', authors = [], links = [] } = gadgetDefinition || { description: '', authors: [], links: [] };
  
  return (
`
/*!
 ${'*'.padEnd(80, '*')}
 *\n${wrap(description, { width: 78, indent: ' * ' })}${authors.length > 0 ? `\n * Authors: \n${authors.map(s => ` * - ${s}`).join('\n')}` : ''}${links.length > 0 ? `\n * Links:\n${links.map(s => ` * - ${s}`).join('\n')}` : ''}
 * 
 * This file has been synced with the shared repository on GitHub.
 * GitHub Repository: ${ghUrl}
 * Please do not edit this page directly.
 * 
 * Source code:
 * ${url}
 * 
 * ${tag}
 * 
 *${'*'.padEnd(78, '*')}*/`
  ).trim() + '\n\n';
}

/**
 * Resolve the object keys belonging to the gadget in the shared GadgetsDefinition object
 * 
 * @param id id of bundle input
 * @returns [gadgetSectionName, gadgetName]
 */
function getGadgetKeysFromChunkName(id: string): [string, string] | null {
  const m = id.match(/^gadgets\/([^\/]+)\/([^\/]+).*$/);
  if (m === null) { 
    return null;
  }
  const [_, gadgetSectionName, gadgetName] = m;
  return [gadgetSectionName, gadgetName];
}

/**
 * Creates a callable that is injected into `build.rollupOptions.output` in vite.config.ts. 
 * 
 * @param ghUrl
 * @param ghBranch
 * @param gadgetsDefinition 
 * @returns 
 */
export function generateScriptBanner({ ghUrl, ghBranch, gadgetsDefinition }: { ghUrl: string, ghBranch: string, gadgetsDefinition: GadgetsDefinition }) {
  return (chunk: RenderedChunk): string => {
    if (getFileType(chunk.name) === 'style') {
      return '';
    }
    const id = chunk.facadeModuleId || chunk.moduleIds[0]!;
    const m = getGadgetKeysFromChunkName(chunk.name);
    const gadgetDefinition = (
      m !== null ? gadgetsDefinition.gadgets[m[0]][m[1]] : undefined
    );
    return generateBanner({ ghUrl, ghBranch, id, gadgetDefinition });
  }
}

/**
 * Creates a callable that is injected into a custom Vite plugin that is responsible
 * for adding the auto-generated banners to bundled CSS files.
 * 
 * @param ghUrl
 * @param ghBranch
 * @param gadgetsDefinition 
 * @returns 
 */
export function generateStylesheetBanner({ ghUrl, ghBranch, gadgetsDefinition }: { ghUrl: string, ghBranch: string, gadgetsDefinition: GadgetsDefinition }) {
  const rootDir = resolveSrcPath();
  return (id: string, src: string) => {
    id = normalizePath(relative(rootDir, id));
    const m = getGadgetKeysFromChunkName(id);
    const gadgetDefinition = (
      m !== null ? gadgetsDefinition.gadgets[m[0]][m[1]] : undefined
    );
    return `${generateBanner({ ghUrl, ghBranch, id: `src/${id}`, gadgetDefinition })}\n${src}`;
  }
}