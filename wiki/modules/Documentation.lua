--------------------------------------------------------------------------------
-- This module implements {{T|Documentation}}.
--
-- @module documentation
-- @alias p
-- @release stable
-- @require [[Global Lua Modules/Arguments|Dev:Arguments]]
-- @require [[Global Lua Modules/Config|Dev:Config]]
-- @require [[Global Lua Modules/I18n|Dev:I18n]]
-- @require [[Global Lua Modules/Loanguages|Dev:Languages]]
-- @require [[Global Lua Modules/Message box|Dev:Message box]]
-- @require [[Global Lua Modules/Yesno|Dev:Yesno]]
-- @require Module:Documentation/config
-- @require Module:Documentation/i18n
-- @require [[MediaWiki:Module:Documentation.css]]
-- @attribution [[wikipedia:Module:Documentation|Module:Documentation]] (Wikipedia)
-- @see [[wikipedia:Module:Documentation|Original module on Wikipedia]]
-- @see {{T|Documentation}}
--------------------------------------------------------------------------------

local libraryUtil = require('libraryUtil');
local checkType = libraryUtil.checkType;
local lib = require('Module:Feature')

-- Get required modules.
local getArgs = require('Module:Arguments').getArgs
local checkExists = require('Module:Exists').checkExists
local yesno = require('Module:Yesno')

-- Get the config table.
local cfg = require('Module:Config').loadConfig('Documentation')
local i18n = require('Module:I18n').loadMessages('Documentation')
local languages = require('Module:Languages')

local p = {}
p.i18n = i18n

-- Capitalizes first letter of strings
-- src: https://stackoverflow.com/questions/2421695/first-character-uppercase-lua
local function firstToUpper(str)
    return (str:gsub("^%l", string.upper))
end

-- --------------------------------------------------------------------------
-- Helper functions
--
-- These are defined as local functions, but are made available in the p
-- table for testing purposes.
-- --------------------------------------------------------------------------

--[[
-- Gets a message from the cfg table and formats it if appropriate.
-- The function raises an error if the value from the cfg table is not
-- of the type expectType. The default type for expectType is 'string'.
-- If the table valArray is present, strings such as $1, $2 etc. in the
-- message are substituted with values from the table keys [1], [2] etc.
-- For example, if the message "foo-message" had the value 'Foo $2 bar $1.',
-- p.message('foo-message', {'baz', 'qux'}) would return "Foo qux bar baz."
--
-- @function p.message
-- @private
-- @param {string} cfgKey
-- @param[opt] {table} valArray
-- @param[opt] {string} expectType
-- @return {string|number|boolean|table|nil}
--]]
function p.message(cfgKey, valArray, expectType)
	local msg = cfg:getValue(cfgKey)
	expectType = expectType or 'string'
	if type(msg) ~= expectType then
		error('message: type error in message cfg.' .. cfgKey .. ' (' .. expectType .. ' expected, got ' .. type(msg) .. ')', 2)
	end
	if not valArray then
		return msg
	end

	function getMessageVal(match)
		match = tonumber(match)
		return valArray[match] or error('message: no value found for key $' .. match .. ' in message cfg.' .. cfgKey, 4)
	end

	local ret = mw.ustring.gsub(msg, '$([1-9][0-9]*)', getMessageVal)
	return ret
end

function p.makeWikilink(page, display)
	if display then
		return mw.ustring.format('[[%s|%s]]', page, display)
	else
		return mw.ustring.format('[[%s]]', page)
	end
end

function p.makeUrlWikilink(page, display)
	-- This code prevents redlinks, but doesn't work for categories, and those
	-- are always blue-linked by the CategoryBlueLinks extension anyway.
	return mw.ustring.format('[%s %s]', tostring(mw.uri.fullUrl(page)), display or page)
end


function p.makeCategoryLink(cat, sort)
	local catns = mw.site.namespaces[14].name
	return p.makeWikilink(catns .. ':' .. cat, sort)
end

function p.makeUrlLink(url, display)
	return mw.ustring.format('[%s %s]', url, display)
end

function p.makeToolbar(...)
	local lim = select('#', ...)
	if lim < 1 then
		return nil
	end

	local frame = mw.getCurrentFrame()
	local ret = mw.html.create('small'):wikitext('(')

	local isFirst = true
	for i = 1, lim do
		local v = select(i, ...)
		if v then
			if isFirst then
				isFirst = false
			else
				ret:wikitext(' ', frame:preprocess('{{int:pipe-separator}}'), '&nbsp;')
			end
			ret:wikitext(v)
		end
	end

	return not isFirst and ret:wikitext(')'):done() or nil
end

--[[
-- @function p.resolveNamespace
-- @private
-- @param {int} subjectSpace
-- @return {string}
--]]
function p.resolveNamespace(subjectSpace, upperPlural)
	if subjectSpace == 10 then -- Template namespace
		if upperPlural then	return 'Templates'
		else return 'template' end
	elseif subjectSpace == 828 then -- Module namespace
		if upperPlural then return 'Modules'
		else return 'module' end
	elseif subjectSpace == 6 then -- File namespace
		if upperPlural then return 'Files'
		else return 'file' end
	end
	return 'other'
end

-- --------------------------------------------------------------------------
-- Argument processing
-- --------------------------------------------------------------------------

function p.makeInvokeFunc(funcName)
	return function (frame)
		local args = getArgs(frame, {
			valueFunc = function (key, value)
				if type(value) == 'string' then
					value = value:match('^%s*(.-)%s*$') -- Remove whitespace.
					if key == 'heading' or value ~= '' then
						return value
					else
						return nil
					end
				else
					return value
				end
			end
		})
		return tostring(p[funcName](args))
	end
