/**
 * Schema for gadgets-definition.yaml 
 */
export interface GadgetsDefinition {
  workspace: {
    // If enable_all is set to true, Vite will include all gadgets except those in "workspace.disable"
    // If enable_all is set to false, Vite will only include gadgets listed in "workspace.enable"
    enable_all?: boolean
    enable?: string[]
    disable?: string[]
  }
  gadgets: {
    [GadgetSectionName: string]: {
      [GadgetName: string]: GadgetDefinition
    }
  }
}

/**
 * Basic schema for one gadget
 */
export interface GadgetDefinition {
  /**
   * Purely informational metadata 
   */ 
  description?: string
  /**
   * Purely informational metadata 
   */ 
  authors?: string[]
  /**
   * Purely informational metadata 
   */ 
  links?: string[]
  /**
   * Purely informational metadata 
   */ 
  version?: string

  /**
   * Specify this parameter if the module needs other modules on this project to be registered first.
   * The required module just needs to have `state=registered` on `mw.loader`, not `state=ready`
   */ 
  requires?: string[]

  /**
   * List of scripts and stylesheets.
   */
  code?: string[]

  /**
   * List of i18n messages. Currently unused.
   */
  i18n?: string[]
 
  /**
   * The gadget section name is automatically set during the build process
   */ 
  section: string

  /**
   * The gadget name is automatically set during the build process
   */ 
  name: string

  /**
   * If set to true on the gadgets definition, then Vite will exclude this file
   * from the list of gadgets that will be served/distributed 
   */
  disabled?: boolean

  /**
   * If set to true, the gadget's code is still built and synced, but its line in
   * MediaWiki:Gadgets-definition is wrapped in an HTML comment (`<!-- * ... -->`),
   * so the gadget isn't registered on the wiki.
   */
  commentedOut?: boolean

  /**
   * Note written as an HTML comment on the line(s) above the gadget in
   * MediaWiki:Gadgets-definition. Multi-line strings keep their line breaks.
   */
  comment?: string

  /**
   * Optional `=== subsection ===` heading the gadget is listed under, within its section.
   * Gadgets sharing a subsection should be adjacent in the yaml.
   */
  subsection?: string

  /**
   * Files copied byte-for-byte to the gadget's dist folder instead of being bundled
   * (vendor builds, minified libraries, JSON data). Listed in `code` too, they appear
   * in the gadget definition; otherwise they are synced as standalone pages that other
   * code loads at runtime.
   */
  verbatim?: string[]

  /**
   * Specify specific loading conditions. Used to emulate MediaWiki's ResourceLoader.
   * Flags are written to MediaWiki:Gadgets-definition in the order they appear here.
   */
  resourceLoader?: ResourceLoaderConditions
}

/**
 * Refer to https://www.mediawiki.org/wiki/Extension:Gadgets#Options 
 * for more information on what these parameters mean 
 */
export interface ResourceLoaderConditions {
  default?: boolean
  hidden?: boolean
  
  dependencies?: string | string[] | null
  rights?: string | string[] | null
  skins?: string | string[] | null
  actions?: string | string[] | null
  categories?: string | string[] | null
  namespaces?: string | string[] | null
  contentModels?: string | string[] | null
  
  type?: "styles" | "general" | null 
  supportsUrlLoad?: string
}

export interface ViteCustomCliArguments {
  cmd?: 'build' | 'watch-build' | 'rollup'
  minify?: boolean
}