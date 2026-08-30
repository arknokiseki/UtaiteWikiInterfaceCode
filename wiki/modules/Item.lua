local p = {}
local lib = require('Module:Feature')

function p.main(frame)
	local args = require('Module:Arguments').getArgs(frame, {
		parentFirst = true,
		removeBlanks = false
	})
	return p._main(args)
end

function p._main(args)
	local item		= lib.nilIfEmpty(args[1])		or lib.nilIfEmpty(args.name)	or 'Unknown'
	local size		= lib.nilIfEmpty(args[2])		or lib.nilIfEmpty(args.size)	or 30
	local count		= lib.nilIfEmpty(args.count)	or lib.nilIfEmpty(args.x)		or nil
	local note		= lib.nilIfEmpty(args.note)		or nil
	local ref		= lib.nilIfEmpty(args.ref)		or nil
	local type		= lib.nilIfEmpty(args['type'])	or 'Item'
	local text		= lib.nilIfEmpty(args.text)		or item
	local link		= args.link						or lib.ternary(item == 'Unknown', '', item)
	local blueprint	= tostring(args.blueprint) == '1'
	local newline	= tostring(args.newline) == '1'
	local notext	= tostring(args.notext) == '1'
	local white		= tostring(args.white) == '1'

	local prefix	= args.prefix and (args.prefix .. ' ') or (type .. ' ')
	local suffix	= args.suffix and (' ' .. args.suffix) or ''
	
	if lib.inArray({'Character', 'Enemy', 'Wildlife', 'Outfit'}, type) then
		prefix = ''
		suffix = ' Icon'
	end
	
	if (type ~= 'Character' and item == 'Unknown') then
		prefix = 'Item '
		suffix = ''
	end
	
	if (white) then suffix = suffix .. ' White' end
	
	local filename = 'File:' .. prefix .. item .. suffix .. '.png'
	
	local file = '[[' .. filename .. '|' .. size .. 'x' .. size .. 'px|alt=' .. item .. '|link=' .. link .. ']]'
	local mobile_file = '[[' .. filename .. '|30x30px|alt=' .. item .. '|link=' .. link .. ']]'

	local icon = nil
	local corner_size = math.floor(tonumber(size) / 2.5)
	local offset = 0
	if (corner_size > 21) then
		offset = 0
	elseif (corner_size > 8) then
		offset = math.floor((corner_size - 22) / 2)
	else
		offset = -6
	end

	if (blueprint) then
		icon = '[[File:Icon Furnishing Blueprint.png|' .. corner_size .. 'x' .. corner_size .. 'px|link=' .. link .. ']]'
	end

	if (lib.isEmpty(item)) then
		return ''
	end

	local outerClass = lib.ternary(type:lower() == 'item', 'item', 'item ' .. type:lower())
	local result = mw.html.create():tag('span'):addClass(outerClass)

	local item_image = result:tag('span')
		:addClass('item-image')
		:tag('span')
			:addClass('hidden')
			:css({
				width    = size .. 'px',
				height   = size .. 'px',
			})
			:attr('data-size', size)
			:wikitext(file)
			:done()
		:tag('span')
			:addClass('mobile-only')
			:wikitext(mobile_file)
			:done()

	if (icon ~= nil) then
		item_image:tag('span'):addClass('item-icon')
			:css({
				top      = offset .. 'px',
				width    = corner_size .. 'px',
				height   = corner_size .. 'px'
			})
			:attr('data-offset', offset)
			:attr('data-corner-size', corner_size)
			:wikitext(icon)
	end
	
	if (newline) then
		result:addClass('newline')
		result:tag('br'):addClass('hidden')
	end
	
	function parseAmE(a, b)
		local a = a or ''
		local b = b or ''
		
		function addPunct(var)
			if args.comma or args.commaspc then var = var .. ','
			elseif args.dot or args.dotspc then var = var .. '.'
			end
			var = var
				:gsub('%.%.%."%s-[%.%,]$', '..."')	-- no punctuation if quote ends in elipses
				:gsub('([%?%!])"%s-[%.%,]$', '%1"')	-- no punctuation if quote ends in question or exclamation
				:gsub('"%s-([%.%,])$', '%1"')		-- move punctuation inside quote for anything else bc AmE
			return var
		end
		
		-- needs to append to the last one with text
		if lib.isEmpty(b) then a = addPunct(a)
		else b = addPunct(b)
		end
		
		if args.commaspc or args.dotspc then b = b .. ' ' end -- space always on the very end
		
		return {a, b}
	end

	local item_text = result:tag('span'):addClass('item-text')
	if (not notext) then
		local before = newline and '' or ' '
		local ame = ((count or note) and {text, ''} or parseAmE(text, ''))
		local label = ame[1]
		local after = ame[2]
		if (ref and not(count or note)) then after:gsub('%s*$', '') end
		
		if (lib.isEmpty(link)) then
			item_text:wikitext(before, label, after)
		else
			item_text:wikitext(before, '[[', link, '|', label, ']]', after)
		end
	end

	if (count) then
		count = (count:gsub(',', ''))
		if tonumber(count)~=nil then count = lib.thousandsSeparator(count) end
		count = table.concat(note and {count, ''} or parseAmE(count, ''), '')
		if (ref and not note) then count:gsub('%s*$', '') end
		item_text:wikitext((notext and '' or ' ') .. '×' .. count)
	end
	
	if (note) then
		local after = table.concat(parseAmE('', ''), '')
		if (ref) then after:gsub('%s*$', '') end
		item_text:tag('small'):wikitext(((notext and not count) and '' or ' '),'(', note, ')', after)
	end
	
	if (ref) then
		local after = (args.commaspc or args.dotspc) and ' ' or '' -- avoid space between ref and punctuation 
		item_text:wikitext(ref, after)
	end
	
	return tostring(result);
end

return p