end

-- --------------------------------------------------------------------------
-- Main function
-- --------------------------------------------------------------------------

--[[
-- This function defines logic flow for the module.
--
-- ; Messages:
-- : 'main-div-id' --> 'template-documentation'
-- : 'main-div-classes' --> 'template-documentation iezoomfix'
--
-- @function p.main
-- @param {table|Frame} args - table of arguments passed by the user
-- @return {string}
--]]
p.main = p.makeInvokeFunc('_main')

function p._main(args)
	local env = p.getEnvironment(args)
	local root = mw.html.create()
	root
		:wikitext(p.protectionTemplate(env))
		:wikitext(p.sandboxNotice(args, env))
		:tag('div')
			:attr('id', p.message('main-div-id'))
			:addClass(p.message('main-div-classes'))
			:newline()
			:node(p._startBox(args, env))
			:node(p._navigation(args, env))
			:node(p._content(args, env))
			:node(p._endBox(args, env))
		:done()
		:wikitext(p.addTrackingCategories(env))
		:wikitext(p.addTypeCategory(args))
	return root
end

-- --------------------------------------------------------------------------
-- Environment settings
-- --------------------------------------------------------------------------

--- A table with information about the environment, including title objects and
-- other namespace- or path-related data.
-- @type Environment
--
-- @note All table lookups are passed through pcall so that errors are caught.
-- If an error occurs, the value returned will be nil.
--
-- ; Title objects include:
--- @property {Title|nil} Environment.title - the page we are making documentation for (usually the current title)
--- @property {Title|nil} Environment.templateTitle - the template (or module, file, etc.)
--- @property {Title|nil} Environment.docTitle - the /doc subpage.
--- @property {Title|nil} Environment.sandboxTitle - the /sandbox subpage.
--- @property {Title|nil} Environment.printTitle - the print version of the template, located at the /Print subpage.
--
-- ; Data includes:
--- @property {Title.protectionLevels|nil} Environment.protectionLevels - the protection levels table of the title object.
--- @property {int|nil} Environment.subjectSpace - the number of the title's subject namespace.
--- @property {int|nil} Environment.docSpace - the number of the namespace the title puts its documentation in.
--- @property {string|nil} Environment.docpageBase - the text of the base page of the /doc and /sandbox pages, with namespace.
--- @property {string|nil} Environment.compareUrl - URL of the Special:ComparePages page comparing the sandbox with the template.

