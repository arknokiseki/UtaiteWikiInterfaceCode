local p = {}

function p.format(frame)
	local args = frame:getParent().args
	local id = args[1] or 'yt'
	local viewsRaw = args[2] or '301'
	
	-- 1. Clean the input (remove commas, periods, spaces)
	local viewsClean = string.gsub(viewsRaw, "[,%.%s]", "")
	local views = tonumber(viewsClean)
	
	if not views then
		return string.format('<span class="error">%s is not a supported number yet.</span> [[Category:Error/Views]]', viewsRaw)
	end
	
	-- 2. Formatting Logic
	local len = string.len(viewsClean)
	local formattedNum = views
	
	if len == 2 then
		-- {{#expr:(({{#var:views}}*0.1) round 0)*10}}
		formattedNum = math.floor((views * 0.1) + 0.5) * 10
	elseif len == 3 then
		-- {{#sub:...|0|-1}}0 -> Round down to nearest 10
		formattedNum = tonumber(string.sub(viewsClean, 1, -2) .. "0")
	elseif len >= 4 and len <= 6 then
		-- {{#sub:...|0|-2}}00 -> Round down to nearest 100
		formattedNum = tonumber(string.sub(viewsClean, 1, -3) .. "00")
	elseif len >= 7 and len <= 9 then
		-- {{#sub:...|0|-3}}000 -> Round down to nearest 1000
		formattedNum = tonumber(string.sub(viewsClean, 1, -4) .. "000")
	end
	
	-- Apply MediaWiki formatting (commas)
	local displayNum = frame:callParserFunction('formatnum', { formattedNum })
	
	local output = displayNum .. "+ {{External|" .. id .. "}} views"
	
	-- 3. Categorization Logic
	local categories = ""
	
	if views >= 8999 and views <= 9999 then
		categories = categories .. "[[Category:Songs approaching 10K {{External|" .. id .. "}} views|" .. views .. "]]"
	end
	if views >= 10000 and views <= 99999 then
		categories = categories .. "[[Category:Songs with 10K {{External|" .. id .. "}} views|" .. views .. "]]"
	end
	
	if views >= 89999 and views <= 99999 then
		categories = categories .. "[[Category:Songs approaching 100K {{External|" .. id .. "}} views|" .. views .. "]]"
	end
	if views >= 100000 and views <= 999999 then
		if id == 'nn' then
			categories = categories .. "[[Category:Hall of Fame]]"
		else
			categories = categories .. "[[Category:Songs with 100K {{External|" .. id .. "}} views|" .. views .. "]]"
		end
	end
	
	if views >= 899999 and views <= 999999 then
		categories = categories .. "[[Category:Songs approaching 1M {{External|" .. id .. "}} views|" .. views .. "]]"
	end
	if views >= 1000000 and views <= 9999999 then
		if id == 'nn' then
			categories = categories .. "[[Category:Hall of Legend]]"
		else
			categories = categories .. "[[Category:Songs with 1M {{External|" .. id .. "}} views|" .. views .. "]]"
		end
	end
	
	if views >= 8999999 and views <= 9999999 then
		categories = categories .. "[[Category:Songs approaching 10M {{External|" .. id .. "}} views|" .. views .. "]]"
	end
	if views >= 10000000 and views <= 99999999 then
		if id == 'nn' then
			categories = categories .. "[[Category:Hall of Myths]]"
		else
			categories = categories .. "[[Category:Songs with 10M {{External|" .. id .. "}} views|" .. views .. "]]"
		end
	end
	
	if views >= 89999999 and views <= 99999999 then
		categories = categories .. "[[Category:Songs approaching 100M {{External|" .. id .. "}} views|" .. views .. "]]"
	end
	if views >= 100000000 then
		if id == 'nn' then
			categories = categories .. "[[Category:Hall of Myths]]"
		else
			categories = categories .. "[[Category:Songs with 100M {{External|" .. id .. "}} views|" .. views .. "]]"
		end
	end
	
	if not mw.title.getCurrentTitle().isSubpage then
		output = output .. categories
	end
	
	return frame:preprocess(output)
end

return p