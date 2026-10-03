import { writeFile } from 'fs/promises';
import { normalizePath } from 'vite';
import { resolve } from 'path';
import type { GadgetDefinition, GadgetsDefinition, ResourceLoaderConditions } from './types.js';
import { resolveDistPath, resolveFileExtension } from './utils.js';

/**
 * Resolve the path to dist/gadgets/gadgets-definition.wikitext
 * 
 * @returns 
 */
function resolveGadgetsDefinitionWikitextFile(): string {
  const gadgetsFolder = resolveDistPath("./gadgets");
  return normalizePath(resolve(gadgetsFolder, 'gadgets-definition.wikitext'));
}

/**
 * Generate the contents of MediaWiki:Gadgets-definition
 * 
 * @param gadgetsDefinition 
 */
export async function writeWikitextFile(gadgetsDefinition: GadgetsDefinition): Promise<void> {
  try {
    const gadgetsDefinitionWikitextFile = resolveGadgetsDefinitionWikitextFile();

    const { 'enable_all': enableAll = true, enable = [], disable = [] } = gadgetsDefinition.workspace;
    const hmGadgetNames = new Set(enableAll ? disable : enable);

    let s: string[] = [];
    for (const [gadgetSectionName, gadgets] of Object.entries(gadgetsDefinition.gadgets)) {
      s.push(`== ${gadgetSectionName} ==`);
      let subsection: string | undefined;
      for (const [gadgetName, gadgetDefinition] of Object.entries(gadgets)) {
        const gadgetId = `${gadgetSectionName}/${gadgetName}`;
        if ((enableAll && hmGadgetNames.has(gadgetId)) || (!enableAll && !hmGadgetNames.has(gadgetId))) continue;
        const wikitext = createSingleGadgetDefinitionWikitext(gadgetName, gadgetDefinition);
        if (wikitext !== null) {
          if (gadgetDefinition.subsection && gadgetDefinition.subsection !== subsection) {
            s.push(`=== ${gadgetDefinition.subsection} ===`);
          }
          subsection = gadgetDefinition.subsection;
          if (gadgetDefinition.comment) {
            s.push(formatComment(gadgetDefinition.comment));
          }
          s.push(wikitext);
        }
      }
      s.push('');
    }

    await writeFile(gadgetsDefinitionWikitextFile, s.join('\n'), { flag: "w+", encoding: "utf8" });
  } catch (err) {
    console.error('Unable to create the contents of gadgets-definition.wikitext');
    console.error(err);
  }
}

/**
 * Create one gadget definition item in MediaWiki:Gadgets-definition
 * 
 * @param gadgetName 
 * @param gadgetDefinition 
 * @returns 
 */
function createSingleGadgetDefinitionWikitext(gadgetName: string, gadgetDefinition: GadgetDefinition): string | null {
  if (gadgetDefinition.disabled) return null;
  let { code: gadgetCodeFiles = [], resourceLoader = {} } = gadgetDefinition;
  
  gadgetCodeFiles = gadgetCodeFiles
    .map((filename) => resolveFileExtension(filename));
  
  const resourceLoaderConditions = compileResourceLoaderConditions(resourceLoader);
  const flags = resourceLoaderConditions !== null ? `|${resourceLoaderConditions}` : '';

  const line = `* ${gadgetName}[ResourceLoader${flags}]|${gadgetCodeFiles.join('|')}`;
  return gadgetDefinition.commentedOut ? `<!-- ${line} -->` : line;
}

/**
 * Wrap a note in an HTML comment, indenting continuation lines to line up after "<!-- "
 *
 * @param comment
 * @returns
 */
function formatComment(comment: string): string {
  const lines = comment.trim().split('\n');
  return `<!-- ${lines.map((line, i) => (i === 0 ? line : `     ${line}`)).join('\n')} -->`;
}

/**
 * Helper function for `createSingleGadgetDefinitionWikitext()`
 * 
 * @param resourceLoader 
 * @returns 
 */
function compileResourceLoaderConditions(resourceLoader: ResourceLoaderConditions): string | null {
  const conditions = [];
  
  const normalizeVariable = (variable: string | string[]) => {
    if (typeof variable === 'string') {
      return variable.split(/\s*,\s*/);
    }
    return variable;
  }
  const variablesToNormalize = {
    dependencies: resourceLoader.dependencies,
    actions: resourceLoader.actions,
    categories: resourceLoader.categories,
    contentModels: resourceLoader.contentModels,
    skins: resourceLoader.skins,
    namespaces: resourceLoader.namespaces,
    rights: resourceLoader.rights
  }
  
  // Keep the order the flags are written in the yaml, so the output can match the
  // wiki's existing definition line for line
  for (const key of Object.keys(resourceLoader) as (keyof ResourceLoaderConditions)[]) {
    if (key === 'default' || key === 'hidden') {
      if (resourceLoader[key] === true) conditions.push(key);
    } else if (key === 'type' || key === 'supportsUrlLoad') {
      if (!!resourceLoader[key]) conditions.push(`${key}=${resourceLoader[key]}`);
    } else if (key in variablesToNormalize) {
      const variables = variablesToNormalize[key as keyof typeof variablesToNormalize];
      if (!!variables) conditions.push(`${key}=${normalizeVariable(variables)}`);
    }
  }

  return conditions.length > 0 ? conditions.join('|') : null;
}