--[[
-- Returns a table with information about the environment, including title objects and other namespace- or
-- path-related data.
--
-- @function p.getEnvironment
-- @private
-- @param {table} args - table of arguments passed by the user
-- @return {Environment}
--]]
function p.getEnvironment(args)
	local env, envFuncs = {}, {}

	-- Set up the metatable. If triggered we call the corresponding function in the envFuncs table. The value
	-- returned by that function is memoized in the env table so that we don't call any of the functions
	-- more than once. (Nils won't be memoized.)
	setmetatable(env, {
		__index = function (t, key)
			local envFunc = envFuncs[key]
			if envFunc then
				local success, val = pcall(envFunc)
				if success then
					env[key] = val -- Memoise the value.
					return val
				end
			end
			return nil
		end
	})

	-- The title object for the current page, or a test page passed with args.page.
	function envFuncs.title()
		local title
		local titleArg = args.page
		if titleArg then
			title = mw.title.new(titleArg)
		else
			title = mw.title.getCurrentTitle()
		end
		return title
	end

	-- The template (or module, etc.) title object.
	-- ; Messages:
	-- : 'sandbox-subpage' --> 'sandbox'
	function envFuncs.templateTitle()
		local subjectSpace = env.subjectSpace
		local title = env.title
		local subpage = title.subpageText
		if subpage == p.message('sandbox-subpage') or subpage == p.message('doc-subpage') then
			return mw.title.makeTitle(subjectSpace, title.baseText)
		else
			return mw.title.makeTitle(subjectSpace, title.text)
		end
	end

	-- Title object of the /doc subpage.
	-- ; Messages:
	-- : 'doc-subpage' --> 'doc'
	function envFuncs.docTitle()
		-- NEW: If a transclusion page is specified, that becomes the doc page.
		if args.transclude and args.transclude ~= '' then
			return mw.title.new(args.transclude)
		end
		local docname = args[1] -- User-specified doc page.
		local docpage
		if docname then
			docpage = docname
		else
			docpage = env.docpageBase .. '/' .. p.message('doc-subpage')
		end
		return mw.title.new(docpage)
	end

	function envFuncs.subpages()
		local docTitle = env.docTitle
		return languages.subpages(docTitle.text, docTitle.nsText)
	end

	function envFuncs.hasSubpages()
		local subpages = env.subpages
		return #subpages > 1 or subpages[1] ~= ''
	end

	function envFuncs.docTitleCreate()
		local hasSubpages = env.hasSubpages
		local docTitle = env.docTitle
		return docTitle
	end

	function envFuncs.docTitleCurrentLang()
		local currentLang = i18n:getLang()
		if currentLang == 'en' or yesno(args.ignoreCurrentLang) then
			return env.docTitleCreate
		else
			local docTitle = env.docTitle
			return mw.title.new(docTitle.text .. '/' .. currentLang, docTitle.nsText)
		end
	end

	-- Title object for the /sandbox subpage.
	-- ; Messages:
	-- : 'sandbox-subpage' --> 'sandbox'
	function envFuncs.sandboxTitle()
	    -- return nil
		return mw.title.new(env.docpageBase .. '/' .. p.message('sandbox-subpage'))
	end

	-- Title object for the /Print subpage.
	-- ; Messages:
	-- : 'print-subpage' --> 'Print'
	function envFuncs.printTitle()
		if p.message('print-show') then
			return env.templateTitle:subPageTitle(p.message('print-subpage'))
		end
	end

	-- The protection levels table of the title object.
	function envFuncs.protectionLevels()
		return env.title.protectionLevels
	end

	-- The subject namespace number.
	function envFuncs.subjectSpace()
		return mw.site.namespaces[env.title.namespace].subject.id
	end

	-- The documentation namespace number. For most namespaces this is the same as the
	-- subject namespace. However, pages in the Article, File, MediaWiki or Category
	-- namespaces must have their /doc and /sandbox pages in talk space.
	function envFuncs.docSpace()
		local subjectSpace = env.subjectSpace
		if subjectSpace == 0 or subjectSpace == 6 or subjectSpace == 8 or subjectSpace == 14 then
			return subjectSpace + 1
		else
			return subjectSpace
		end
	end

	-- The base page of the /doc and /sandbox subpages.
	-- For some namespaces this is the talk page, rather than the template page.
	function envFuncs.docpageBase()
		local templateTitle = env.templateTitle
		local docSpace = env.docSpace
		local docSpaceText = mw.site.namespaces[docSpace].name
		-- Assemble the link. docSpace is never the main namespace, so we can hardcode the colon.
		return docSpaceText .. ':' .. templateTitle.text
	end

	-- Diff link between the sandbox and the main template using [[Special:ComparePages]].
	function envFuncs.compareUrl()
		local templateTitle = env.templateTitle
		local sandboxTitle = env.sandboxTitle
		if checkExists(templateTitle.prefixedText) and checkExists(sandboxTitle.prefixedText) then
			local compareUrl = mw.uri.fullUrl(
				'Special:ComparePages',
				{page1 = templateTitle.prefixedText, page2 = sandboxTitle.prefixedText}
			)
			return tostring(compareUrl)
		else
			return nil
		end
	end

	function envFuncs.docStatus()
		local docTitle = env.docTitle
		if not args.content and not (args.transclude and args.transclude ~= '') then
			if not checkExists(docTitle.prefixedText) and not env.hasSubpages then
				return 'nodoc'
			elseif not checkExists(docTitle.prefixedText) and env.hasSubpages then
				return 'baddoc'
			end
		end
	end

	function envFuncs.docIcon()
		local docStatus = env.docStatus
		if not docStatus then
			return p.message('documentation-icon')
		end
		return p.message('documentation-icon-' .. docStatus)
	end
		function envFuncs.title()
		-- The title object for the current page, or a test page passed with args.page.
		local title
		local titleArg = args.page
		if titleArg then
			title = mw.title.new(titleArg)
		else
			title = mw.title.getCurrentTitle()
		end
		return title
	end
	return env
end

-- --------------------------------------------------------------------------
-- Auxiliary templates
-- --------------------------------------------------------------------------

---
-- Generates a sandbox notice for display above sandbox pages.
--
-- ; Messages:
-- : 'sandbox-notice-image' --> '[[Image:Sandbox.svg|50px|alt=|link=]]'
-- : 'sandbox-notice-blurb' --> 'This is the $1 for $2.'
-- : 'sandbox-notice-diff-blurb' --> 'This is the $1 for $2 ($3).'
-- : 'sandbox-notice-pagetype-template' --> '[[Wikipedia:Template test cases|template sandbox]] page'
-- : 'sandbox-notice-pagetype-module' --> '[[Wikipedia:Template test cases|module sandbox]] page'
-- : 'sandbox-notice-pagetype-other' --> 'sandbox page'
-- : 'sandbox-notice-compare-link-display' --> 'diff'
-- : 'sandbox-category' --> 'Template sandboxes'
--
-- @function p.sandboxNotice
-- @private
-- @param {table} args - a table of arguments passed by the user
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string|nil}
function p.sandboxNotice(args, env)
	if not p.message('sandbox-notice-show', nil, 'boolean') then
		return nil
	end

	local title = env.title
	local sandboxTitle = env.sandboxTitle
	local templateTitle = env.templateTitle
	local subjectSpace = env.subjectSpace
	if not (subjectSpace and title and sandboxTitle and templateTitle and mw.title.equals(title, sandboxTitle)) then
		return nil
	end
	-- Build the table of arguments to pass to {{T|ombox}}. We need just two fields, "image" and "text".
	local omargs = {}
	omargs.image = p.message('sandbox-notice-image')
	-- Get the text. We start with the opening blurb, which is something like
	-- "This is the template sandbox for [[Template:Foo]] (diff)."
	local header = ''
	local text = ''
	local frame = mw.getCurrentFrame()
	local isPreviewing = frame:preprocess('{{REVISIONID}}') == '' -- True if the page is being previewed.
	local pagetype
	if subjectSpace == 10 then
		pagetype = p.message('sandbox-notice-pagetype-template')
	elseif subjectSpace == 828 then
		pagetype = p.message('sandbox-notice-pagetype-module')
	else
		pagetype = p.message('sandbox-notice-pagetype-other')
	end
	local templateLink = p.makeUrlWikilink(templateTitle.prefixedText)
	local compareUrl = env.compareUrl
	if isPreviewing or not compareUrl then
		header = header .. p.message('sandbox-notice-blurb', {pagetype, templateLink})
	else
		local compareDisplay = p.message('sandbox-notice-compare-link-display')
		local compareLink = p.makeUrlLink(compareUrl, compareDisplay)
		header = header .. p.message('sandbox-notice-diff-blurb', {pagetype, templateLink, compareLink})
	end
	-- Add the sandbox to the sandbox category.
	if title.namespace == 828 then
		text = text .. p.makeCategoryLink(p.message('sandbox-module-category'))
	else
		text = text .. p.makeCategoryLink(p.message('sandbox-category'))
	end
	omargs.header = header
	omargs.text = text
	omargs.imagewidth = '50px'
	omargs.class = 'sandbox'
	local ret = '<div style="clear: both;"></div>'
	ret = ret .. frame:expandTemplate{ title = 'Mbox', args = omargs}
	return ret
