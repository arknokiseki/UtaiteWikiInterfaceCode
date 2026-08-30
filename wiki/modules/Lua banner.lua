local yesno = require('Module:Yesno')
local mList = require('Module:List')
local mTableTools = require('Module:TableTools')
local mMessageBox = require('Module:Message box')

local p = {}

local messages = {
	['header'] = 'This template uses [[Wikipedia:Lua|Lua]]:',
	['wishtext'] = 'This template should use [[Wikipedia:Lua|Lua]].',
	['error_emptylist'] = 'Lua module has not been specified',
	['logo_alt'] = 'Lua logo',
	['logo_link'] = 'Wikipedia:Lua'
}

local function format(msg)
	return messages[msg] or msg
end

local function getConfig()
	return mw.loadData('Module:Lua banner/config')
end

function p.main(frame)
	local origArgs = frame:getParent().args
	local args = {}
	for k, v in pairs(origArgs) do
		v = v:match('^%s*(.-)%s*$')
		if v ~= '' then
			args[k] = v
		end
	end
	return p._main(args)
end

function p._main(args, cfg)
	local modules = mTableTools.compressSparseArray(args)
	local box = p.renderBox(modules, cfg, args)
	local trackingCategories = p.renderTrackingCategories(args, modules, nil, cfg)
	return box .. trackingCategories
end

function p.renderBox(modules, cfg, args)
	local boxArgs = {}
	if #modules < 1 then
		cfg = cfg or getConfig()
		if cfg['allow_wishes'] or yesno(args and args.wish) then
			boxArgs.text = format('wishtext')
		else
			boxArgs.text = string.format('<strong class="error">%s</strong>', format('error_emptylist'))
		end
	else
		local moduleLinks = {}
		for i, module in ipairs(modules) do
			moduleLinks[i] = string.format('[[:%s]]', module)
		end
		local moduleList = mList.makeList('bulleted', moduleLinks)
		boxArgs.text = format('header') .. '\n' .. moduleList
	end
	boxArgs.type = 'notice'
	boxArgs.small = true
	boxArgs.image = string.format(
		'[[File:Lua-logo-nolabel.svg|30px|alt=%s|link=%s]]',
		format('logo_alt'),
		format('logo_link')
	)
	return mMessageBox.main('mbox', boxArgs)
end

function p.renderTrackingCategories(args, modules, titleObj, cfg)
	if yesno(args.nocat) then
		return ''
	end
	
	cfg = cfg or getConfig()
	
	local cats = {}
	
	-- Error category
	if #modules < 1 and not (cfg['allow_wishes'] or yesno(args.wish)) and cfg['error_category'] then
		cats[#cats + 1] = cfg['error_category']
	end
	
	-- Lua templates category
	titleObj = titleObj or mw.title.getCurrentTitle()
	if titleObj.namespace == 10 
		and not cfg['subpage_blacklist'][titleObj.subpageText]
	then
		local category = args.category
		if not category then
			local pagename = modules[1] and mw.title.new(modules[1])
			category = pagename and cfg['module_categories'][pagename.text]
			if not category then
				if (cfg['allow_wishes'] or yesno(args.wish)) and #modules < 1 then
					category = cfg['wish_category']
				else
					category = cfg['default_category']
				end
			end
		end
		if category then
			cats[#cats + 1] = category
		end
	end
	
	for i, cat in ipairs(cats) do
		cats[i] = string.format('[[Category:%s]]', cat)
	end
	return table.concat(cats)
end

return p