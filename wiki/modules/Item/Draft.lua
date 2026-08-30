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
	local item      = lib.nilIfEmpty(args[1])      or lib.nilIfEmpty(args.name) or "Unknown"
	local size      = lib.nilIfEmpty(args[2])      or lib.nilIfEmpty(args.size) or 30
	local count     = lib.nilIfEmpty(args.count)   or lib.nilIfEmpty(args.x)    or nil
	local type      = lib.nilIfEmpty(args["type"]) or "Item"
	local text      = lib.nilIfEmpty(args.text)    or item
	local link      = args.link                    or lib.ternary(item == "Unknown", "", item)
	local blueprint = tostring(args.blueprint) == "1"
	local newline   = tostring(args.newline) == "1"
	local notext    = tostring(args.notext) == "1"
	local white     = tostring(args.white) == "1"

	local prefix    = args.prefix and (args.prefix .. " ") or (type .. " ")
	local suffix    = args.suffix and (" " .. args.suffix) or ""
	
	if (type == "Character") then
		prefix = ""
		suffix = " Icon"
	elseif (type == "Enemy") then
		prefix = ""
		suffix = " Icon"
	elseif (type == "Wildlife") then
		prefix = ""
		suffix = " Icon"
	elseif (type == "Outfit") then
		prefix = ""
		suffix = " Icon"
	end
	
	if (type ~= "Character" and item == "Unknown") then
		prefix = "Item "
		suffix = ""
	end
	
	if (white) then suffix = suffix .. " White" end
	
	local filename = "File:" .. prefix .. item .. suffix .. ".png"
	
	local file = "[[" .. filename .. "|" .. size .. "x" .. size .. "px|alt=" .. item .. "|link=" .. link .. "]]"
	local mobile_file = "[[" .. filename .. "|30x30px|alt=" .. item .. "|link=" .. link .. "]]"

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
		icon = "[[File:Icon Furnishing Blueprint.png|" .. corner_size .. "x" .. corner_size .. "px|link=" .. link .. "]]"
	end

	if (lib.isEmpty(item)) then
		return ""
	end

	local outerClass = lib.ternary(type:lower() == "item", "item", "item " .. type:lower())
	local result = mw.html.create():tag("span")
		:addClass(outerClass)
		:css({
			display = "inline-block"
		})

	local item_image = result:tag("span")
		:addClass("item_image")
		:tag("span")
			:addClass("hidden")
			:css({
				display  = "inline-block",
				width    = size .. "px",
				height   = size .. "px",
				position = "relative"
			})
			:wikitext(file)
			:done()
		:tag("span")
			:addClass("mobile-only")
			:wikitext(mobile_file)
			:done()

	if (icon ~= nil) then
		item_image:tag("span")
			:css({
				position = "absolute",
				top      = offset .. "px",
				left     = "0px",
				width    = corner_size .. "px",
				height   = corner_size .. "px"
			})
			:wikitext(icon)
	end
	
	if (newline) then
		result:css({["text-align"] = "center"})
		result:tag("br"):addClass("hidden")
	end
	
	if (not notext) then
		local item_text = result:tag("span"):addClass("item_text")
		
		if (lib.isEmpty(link)) then
			item_text:wikitext(" " .. text)
		else
			item_text:wikitext((newline and "" or " ") .. "[[" .. link .. "|" .. text .. "]]")
		end
	end

	if (count) then
		result:tag("span"):addClass("item_text"):wikitext((notext and "" or " ") .. "×" .. count)
	end
	
	return tostring(result);
end

return p