end

--[[
-- Generates the padlock icon in the top right.
--
-- ; Messages:
-- : 'protection-template' --> 'pp-template'
-- : 'protection-template-args' --> {docusage = 'yes'}
--
-- @function p.protectionTemplate
-- @private
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string|nil}
--]]
function p.protectionTemplate(env)
	-- This depends on [[Module:Protection banner]]
	do return end

	local protectionLevels, mProtectionBanner
	local title = env.title
	if title.namespace ~= 10 and title.namespace ~= 828 then
		-- Don't display the protection template if we are not in the template or module namespaces.
		return nil
	end
	protectionLevels = env.protectionLevels
	if not protectionLevels then
		return nil
	end
	local editProt = protectionLevels.edit and protectionLevels.edit[1]
	local moveProt = protectionLevels.move and protectionLevels.move[1]
	if editProt then
		-- The page is edit-protected.
		mProtectionBanner = require('Protection banner')
		local reason = p.message('protection-reason-edit')
		return mProtectionBanner._main{reason, small = true}
	elseif moveProt and moveProt ~= 'autoconfirmed' then
		-- The page is move-protected but not edit-protected. Exclude move
		-- protection with the level "autoconfirmed", as this is equivalent to
		-- no move protection at all.
		mProtectionBanner = require('Protection banner')
		return mProtectionBanner._main{action = 'move', small = true}
	else
		return nil
	end
end

-- --------------------------------------------------------------------------
-- Start box
-- --------------------------------------------------------------------------

--[[
-- This function generates the start box.
--
-- The actual work is done by p.makeStartBoxLinksData and p.renderStartBoxLinks which make
-- the [view] [edit] [history] [purge] links, and by p.makeStartBoxData and p.renderStartBox
-- which generate the box HTML.
--
-- @function p.startBox
-- @param {table|Frame} args - a table of arguments passed by the user
-- @param[opt] {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string|nil}
--]]
p.startBox = p.makeInvokeFunc('_startBox')

function p._startBox(args, env)
	env = env or p.getEnvironment(args)
	local links
	local content = args.content
	local transclude = args.transclude and args.transclude ~= ''
	if not content or transclude then
		-- No need to include the links if the documentation is on the template page itself,
		-- unless we are transcluding, in which case we need the links.
		local linksData = p.makeStartBoxLinksData(args, env)
		if linksData then
			links = p.renderStartBoxLinks(linksData)
		end
	end
	-- Generate the start box html.
	local data = p.makeStartBoxData(args, env, links)
	if data then
		return p.renderStartBox(data)
	else
		-- User specified no heading.
		return nil
	end
end

--[[
-- Does initial processing of data to make the [view] [edit] [history] [purge] links.
--
-- ; Messages:
-- : 'file-docpage-preload' --> 'Template:Documentation/preload-filespace'
-- : 'module-preload' --> 'Template:Documentation/preload-module-doc'
-- : 'docpage-preload' --> 'Template:Documentation/preload'
--
-- @function p.makeStartBoxLinksData
-- @private
-- @param {table} args - a table of arguments passed by the user
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {table|nil}
--]]
function p.makeStartBoxLinksData(args, env)
	local subjectSpace = env.subjectSpace
	local title = env.title
	local docTitle = env.docTitle -- This now correctly points to the transcluded page if specified
	if not title or not docTitle then
		return nil
	end

	local frame = mw.getCurrentFrame()
	local data = {}
	data.title = title
	data.docTitle = docTitle
	-- View, display, edit, and purge links if /doc exists.
	data.viewLinkDisplay = frame:preprocess('{{lc:{{int:view}}}}')
	data.editLinkDisplay = frame:preprocess('{{lc:{{int:edit}}}}')
	data.historyLinkDisplay = frame:preprocess('{{lc:{{int:history_short}}}}')
	data.purgeLinkDisplay = frame:preprocess('{{lc:{{int:page-header-action-button-purge}}}}')
	-- Create link if /doc doesn't exist.
	local preload = args.preload
	if not preload then
		if subjectSpace == 6 then -- File namespace
			preload = p.message('file-docpage-preload')
		elseif subjectSpace == 828 then -- Module namespace
			preload = p.message('module-preload')
		else
			preload = p.message('docpage-preload')
		end
	end
	data.preload = preload
	data.createLinkDisplay = frame:preprocess('{{lc:{{int:create}}}}')
	return data
end

