--<pre>
----------------------------------------------------------------------------------------------------
--
--                         '''Configuration for [[Module:Documentation]]'''
--
-- Here you can set the values of the parameters and messages used in [[Module:Documentation]]
-- to localise it to your wiki and your language. Unless specified otherwise, values given here
-- should be string values.
--
-- @submodule documentation.config
-- @alias cfg
----------------------------------------------------------------------------------------------------

local cfg = {} -- Do not edit this line.

-- -------------------------------------------------------------------------------------------------
-- Protection template configuration
-- -------------------------------------------------------------------------------------------------

--- The protection reason for edit-protected templates to pass
--  to Module:Protection banner.
--  @property {string} cfg['protection-reason-edit']
cfg['protection-reason-edit'] = 'template'

-- -------------------------------------------------------------------------------------------------
-- Templates
-- -------------------------------------------------------------------------------------------------
--- A name of the template for Table of Contents in right alignment.
--  @property {string} cfg['template-tocright']
cfg['template-tocright'] = 'TOC Right'

-- -------------------------------------------------------------------------------------------------
-- Sandbox notice configuration
--
-- On sandbox pages the module can display a template notifying users that the current page is a
-- sandbox. The module decides whether the page is a
-- sandbox or not based on the value of cfg['sandbox-subpage']. The following settings configure the
-- messages that the notices contains.
-- -------------------------------------------------------------------------------------------------

-- Not yet converted to the new format

--- Whether to show the sandbox notice on `/sandbox` subpages
--  @property {boolean} cfg['sandbox-notice-show']
cfg['sandbox-notice-show'] = true

--- The file displayed in the sandbox notice.
--  @property {string} cfg['sandbox-notice-image']
cfg['sandbox-notice-image'] = 'Ivudot_Sotto_Blue.png'

--[[
-- cfg['sandbox-notice-pagetype-template']
-- cfg['sandbox-notice-pagetype-module']
-- cfg['sandbox-notice-pagetype-other']
-- The page type of the sandbox page. The message that is displayed depends on the current subject
-- namespace. This message is used in either cfg['sandbox-notice-blurb'] or
-- cfg['sandbox-notice-diff-blurb'].
--]]
cfg['sandbox-notice-pagetype-template'] = 'template draft page'
cfg['sandbox-notice-pagetype-module'] =   'module draft page'
cfg['sandbox-notice-pagetype-other'] = 'draft page'

--[[
-- cfg['sandbox-notice-blurb']
-- cfg['sandbox-notice-diff-blurb']
-- cfg['sandbox-notice-diff-display']
-- Either cfg['sandbox-notice-blurb'] or cfg['sandbox-notice-diff-blurb'] is the opening sentence
-- of the sandbox notice. The latter has a diff link, but the former does not. $1 is the page
-- type, which is either cfg['sandbox-notice-pagetype-template'],
-- cfg['sandbox-notice-pagetype-module'] or cfg['sandbox-notice-pagetype-other'] depending what
-- namespace we are in. $2 is a link to the main template page, and $3 is a diff link between
-- the sandbox and the main template. The display value of the diff link is set by
-- cfg['sandbox-notice-compare-link-display'].
--]]
cfg['sandbox-notice-blurb'] = 'This is the $1 for $2.'
cfg['sandbox-notice-diff-blurb'] = 'This is the $1 for $2 ($3).'
cfg['sandbox-notice-compare-link-display'] = 'diff'

--- A category to add to all template sandboxes.
--  @property {string} cfg['sandbox-category']
cfg['sandbox-category'] = 'Template Drafts'
cfg['sandbox-module-category'] = 'Module Drafts'

-- -------------------------------------------------------------------------------------------------
-- Start box configuration
-- -------------------------------------------------------------------------------------------------

--- The wikitext for the icon shown at the top of the template.
--  @property {string} cfg['documentation-icon-wikitext']
cfg['documentation-icon-wikitext'] = '[[File:$1|50px|link=|alt=Documentation icon]]'

--- The file name for the icon shown at the top of the template.
--  @property {string} cfg['documentation-icon']
cfg['documentation-icon'] = 'WIP_descr.png'

--- The file name for the icon shown at the top of the template when no /doc subpage exists.
--  @property {string} cfg['documentation-icon-nodoc']
cfg['documentation-icon-nodoc'] = 'WIP.png'

--- The file name for the icon shown at the top of the template when the documentation is marked as bad.
--  @property {string} cfg['documentation-icon-baddoc']
cfg['documentation-icon-baddoc'] = 'WIP_song.png'

-- -------------------------------------------------------------------------------------------------
-- Sandbox link configuration
-- -------------------------------------------------------------------------------------------------

--- Whether to show a link to the sandbox subpage
--  @property {boolean} cfg['sandbox-subpage-show']
cfg['sandbox-subpage-show'] = true

--- The name of the template subpage typically used for sandboxes.
--  @property {string} cfg['sandbox-subpage']
cfg['sandbox-subpage'] = 'Draft'

--- Preload file for template sandbox pages.
--  @property {string} cfg['template-sandbox-preload']
cfg['template-sandbox-preload'] = 'Template:Documentation/preload-sandbox'

--- Preload file for Lua module sandbox pages.
--  @property {string} cfg['module-sandbox-preload']
cfg['module-sandbox-preload'] = 'Template:Documentation/preload-module-sandbox'

--- The page to preload when a user clicks the "mirror" link.
--  @property {string} cfg['mirror-link-preload']
cfg['mirror-link-preload'] = 'Template:Documentation/mirror'

