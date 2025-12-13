import { resolveSrcPath } from '../dev-utils/utils.js';
import { relative } from 'path';
import { normalizePath } from 'vite';

export enum ViteServerChangeMode {
  Unchanged,
  GadgetsDefinitionIsUpdated,
  SrcFileIsUpdated,
  SrcFileIsAdded,
  SrcFileIsDeleted
}

/**
 * When a hot rebuild is triggered on Vite Serve, check if the changed file
 * necessitates a full or partial rebuild of the gadgets directory.
 * 
 * @param type
 * @param filepath
 */
export function checkChangedFile(type: "create" | "update" | "delete", filepath: string): ViteServerChangeMode {
  const srcPath = resolveSrcPath();
  
  // Only subscribe to changes in the gadgets or mediawiki directory
  if (!normalizePath(filepath).startsWith(srcPath)) {
    return ViteServerChangeMode.Unchanged;
  }
  // File gadgets-definition.yaml is changed
  const relativeFilePath = relative(srcPath, filepath);
  if (relativeFilePath === 'gadgets/gadgets-definition.yaml') {
    switch (type) {
      case "create":
      case "update":
        return ViteServerChangeMode.GadgetsDefinitionIsUpdated;
      case "delete":
      default:
        // Do not rebuild when gadgets-definition.yaml is deleted
        return ViteServerChangeMode.Unchanged;
    }
  }
  switch (type) {
    case "create":
      return ViteServerChangeMode.SrcFileIsAdded;
    case "delete":
      return ViteServerChangeMode.SrcFileIsDeleted;
    case "update":
      return ViteServerChangeMode.SrcFileIsUpdated;
  }
  return ViteServerChangeMode.Unchanged;
}