--[[
-- Generates the [view][edit][history][purge] or [create] links from the data table.
--
-- @function p.renderStartBoxLinks
-- @private
-- @param {table} data - a table of data generated by p.makeStartBoxLinksData
-- @return {string}
--]]
function p.renderStartBoxLinks(data)

	function escapeBrackets(s)
		-- Escapes square brackets with HTML entities.
		s = s:gsub('%[', '&#91;') -- Replace square brackets with HTML entities.
		s = s:gsub('%]', '&#93;')
		return s
	end

	local ret
	local docTitle = data.docTitle
	local title = data.title
	if checkExists(docTitle.prefixedText) then
		local viewLink = p.makeWikilink(docTitle.prefixedText, data.viewLinkDisplay)
		local editLink = p.makeUrlLink(docTitle:fullUrl({ action = 'edit' }, 'https'), data.editLinkDisplay)
		local historyLink = p.makeUrlLink(docTitle:fullUrl({ action = 'history' }, 'https'), data.historyLinkDisplay)
		local purgeLink = p.makeUrlLink(title:fullUrl({ action = 'purge' }, 'https'), data.purgeLinkDisplay)
		ret = '[%s] [%s] [%s] [%s]'
		ret = escapeBrackets(ret)
		ret = mw.ustring.format(ret, viewLink, editLink, historyLink, purgeLink)
	else
		local createLink = p.makeUrlLink(docTitle:fullUrl({
			action = 'edit',
			redlink = '1',
			preload = data.preload,
		}, 'https'), data.createLinkDisplay)
		local purgeLink = p.makeUrlLink(title:fullUrl({ action = 'purge' }, 'https'), data.purgeLinkDisplay)
		ret = '[%s] [%s]'
		ret = escapeBrackets(ret)
		ret = mw.ustring.format(ret, createLink, purgeLink)
	end
	return ret
end

---
-- Does initial processing of data to pass to the start-box render function, p.renderStartBox.
--
-- ; Messages:
-- : 'documentation-icon-wikitext' --> '[[File:$1|50px|link=|alt=Documentation icon]]'
-- : 'documentation-icon' --> 'Template-info.svg'
-- : 'documentation-icon-nodoc' --> 'Template-noinfo.svg'
-- : 'documentation-icon-baddoc' --> 'Template-badinfo.svg'
-- : 'start-box-linkclasses' --> 'mw-editsection-like plainlinks'
-- : 'start-box-link-id' --> 'doc_editlinks'
--
-- @function p.makeStartBoxData
-- @private
-- @param {table} args - a table of arguments passed by the user
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @param {string|nil} links - a string containing the [view][edit][history][purge] links - could be nil if there's an error.
-- @return {table}
function p.makeStartBoxData(args, env, links)
	local subjectSpace = env.subjectSpace
	if not subjectSpace then
		-- Default to an "other namespaces" namespace, so that we get at least some output
		-- if an error occurs.
		subjectSpace = 2
	end
	local data = {}

	-- Heading
	local heading = args.heading -- Blank values are not removed.
	if heading == '' then
		-- Don't display the start box if the heading arg is defined but blank.
		return nil
	end

	if heading then
		data.heading = heading
	elseif subjectSpace == 10 then -- Template namespace
		data.heading = p.message('documentation-icon-wikitext', {env.docIcon}) .. ' ' .. i18n:msg('documentation-heading')
		data.subHeading = i18n:msg('documentation-visibility')
	elseif subjectSpace == 828 then -- Module namespace
		data.heading = p.message('documentation-icon-wikitext', {env.docIcon}) .. ' ' .. i18n:msg('module-namespace-heading')
	elseif subjectSpace == 6 then -- File namespace
		data.heading = i18n:msg('file-namespace-heading')
	else
		data.heading = i18n:msg('other-namespaces-heading')
	end

	-- Heading CSS
	local headingStyle = args['heading-style']
	if headingStyle then
		data.headingStyleText = headingStyle
	elseif subjectSpace == 10 then
		-- We are in the template or template talk namespaces.
		data.headingFontWeight = 'bold'
		data.headingFontSize = '100%'
	else
		data.headingFontSize = '100%'
	end

	-- Data for the [view][edit][history][purge] or [create] links.
	if links then
		data.linksClass = p.message('start-box-linkclasses')
		data.linksId = p.message('start-box-link-id')
		data.links = links
	end

	return data
end

--[[
-- Renders the start box html.
--
-- ; Messages
-- : 'start-box-div-classes' --> 'template-documentation-header'
--
-- @function p.renderStartBox
-- @private
-- @param {table} data - a table of data generated by p.makeStartBoxData.
-- @return {string}
--]]
function p.renderStartBox(data)
	local sbox = mw.html.create('div')
	sbox
		:addClass(p.message('start-box-div-classes'))
		:newline()
		:tag('span')
			:cssText(data.headingStyleText)
			:css('font-weight', data.headingFontWeight)
			:css('font-size', data.headingFontSize)
			:wikitext(data.heading)
	local links = data.links
	if links then
		sbox
			:tag('div')
			:css('font-size', data.headingFontSize)
			:css('float', 'right')
				:tag('span')
				:addClass(data.linksClass)
				:attr('id', data.linksId)
				:wikitext(links)
	end
	local subHeading = data.subHeading
	if subHeading then
		sbox
			:tag('br')
			:css('clear', 'right')
		sbox
			:tag('i')
			:wikitext(subHeading)
	end
	return sbox
end

p.navigation = p.makeInvokeFunc('_navigation')