-- -------------------------------------------------------------------------------------------------
-- Add categories blurb configuration
-- -------------------------------------------------------------------------------------------------

--- The text to display when linking to the /doc subpage.
--  @property {string} cfg['doc-link-display']
cfg['doc-link-display'] = 'documentation'

-- -------------------------------------------------------------------------------------------------
-- Doc link configuration
-- -------------------------------------------------------------------------------------------------

--- The name of the subpage typically used for documentation pages.
--  @property {string} cfg['doc-subpage']
cfg['doc-subpage'] = 'doc'

--- Preload file for documentation page in the file namespace.
--  @property {string} cfg['file-docpage-preload']
cfg['file-docpage-preload'] = 'Template:Documentation/preload-filespace'

--- Preload file for template documentation pages in all namespaces.
--  @property {string} cfg['docpage-preload']
cfg['docpage-preload'] = 'Template:Documentation/preload'

--- Preload file for Lua module documentation pages.
--  @property {string} cfg['module-preload']
cfg['module-preload'] = 'Template:Documentation/preload-module-doc'

-- -------------------------------------------------------------------------------------------------
-- Print version configuration
-- -------------------------------------------------------------------------------------------------

--- Disables or enabled /print content
--  @property {boolean} cfg['print-show']
cfg['print-show'] = false

--- The name of the template subpage used for print versions.
--  @property {string} cfg['print-subpage']
cfg['print-subpage'] = 'Print'

--- The text to display when linking to the /Print subpage.
--  @property {string} cfg['print-link-display']
cfg['print-link-display'] = '/Print'

-- cfg['print-blurb']
-- Text to display if a /Print subpage exists. $1 is a link to the subpage with a display value of cfg['print-link-display'].
cfg['print-blurb'] = 'A [[Help:Books/for experts#Improving the book layout|print version]] of this template exists at $1.'
	.. ' If you make a change to this template, please update the print version as well.'

--- Set to true to enable output of cfg['print-category'] if a /Print subpage exists.
--  This should be a boolean value (either true or false).
--  @property {boolean} cfg['display-print-category']
cfg['display-print-category'] = false

--- Category to output if cfg['display-print-category'] is set to true, and a /Print subpage exists.
--  @property {string} cfg['print-category']
cfg['print-category'] = 'Templates with print versions'

-- -------------------------------------------------------------------------------------------------
-- HTML and CSS configuration
-- -------------------------------------------------------------------------------------------------

--- The "id" attribute of the main HTML "div" tag.
--  @property {string} cfg['main-div-id']
cfg['main-div-id'] = 'template-documentation'

--- The CSS classes added to the main HTML "div" tag.
--  @property {string} cfg['main-div-classes']
cfg['main-div-classes'] = 'template-documentation iezoomfix'

--- The CSS classes used for the start box "div" tag.
--  @property {string} cfg['start-box-div-classes']
cfg['start-box-div-classes'] = 'template-documentation-header'

--- The CSS classes used for the [view][edit][history] or [create] links in the start box.
--  @property {string} cfg['start-box-linkclasses']
cfg['start-box-linkclasses'] = 'mw-editsection-like plainlinks'

--- The HTML "id" attribute for the links in the start box.
--  @property {string} cfg['start-box-link-id']
cfg['start-box-link-id'] = 'doc_editlinks'

--- The CSS classes used for the languages list.
--  @property {string} cfg['languages-list-div-classes']
cfg['languages-list-div-classes'] = 'template-documentation-langs'

--- The CSS classes used for the content box "div" tag.
--  @property {string} cfg['content-box-div-classes']
cfg['content-box-div-classes'] = 'template-documentation-content'

--- The "id" attribute of the end box HTML "div" tag.
--  @property {string} cfg['end-box-div-id']
cfg['end-box-div-id'] = 'documentation-meta-data'

--- The CSS classes used for the end box "div" tag.
--  @property {string} cfg['end-box-div-classes']
cfg['end-box-div-classes'] = 'template-documentation-footer transclude-notice-bottom plainlinks'

-- -------------------------------------------------------------------------------------------------
-- Tracking category configuration
-- -------------------------------------------------------------------------------------------------

--- Set to true to enable output of cfg['strange-usage-category'] if the module is used on a /doc subpage
--  This should be a boolean value (either true or false).
--  @property {boolean} cfg['display-strange-usage-category']
cfg['display-strange-usage-category'] = true

--- Category to output if cfg['display-strange-usage-category'] is set to true and the module is used on a
--  /doc subpage.
--  @property {string} cfg['strange-usage-category']
cfg['strange-usage-category'] = 'Pages with Strange ((documentation)) Usage'

--- Category to output if the /doc subpage is missing and the 'content' parameter is not specified
--  @property {string} cfg['nodoc-category-{template,module,file,other}']
cfg['nodoc-category-template'] = 'Templates with No Documentation'
cfg['nodoc-category-module'] = 'Modules with No Documentation'
cfg['nodoc-category-file'] = 'Files with No Summary'
cfg['nodoc-category-other'] = 'Pages with No Documentation'

--- Category to output if the documentation is marked as bad
--  @property {string} cfg['baddoc-category-{template,module,file,other}']
cfg['baddoc-category-template'] = 'Templates with Bad Documentation'
cfg['baddoc-category-module'] = 'Modules with Bad Documentation'
cfg['baddoc-category-file'] = 'Files with Bad Summary'
cfg['baddoc-category-other'] = 'Pages with Bad Documentation'

-- -------------------------------------------------------------------------------------------------
-- End configuration
--
-- Don't edit anything below this line.
-- -------------------------------------------------------------------------------------------------

return cfg