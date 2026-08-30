--
-- This module implements {{Navbox}}
--

local p = {}

local navbar = require('Module:Navbar')._navbar
local getArgs -- lazily initialized

local args
local border
local listnums
local ODD_EVEN_MARKER = '\127_ODDEVEN_\127'
local RESTART_MARKER = '\127_ODDEVEN0_\127'
local REGEX_MARKER = '\127_ODDEVEN(%d?)_\127'

local function striped(wikitext)
	-- Return wikitext with markers replaced for odd/even striping.
	-- Child (subgroup) navboxes are flagged with a category that is removed
	-- by parent navboxes. The result is that the category shows all pages
	-- where a child navbox is not contained in a parent navbox.
	local orphanCat = '[[Category:Navbox orphans]]'
	if border == 'subgroup' and args.orphan ~= 'yes' then
		-- No change; striping occurs in outermost navbox.
		return wikitext .. orphanCat
	end
	local first, second = 'odd', 'even'
	if args.evenodd then
		if args.evenodd == 'swap' then
			first, second = second, first
		else
			first = args.evenodd
			second = first
		end
	end
	local changer
	if first == second then
		changer = first
	else
		local index = 0
		changer = function (code)
			if code == '0' then
				-- Current occurrence is for a group before a nested table.
				-- Set it to first as a valid although pointless class.
				-- The next occurrence will be the first row after a title
				-- in a subgroup and will also be first.
				index = 0
				return first
			end
			index = index + 1
			return index % 2 == 1 and first or second
		end
	end
	local regex = orphanCat:gsub('([%[%]])', '%%%1')
	return (wikitext:gsub(regex, ''):gsub(REGEX_MARKER, changer))  -- () omits gsub count
end

local function processItem(item, nowrapitems)
	if item:sub(1, 2) == '{|' then
		-- Applying nowrap to lines in a table does not make sense.
		-- Add newlines to compensate for trim of x in |parm=x in a template.
		return '\n' .. item ..'\n'
	end
	if nowrapitems == 'yes' then
		local lines = {}
		for line in (item .. '\n'):gmatch('([^\n]*)\n') do
			local prefix, content = line:match('^([*:;#]+)%s*(.*)')
			if prefix and not content:match('^<span class="nowrap">') then
				line = prefix .. '<span class="nowrap">' .. content .. '</span>'
			end
			table.insert(lines, line)
		end
		item = table.concat(lines, '\n')
	end
	if item:match('^[*:;#]') then
		return '\n' .. item ..'\n'
	end
	return item
end

-- Separate function so that we can evaluate properly whether hlist should
-- be added by the module
local function has_navbar()
	return args.navbar ~= 'off' and args.navbar ~= 'plain' and not
		(not args.name and mw.getCurrentFrame():getParent():getTitle():gsub('/sandbox$', '') == 'Template:Navbox')
end

local function renderNavBar(titleCell)

	if has_navbar() then
		titleCell:wikitext(navbar{
			args.name,
			-- we depend on this being mini = 1 when the navbox module decides
			-- to add hlist templatestyles. we also depend on navbar outputting
			-- a copy of the hlist templatestyles.
			mini = 1,
			fontstyle = (args.basestyle or '') .. ';' .. (args.titlestyle or '') .. ';background:transparent !important;border:none;box-shadow:none; padding:0;'
		})
	end

end

--
--   Title row
--
local function renderTitleRow(tbl)
	if not args.title then return end

	local titleRow = tbl:tag('tr')

	if args.titlegroup then
		titleRow
			:tag('th')
				:attr('scope', 'row')
				:addClass('navbox-group')
				:addClass(args.titlegroupclass)
				:cssText(args.basestyle)
				:cssText(args.groupstyle)
				:cssText(args.titlegroupstyle)
				:wikitext(args.titlegroup)
	end

	local titleCell = titleRow:tag('th'):attr('scope', 'col')

	if args.titlegroup then
		titleCell
			:addClass('navbox-title1')
	end

	local titleColspan = 2
	if args.imageleft then titleColspan = titleColspan + 1 end
	if args.image then titleColspan = titleColspan + 1 end
	if args.titlegroup then titleColspan = titleColspan - 1 end

	titleCell
		:cssText(args.basestyle)
		:cssText(args.titlestyle)
		:addClass('navbox-title')
		:attr('colspan', titleColspan)

	renderNavBar(titleCell)

	titleCell
		:tag('div')
			-- id for aria-labelledby attribute
			:attr('id', mw.uri.anchorEncode(args.title))
			:addClass(args.titleclass)
			:css('font-size', '114%')
			:css('margin', '0 4em')
			:wikitext(processItem(args.title))