function p._navigation(args, env)
	-- Get environment data.
	env = env or p.getEnvironment(args)
	local frame = mw.getCurrentFrame()
	local nav = mw.html.create('table')
	nav
		:addClass('doctable')
		:css('width', '100%')
	local navhead = mw.html.create('tr')
		:tag('th')
		:addClass('doc-header')
	local colspan = 0
	if args.navHeader ~= nil then
		navhead:wikitext(args.navHeader):done()
	end
	local lnkdta = mw.html.create('tr'):addClass('links')
	local tags = {}
	tags[1] = lnkdta:tag('td')
	tags[1]:wikitext('[[' .. env.templateTitle.prefixedText .. '|Main]]')
	colspan = colspan + 1
	if checkExists(env.docTitle.prefixedText) then
		tags[2] = lnkdta:tag('td')
		tags[2]:wikitext('[[' .. env.docTitle.prefixedText .. '|' .. firstToUpper(p.message('doc-link-display')) .. ']]')
		colspan = colspan + 1
	end
	if checkExists(env.sandboxTitle.prefixedText) then
		tags[3] = lnkdta:tag('td')
		tags[3]:wikitext('[[' .. env.sandboxTitle.prefixedText .. '|' .. firstToUpper(i18n:msg('sandbox-link-display')) .. ']]')
		colspan = colspan + 1
	end
	tags[5] = lnkdta:tag('td')
	tags[5]:wikitext('[' .. tostring(mw.uri.fullUrl('Special:WhatLinksHere', 'hidelinks=1&hideredirs=1&target=' .. env.templateTitle.prefixedText)) .. ' Usage]')
	colspan = colspan + 1
	for k,v in pairs(tags) do
		v:css('width', (100 / colspan) .. '%')
	end
	navhead:attr('colspan', colspan)
	if args.navHeader ~= nil then
		nav:node(navhead)
	end
	nav:node(lnkdta)
	nav:allDone()
	return nav
end

-- --------------------------------------------------------------------------
-- Documentation content
-- --------------------------------------------------------------------------

--[[
-- Displays the documentation contents
--
-- ; Messages
-- : 'content-box-div-classes' --> 'template-documentation-content'
--
-- @function p.content
-- @param {table|Frame} args - a table of arguments passed by the user
-- @param[opt] {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string}
--]]
p.content = p.makeInvokeFunc('_content')

function p._content(args, env)
	env = env or p.getEnvironment(args)
	local docTitle = env.docTitle
	local content = args.content
	local transcludePage = args.transclude
	local root = mw.html.create()
	local frame = mw.getCurrentFrame()

	if transcludePage and transcludePage ~= '' then
		-- NEW: Handle the transclude parameter first.
		if checkExists(transcludePage) then
			content = frame:expandTemplate{ title = transcludePage }
		else
			content = i18n:msg('transcluded-documentation-missing', transcludePage)
		end
	elseif not content and docTitle then
		-- Original logic for /doc page or inline content.
		local subjectSpace = env.subjectSpace
		local preload = args.preload
		if not preload then
			if subjectSpace == 6 then -- File namespace
				preload = p.message('file-docpage-preload')
			elseif subjectSpace == 828 then -- Module namespace
				preload = p.message('module-preload')
			else
				preload = p.message('docpage-preload')
			end
		end

		local hasSubpages = env.hasSubpages
		local docTitleCreate = env.docTitleCreate

		local docMissing = i18n:msg(
			p.resolveNamespace(subjectSpace) .. '-documentation-missing',
			docTitleCreate:fullUrl({
				action = 'edit',
				redlink = '1',
				preload = mw.uri.encode(preload, 'WIKI'),
			}, 'https'):gsub('%%', '%%%%')
		)

		if not checkExists(docTitle.prefixedText) and not hasSubpages then
			content = docMissing
		else
			if yesno(args.i18n, false) or hasSubpages then
				local currentLang = i18n:getLang()
				root:node(languages.langs{
					'en',
					currentLang,
					format = 'list',
					page = docTitle.prefixedText,
					class = p.message('languages-list-div-classes'),
					select = currentLang,
					editintro = 'Template:Documentation/editintro',
				})
			end
			if not pcall(function()
				content = args._content or frame:expandTemplate{title = docTitle.prefixedText}
			end) then
				content = '[[' .. docTitle.prefixedText .. ']]'
			end
		end
	end
	local cbox = root:tag('div')
	cbox
		:addClass(p.message('content-box-div-classes'))
		:css("display", "flow-root")
		-- The line breaks are necessary so that "=== Headings ===" at the start
		-- and end of docs are interpreted correctly.
		:wikitext(mw.getCurrentFrame():expandTemplate{title = p.message('template-tocright')})
		:newline()
		:wikitext(content or '')
		:newline()
	return root
end

--[[
-- Gets the content title
--
-- @function p.contentTitle
-- @param {table|Frame} args - a table of arguments passed by the user
-- @param[opt] {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string}
--]]
p.contentTitle = p.makeInvokeFunc('_contentTitle')

function p._contentTitle(args, env)
	env = env or p.getEnvironment(args)
	local docTitle = env.docTitle
	if args.transclude and args.transclude ~= '' then
		return args.transclude
	elseif not args.content and docTitle and checkExists(docTitle.prefixedText) then
		return docTitle.prefixedText
	else
		return ''
	end
end

-- --------------------------------------------------------------------------
-- End box
-- --------------------------------------------------------------------------

---
-- This function generates the end box (also known as the link box).
--
-- The HTML is generated by the {{T|fmbox}} template, courtesy of [[Module:Message box]].
--
-- ; Messages:
-- : 'fmbox-id' --> 'documentation-meta-data'
-- : 'fmbox-style' --> 'background-color: #ecfcf4'
-- : 'fmbox-textstyle' --> 'font-style: italic'
--
-- @function p.endBox
-- @param {table|Frame} args - a table of arguments passed by the user
-- @param[opt] {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string}
p.endBox = p.makeInvokeFunc('_endBox')

