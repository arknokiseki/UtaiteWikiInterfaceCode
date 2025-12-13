import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { normalizePath } from "vite";

const rxFileExtension = /\.[a-zA-Z0-9]+$/;

/**
 * Determine if a userscript code file is a script, a stylesheet, or other asset.
 * 
 * @param filename 
 * @returns
 */
export function getFileType(filename: string): "script" | "style" | "other" {
  let extension: RegExpMatchArray | null | string = filename.match(rxFileExtension);
  if (extension !== null) {
    extension = extension[0].toLowerCase();
    switch (extension) {
      case '.js':
      case '.ts':
        return "script";
      case '.css':
      case '.less':
        return "style";
    }
  }
  return "other";
}

/**
 * 
 * @param filepath 
 * @returns 
 */
export function getFileExtension(filepath: string): string {
  const m = filepath.match(rxFileExtension);
  return m === null ? '' : m[0];
}

/**
 * For a userscript code file to be included in the bundle output,
 * resolve the file extension from development stage (e.g. .ts/.less)
 * to final build (e.g. compiled .js/.css)
 * 
 * @param filepath 
 * @returns 
 */
export function resolveFileExtension(filepath: string): string {
  filepath = filepath.replace(/\.ts$/i, '.js');
  filepath = filepath.replace(/\.less$/i, '.css');
  return filepath;
}

/**
 * 
 * @param filepath 
 * @returns 
 */
export function removeFileExtension(filepath: string): string {
  return filepath.replace(rxFileExtension, '');
}

/**
 * Used to resolve the bundle input key for compiled JS/CSS
 * @param filepath 
 * @returns 
 */
export function resolveFilepathForBundleInputKey(filepath: string): string {
  const sm = filepath.match(/^(.*)\.(?:ts|js)$/i);
  if (sm !== null) {
    return sm[1];
  }
  return resolveFileExtension(filepath);
}

/**
 * Resolves the path of the `src/` directory in the project
 * 
 * @returns 
 */
export function resolveSrcPath(): string {
  const srcDirPath = normalizePath(resolve(__dirname, '../src'));
  if (!existsSync(srcDirPath)) {
    mkdirSync(srcDirPath); 
  }
  return srcDirPath;
}

/**
 * Resolves the path of the `src/gadgets` directory. If `gadgetSectionName` and `gadgetName`
 * is provided, then this function will resolve the path of the gadget section / gadget's 
 * subdirectory.
 * 
 * @param gadgetSectionName 
 * @param gadgetName 
 * @param codeRelativePath
 * @returns 
 */
export function resolveSrcGadgetsPath(gadgetSectionName?: string, gadgetName?: string, codeRelativePath?: string): string {
  const srcDirPath = resolveSrcPath();
  const gadgetsDir = resolve(srcDirPath, './gadgets');
  let gadgetDir = gadgetsDir;
  for (let rel of [gadgetSectionName, gadgetName, codeRelativePath]) {
    if (!rel) { break; }
    gadgetDir = resolve(gadgetDir, rel);
  }
  return normalizePath(gadgetDir);
}

/**
 * Resolves the path of the `src/mediawiki` directory. If `filename` is given then 
 * this function will resolve the path of the file within the directory.
 * 
 * @param filename 
 */
export function resolveSrcMediawikiCodePath(filename?: string): string {
  const srcDirPath = resolveSrcPath();
  const mediawikiDir = resolve(srcDirPath, './mediawiki');
  let fileDir = mediawikiDir;
  if (!!filename) {
    fileDir = resolve(fileDir, filename);
  }
  return normalizePath(fileDir);
}

/**
 * Resolves the path of `src/gadgets/gadgets-definitions.yaml`
 */
export function resolveGadgetsDefinitionManifestPath(): string {
  return resolveSrcGadgetsPath('gadgets-definition.yaml');
}

/**
 * Resolves the path of the `dist/` directory. If a relative filepath is given, resolve
 * the path to the given relative filepath. 
 * 
 * @returns 
 */
export function resolveDistPath(relativeFilepath?: string): string {
  const distFolder = resolve(__dirname, '../dist');
  if (!existsSync(distFolder)) {
    mkdirSync(distFolder);
  }
  let dir = distFolder;
  if (!!relativeFilepath) {
    dir = resolve(dir, relativeFilepath);
  }
  if (!existsSync(dir)) {
    mkdirSync(dir);
  }
  return dir;
}

/**
 * Resolves the path of the `dist/gadgets` directory. If `gadgetSectionName` and `gadgetName`
 * is provided, then this function will resolve the path of the gadget section / gadget's 
 * subdirectory.
 * 
 * @param gadgetSectionName 
 * @param gadgetName 
 * @param codeRelativePath
 * @returns 
 */
export function resolveDistGadgetsPath(gadgetSectionName?: string, gadgetName?: string, codeRelativePath?: string): string {
  const srcDirPath = resolveDistPath();
  const gadgetsDir = resolve(srcDirPath, './gadgets');
  let gadgetDir = gadgetsDir;
  for (let rel of [gadgetSectionName, gadgetName, codeRelativePath]) {
    if (!rel) { break; }
    gadgetDir = resolve(gadgetDir, rel);
  }
  return normalizePath(gadgetDir);
}

/**
 * Resolves the path of the `dist/mediawiki` directory. If `filename` is given then 
 * this function will resolve the path of the file within the directory.
 * 
 * @param filename 
 */
export function resolveDistMediawikiCodePath(filename?: string): string {
  const srcDirPath = resolveDistPath();
  const mediawikiDir = resolve(srcDirPath, './mediawiki');
  let fileDir = mediawikiDir;
  if (!!filename) {
    fileDir = resolve(fileDir, filename);
  }
  return normalizePath(fileDir);
}

/**
 * Resolves the path of `dist/load.js`
 * 
 * @returns 
 */
export function resolveEntrypointFilepath(): string {
  const distFolder = resolveDistPath();
  return normalizePath(resolve(distFolder, 'load.js'));
}

/**
 * Check if a gadget sub-directory or a gadget code file exists
 * 
 * @param gadgetSection 
 * @param gadgetName 
 * @param codeFile 
 * @returns 
 */
export function checkGadgetExists(gadgetSection: string, gadgetName: string, codeFile?: string): boolean {
  const path = resolveSrcGadgetsPath(gadgetSection, gadgetName, codeFile);
  return existsSync(path);
}

/**
 * 
 * @param gadgetSection 
 * @param gadgetName 
 * @returns 
 */
export function getGadgetId(gadgetSection: string, gadgetName: string) {
  return `${gadgetSection}/${gadgetName}`;
}