end

--
--   Above/Below rows
--

local function getAboveBelowColspan()
	local ret = 2
	if args.imageleft then ret = ret + 1 end
	if args.image then ret = ret + 1 end
	return ret
end

local function renderAboveRow(tbl)
	if not args.above then return end

	tbl:tag('tr')
		:tag('td')
			:addClass('navbox-abovebelow')
			:addClass(args.aboveclass)
			:cssText(args.basestyle)
			:cssText(args.abovestyle)
			:attr('colspan', getAboveBelowColspan())
			:tag('div')
				-- id for aria-labelledby attribute, if no title
				:attr('id', args.title and nil or mw.uri.anchorEncode(args.above))
				:wikitext(processItem(args.above, args.nowrapitems))
end

local function renderBelowRow(tbl)
	if not args.below then return end

	tbl:tag('tr')
		:tag('td')
			:addClass('navbox-abovebelow')
			:addClass(args.belowclass)
			:cssText(args.basestyle)
			:cssText(args.belowstyle)
			:attr('colspan', getAboveBelowColspan())
			:tag('div')
				:wikitext(processItem(args.below, args.nowrapitems))
end

--
--   List rows
--
local function renderListRow(tbl, index, listnum)
	local row = tbl:tag('tr')

	if index == 1 and args.imageleft then
		row
			:tag('td')
				:addClass('navbox-image')
				:addClass(args.imageclass)
				:css('width', '1px')               -- Minimize width
				:css('padding', '0px 2px 0px 0px')
				:cssText(args.imageleftstyle)
				:attr('rowspan', #listnums)
				:tag('div')
					:wikitext(processItem(args.imageleft))
	end

	if args['group' .. listnum] then
		local groupCell = row:tag('th')

		-- id for aria-labelledby attribute, if lone group with no title or above
		if listnum == 1 and not (args.title or args.above or args.group2) then
			groupCell
				:attr('id', mw.uri.anchorEncode(args.group1))
		end

		groupCell
			:attr('scope', 'row')
			:addClass('navbox-group')
			:addClass(args.groupclass)
			:cssText(args.basestyle)
			:css('width', args.groupwidth or '1%') -- If groupwidth not specified, minimize width

		groupCell
			:cssText(args.groupstyle)
			:cssText(args['group' .. listnum .. 'style'])
			:wikitext(args['group' .. listnum])
	end

	local listCell = row:tag('td')

	if args['group' .. listnum] then
		listCell
			:addClass('navbox-list1')
	else
		listCell:attr('colspan', 2)
	end

	if not args.groupwidth then
		listCell:css('width', '100%')
	end

	local rowstyle  -- usually nil so cssText(rowstyle) usually adds nothing
	if index % 2 == 1 then
		rowstyle = args.oddstyle
	else
		rowstyle = args.evenstyle
	end

	local listText = args['list' .. listnum]
	local oddEven = ODD_EVEN_MARKER
	if listText:sub(1, 12) == '</div><table' then
		-- Assume list text is for a subgroup navbox so no automatic striping for this row.
		oddEven = listText:find('<th[^>]*"navbox%-title"') and RESTART_MARKER or 'odd'
	end
	listCell
		:css('padding', '0px')
		:cssText(args.liststyle)
		:cssText(rowstyle)
		:cssText(args['list' .. listnum .. 'style'])
		:addClass('navbox-list')
		:addClass('navbox-' .. oddEven)
		:addClass(args.listclass)
		:addClass(args['list' .. listnum .. 'class'])
		:tag('div')
			:css('padding', (index == 1 and args.list1padding) or args.listpadding or '0em 0.25em')
			:wikitext(processItem(listText, args.nowrapitems))

	if index == 1 and args.image then
		row
			:tag('td')
				:addClass('navbox-image')
				:addClass(args.imageclass)
				:css('width', '1px')               -- Minimize width
				:css('padding', '0px 0px 0px 2px')
				:cssText(args.imagestyle)
				:attr('rowspan', #listnums)
				:tag('div')
					:wikitext(processItem(args.image))
	end
end


--
--   Tracking categories
--

local function needsHorizontalLists()
	if border == 'subgroup' or args.tracking == 'no' then
		return false
	end
	local listClasses = {
		['plainlist'] = true, ['hlist'] = true, ['hlist hnum'] = true,
		['hlist hwrap'] = true, ['hlist vcard'] = true, ['vcard hlist'] = true,
		['hlist vevent'] = true,
	}
	return not (listClasses[args.listclass] or listClasses[args.bodyclass])
end

-- there are a lot of list classes in the wild, so we have a function to find
-- them and add their TemplateStyles
local function addListStyles()
	local frame = mw.getCurrentFrame()
	-- TODO?: Should maybe take a table of classes for e.g. hnum, hwrap as above
	-- I'm going to do the stupid thing first though
	-- Also not sure hnum and hwrap are going to live in the same TemplateStyles
	-- as hlist
	local function _addListStyles(htmlclass, templatestyles)
		local class_args = { -- rough order of probability of use
			'bodyclass', 'listclass', 'aboveclass', 'belowclass', 'titleclass',
			'navboxclass', 'groupclass', 'titlegroupclass', 'imageclass'
		}
		local patterns = {
			'^' .. htmlclass .. '$',
			'%s' .. htmlclass .. '$',
			'^' .. htmlclass .. '%s',
			'%s' .. htmlclass .. '%s'
		}
		
		local found = false
		for _, arg in ipairs(class_args) do
			for _, pattern in ipairs(patterns) do
				if mw.ustring.find(args[arg] or '', pattern) then
					found = true
					break
				end
			end
			if found then break end
		end
		if found then
			return frame:extensionTag{
				name = 'templatestyles', args = { src = templatestyles }
			}
		else
			return ''
		end
	end
	
	local hlist_styles = ''
	-- navbar always has mini = 1, so here (on this wiki) we can assume that
	-- we don't need to output hlist styles in navbox again.
	if not has_navbar() then
		hlist_styles = _addListStyles('hlist', 'Flatlist/styles.css')
	end
	local plainlist_styles = _addListStyles('plainlist', 'Plainlist/styles.css')
	
	return hlist_styles .. plainlist_styles
end

local function hasBackgroundColors()
	for _, key in ipairs({'titlestyle', 'groupstyle', 'basestyle', 'abovestyle', 'belowstyle'}) do
		if tostring(args[key]):find('background', 1, true) then
			return true
		end
	end
end

local function hasBorders()
	for _, key in ipairs({'groupstyle', 'basestyle', 'abovestyle', 'belowstyle'}) do
		if tostring(args[key]):find('border', 1, true) then
			return true
		end
	end
end

local function isIllegible()
	-- require('Module:Color contrast') absent on mediawiki.org
	return false
end

local function getTrackingCategories()
	local cats = {}
	if needsHorizontalLists() then table.insert(cats, 'Navigational boxes without horizontal lists') end
	if hasBackgroundColors() then table.insert(cats, 'Navboxes using background colours') end
	if isIllegible() then table.insert(cats, 'Potentially illegible navboxes') end
	if hasBorders() then table.insert(cats, 'Navboxes using borders') end
	return cats
end

local function renderTrackingCategories(builder)
	local title = mw.title.getCurrentTitle()
	if title.namespace ~= 10 then return end -- not in template space
	local subpage = title.subpageText
	if subpage == 'doc' or subpage == 'sandbox' or subpage == 'testcases' then return end

	for _, cat in ipairs(getTrackingCategories()) do
		builder:wikitext('[[Category:' .. cat .. ']]')
	end
end

--
--   Main navbox tables
--
local function renderMainTable()
	local tbl = mw.html.create('table')
		:addClass('nowraplinks')
		:addClass(args.bodyclass)

	if args.title and (args.state ~= 'plain' and args.state ~= 'off') then
		if args.state == 'collapsed' then args.state = 'mw-collapsed' end
		tbl
			:addClass('mw-collapsible')
			:addClass(args.state or 'autocollapse')
	end

	tbl:css('border-spacing', 0)
	if border == 'subgroup' or border == 'none' then
		tbl
			:addClass('navbox-subgroup')
			:cssText(args.bodystyle)
			:cssText(args.style)
	else  -- regular navbox - bodystyle and style will be applied to the wrapper table
		tbl
			:addClass('navbox-inner')
			:css('background', 'transparent')
			:css('color', 'inherit')
	end
	tbl:cssText(args.innerstyle)

	renderTitleRow(tbl)
	renderAboveRow(tbl)
	for i, listnum in ipairs(listnums) do
		renderListRow(tbl, i, listnum)
	end
	renderBelowRow(tbl)

	return tbl
end

function p._navbox(navboxArgs)
	args = navboxArgs
	listnums = {}

	for k, _ in pairs(args) do
		if type(k) == 'string' then
			local listnum = k:match('^list(%d+)$')
			if listnum then table.insert(listnums, tonumber(listnum)) end
		end
	end
	table.sort(listnums)

	border = mw.text.trim(args.border or args[1] or '')
	if border == 'child' then
		border = 'subgroup'
	end

	-- render the main body of the navbox
	local tbl = renderMainTable()
	
	-- get templatestyles
	local frame = mw.getCurrentFrame()
	local base_templatestyles = frame:extensionTag{
		name = 'templatestyles', args = { src = 'Module:Navbox/styles.css' }
	}
	local templatestyles = ''
	if args.templatestyles and args.templatestyles ~= '' then
		templatestyles = frame:extensionTag{
			name = 'templatestyles', args = { src = args.templatestyles }
		}
	end
	
	local res = mw.html.create()
	-- 'navbox-styles' exists for two reasons:
	--  1. To wrap the styles to work around phab: T200206 more elegantly. Instead
	--	   of combinatorial rules, this ends up being linear number of CSS rules.
	--  2. To allow MobileFrontend to rip the styles out with 'nomobile' such that
	--     they are not dumped into the mobile view.
	res:tag('div')
		:addClass('navbox-styles')
		:addClass('nomobile')
		:wikitext(base_templatestyles .. templatestyles)
		:done()
	
	-- render the appropriate wrapper around the navbox, depending on the border param
	if border == 'none' then
		local nav = res:tag('div')
			:attr('role', 'navigation')
			:wikitext(addListStyles())
			:node(tbl)
		-- aria-labelledby title, otherwise above, otherwise lone group
		if args.title or args.above or (args.group1 and not args.group2) then
			nav:attr('aria-labelledby', mw.uri.anchorEncode(args.title or args.above or args.group1))
		else
			nav:attr('aria-label', 'Navbox')
		end
	elseif border == 'subgroup' then
		-- We assume that this navbox is being rendered in a list cell of a
		-- parent navbox, and is therefore inside a div with padding:0em 0.25em.
		-- We start with a </div> to avoid the padding being applied, and at the
		-- end add a <div> to balance out the parent's </div>
		res
			:wikitext('</div>')
			:wikitext(addListStyles())
			:node(tbl)
			:wikitext('<div>')
	else
		local nav = res:tag('div')
			:attr('role', 'navigation')
			:addClass('navbox')
			:addClass(args.navboxclass)
			:cssText(args.bodystyle)
			:cssText(args.style)
			:css('padding', '3px')
			:wikitext(addListStyles())
			:node(tbl)
		-- aria-labelledby title, otherwise above, otherwise lone group
		if args.title or args.above or (args.group1 and not args.group2) then
			nav:attr('aria-labelledby', mw.uri.anchorEncode(args.title or args.above or args.group1))
		else
			nav:attr('aria-label', 'Navbox')
		end
	end

	if (args.nocat or 'false'):lower() == 'false' then
		renderTrackingCategories(res)
	end

	return striped(tostring(res))
end

function p.navbox(frame)
	if not getArgs then
		getArgs = require('Module:Arguments').getArgs
	end
	args = getArgs(frame, {wrappers = {'Template:Navbox', 'Template:Navbox subgroup'}})
	if frame.args.border then
		-- This allows Template:Navbox_subgroup to use {{#invoke:Navbox|navbox|border=...}}.
		args.border = frame.args.border
	end

	-- Read the arguments in the order they'll be output in, to make references number in the right order.
	local _
	_ = args.title
	_ = args.above
	for i = 1, 20 do
		_ = args["group" .. tostring(i)]
		_ = args["list" .. tostring(i)]
	end
	_ = args.below

	return p._navbox(args)
end

return p