function p._endBox(args, env)
	-- Get environment data.
	env = env or p.getEnvironment(args)

	local subjectSpace = env.subjectSpace
	local docTitle = env.docTitleCurrentLang

	local root = mw.html.create('div')
		:attr('id', p.message('end-box-div-id'))
		:addClass(p.message('end-box-div-classes'))
		:css('clear', 'both')

	local hasDocPage    = subjectSpace and docTitle and checkExists(docTitle.prefixedText)
	local linkBoxSpace = subjectSpace == 2 or subjectSpace == 10 or subjectSpace == 828

	-- Check whether we should output the end box at all. Add the end
	-- box by default if the documentation exists or if we are in the
	-- user, module or template namespaces.
	local linkBox = args['link box']
	local expandedLinkBox = yesno(linkBox, true)

	if (
		not hasDocPage and not linkBoxSpace
		and not (linkBox and yesno(linkBox) == nil)
	) then
		return root
			:attr('id', nil)
			:attr('class', nil)
		:allDone()
	end

	local customLanguagesNotice = i18n:msg('custom-languages-notice', docTitle.prefixedText,
		docTitle:fullUrl({ action = 'edit' }, 'https'):gsub("%%", "%%%%"), 'bottom')

	if expandedLinkBox == false then
		return root:wikitext(customLanguagesNotice):allDone()
	end

	if linkBox and yesno(linkBox) == nil then
		root:wikitext(linkBox)
	else
		local isFirstLine = true
		if (not args.content or (args.transclude and args.transclude ~= '')) and hasDocPage then
			isFirstLine = false
			root:wikitext(customLanguagesNotice)
		end

		if linkBoxSpace then
			-- We are in the user, template or module namespaces.
			-- Add sandbox link:
			-- "Editors can experiment in this template's sandbox (edit | history / create | mirror) page."
			local experimentBlurb = p.makeExperimentBlurb(args, env)
			if experimentBlurb then
				if isFirstLine then
					isFirstLine = false
				else
					root:tag('br')
				end
				root:node(experimentBlurb)
			end

			-- "Please add categories to the /doc subpage."
			-- Don't show this message with inline docs or with an explicitly specified doc page,
			-- as then it is unclear where to add the categories.
			local categoriesBlurb
			if not args.content and not args[1] and not (args.transclude and args.transclude ~= '') then
				categoriesBlurb = p.makeCategoriesBlurb(args, env)
			end

			-- "Subpages of this template"
			local subpagesBlurb = p.makeSubpagesBlurb(args, env)

			if categoriesBlurb or subpagesBlurb then
				if isFirstLine then
					isFirstLine = false
				else
					root:tag('br'):done()
				end

				root:node(categoriesBlurb)

				if categoriesBlurb and subpagesBlurb then
					root:wikitext(' ');
				end

				root:node(subpagesBlurb)
			end

			-- TODO: consider adding the print blurb
		end
	end

	return root:allDone()
end

--[[
-- Renders the text "Editors can experiment in this template's sandbox (edit | diff) page."
--
-- ; Messages:
-- : 'module-sandbox-preload' --> 'Template:Documentation/preload-module-sandbox'
-- : 'template-sandbox-preload' --> 'Template:Documentation/preload-sandbox'
-- : 'mirror-link-preload' --> 'Template:Documentation/mirror'
-- : 'template-sandbox-preload' --> 'Template:Documentation/preload-sandbox'
--
-- @function p.makeExperimentBlurb
-- @private
-- @param {table} args - a table of arguments passed by the user
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string|nil}
--]]
function p.makeExperimentBlurb(args, env)
	local subjectSpace = env.subjectSpace
	local templateTitle = env.templateTitle
	local sandboxTitle = env.sandboxTitle

	if not subjectSpace or not templateTitle or not sandboxTitle then
		return nil
	end

	local templatePage = templateTitle.prefixedText

	-- Make links.
	local frame = mw.getCurrentFrame()
	local sandboxLinks = mw.html.create()

	if checkExists(sandboxTitle.prefixedText) then
		sandboxLinks:wikitext(
			p.makeUrlWikilink(sandboxTitle.prefixedText, i18n:msg('sandbox-link-display')),
			' '
		)

		local sandboxEditLink = p.makeUrlLink(
			sandboxTitle:fullUrl({ action = 'edit' }, 'https'),
			frame:preprocess('{{lc:{{int:edit}}}}')
		)
		local compareUrl = env.compareUrl
		local compareLink
		if compareUrl then
			compareLink = p.makeUrlLink(
				compareUrl,
				frame:preprocess('{{lc:{{int:diff}}}}')
			)
		end

		sandboxLinks:node(p.makeToolbar(sandboxEditLink, compareLink))
	elseif p.message('sandbox-subpage-show', nil, 'boolean') then
		sandboxLinks:wikitext(
			i18n:msg('sandbox-link-display'),
			' '
		)

		local sandboxCreateLink = p.makeUrlLink(
			sandboxTitle:fullUrl({
				action  = 'edit',
				redlink = '1',
				preload = subjectSpace == 828
					and p.message('module-sandbox-preload')
					or  p.message('template-sandbox-preload'),
			}, 'https'),
			frame:preprocess('{{lc:{{int:create}}}}')
		)
		local mirrorPreload = p.message('mirror-link-preload')
		if templateTitle.namespace == 828 then
			mirrorPreload = templateTitle.prefixedText
		end
		local mirrorLink = p.makeUrlLink(
			sandboxTitle:fullUrl({
				action  = 'edit',
				redlink = '1',
				preload = mirrorPreload,
				summary = i18n:msg('mirror-edit-summary', p.makeWikilink(templatePage)),
			}, 'https'),
			i18n:msg('mirror-link-display')
		)

		sandboxLinks:node(p.makeToolbar(sandboxCreateLink, mirrorLink))
	else
		sandboxLinks = nil
	end


	local msgArgs = {}

	local messageName =
		subjectSpace == 828
			and 'experiment-blurb-module'
			or  'experiment-blurb-template'

	if sandboxLinks then
		table.insert(msgArgs, 1, tostring(sandboxLinks):gsub('%%', '%%%%') or '')
	else
		messageName = messageName .. '-nosandbox'
	end

	return i18n:msg{
		key  = messageName,
		args = msgArgs,
	}
end

--[[
-- Generates the text "Please add categories to the /doc subpage."
--
-- ; Messages:
-- : 'doc-link-display' --> '/doc'
-- : 'add-categories-blurb' --> 'Please add categories to the $1 subpage.'
--
-- @function p.makeCategoriesBlurb
-- @private
-- @param {table} args - a table of arguments passed by the user
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string|nil}
--]]
function p.makeCategoriesBlurb(args, env)
	local docTitle = env.docTitle
	if not docTitle then
		return nil
	end

	local docPathLink = p.makeUrlWikilink(
		docTitle.prefixedText,
		p.message('doc-link-display')
	):gsub("%%", "%%%%")

	return i18n:msg('add-categories-blurb', docPathLink)
end

--[[
-- Generates the "Subpages of this template" link.
--
-- ; Messages:
-- : 'template-pagetype' --> 'template'
-- : 'module-pagetype' --> 'module'
-- : 'default-pagetype' --> 'page'
-- : 'subpages-link-display' --> 'Subpages of this $1'
--
-- @function p.makeSubpagesBlurb
-- @private
-- @param {table} args - a table of arguments passed by the user
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string|nil}
--]]
function p.makeSubpagesBlurb(args, env)
	local subjectSpace = env.subjectSpace
	local templateTitle = env.templateTitle
	if not subjectSpace or not templateTitle then
		return nil
	end

	local namespaceName = p.resolveNamespace(subjectSpace)
	assert(namespaceName ~= 'file')

	return i18n:msg(
		p.resolveNamespace(subjectSpace) .. '-subpages-link',
		'Special:PrefixIndex/' .. templateTitle.prefixedText .. '/'
	)
end

---
-- Generates the blurb displayed when there is a print version of the template available.
--
-- ; Messages:
-- : 'print-link-display' --> '/Print'
-- : 'print-blurb' --> 'A [[Help:Books/for experts#Improving the book layout|print version]]'
--		.. ' of this template exists at $1.'
--		.. ' If you make a change to this template, please update the print version as well.'
-- : 'display-print-category' --> true
-- : 'print-category' --> 'Templates with print versions'
--
-- @function p.makePrintBlurb
-- @private
-- @param {table} args - a table of arguments passed by the user
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string|nil}
function p.makePrintBlurb(args, env)
	local printTitle = env.printTitle
	if not printTitle then
		return nil
	end
	local ret
	if checkExists(printTitle.prefixedText) then
		local printLink = p.makeWikilink(printTitle.prefixedText, p.message('print-link-display'))
		ret = p.message('print-blurb', {printLink})
		local displayPrintCategory = p.message('display-print-category', nil, 'boolean')
		if displayPrintCategory then
			ret = ret .. p.makeCategoryLink(p.message('print-category'))
		end
	end
	return ret
end

-- --------------------------------------------------------------------------
-- Tracking categories
-- --------------------------------------------------------------------------

--[[
-- Check if {{T|documentation}} is transcluded on a /doc page.
--
-- ; Messages:
-- : 'display-strange-usage-category' --> true
-- : 'doc-subpage' --> 'doc'
-- : 'strange-usage-category' --> 'Pages with strange ((documentation)) usage'
-- : 'nodoc-category-template' --> 'Templates with no documentation'
-- : 'nodoc-category-module' --> 'Modules with no documentation'
-- : 'nodoc-category-file' --> 'Files with no summary'
-- : 'nodoc-category-other' --> 'Pages with no documentation'
-- : 'baddoc-category-template' --> 'Templates with bad documentation'
-- : 'baddoc-category-module' --> 'Modules with bad documentation'
-- : 'baddoc-category-file' --> 'Files with bad summary'
-- : 'baddoc-category-other' --> 'Pages with bad documentation'
--
-- @function p.addTrackingCategories
-- @private
-- @param {Environment} env - environment table containing title objects, etc., generated with p.getEnvironment
-- @return {string|nil}
--]]
function p.addTrackingCategories(env)
	local title = env.title
	local subjectSpace = env.subjectSpace
	if not title or not subjectSpace then
		return nil
	end
	local subpage = title.subpageText
	local ret = ''
	if p.message('display-strange-usage-category', nil, 'boolean')
		and subpage == p.message('doc-subpage')
	then
		ret = ret .. p.makeCategoryLink(p.message('strange-usage-category'))
	end
	local docStatus = env.docStatus
	if docStatus then
		ret = ret .. p.makeCategoryLink(p.message(docStatus .. '-category-' .. p.resolveNamespace(subjectSpace)))
	end
	if p.resolveNamespace(subjectSpace) ~= 'other' and subpage ~= p.message('sandbox-subpage') then
		ret = ret .. p.makeCategoryLink(p.resolveNamespace(subjectSpace, true))
	end
	return ret
end

-- --------------------------------------------------------------------------
-- Type category
-- --------------------------------------------------------------------------
--[[
-- Add type if in arguments
-- @function p.addTypeCategory
-- @private
-- @param {table} args - a table of arguments passed by the user
-- @return {string}
--]]
function p.addTypeCategory(args)
	if lib.isEmpty(args['type']) then return '' end
	local templateTypes = lib.split(args['type'], ';')
	local ret = ''
	if templateTypes then
		for _,Type in ipairs(templateTypes) do
			ret = ret .. p.makeCategoryLink(Type .. ' Templates')
		end
	end
	return ret
end

return p