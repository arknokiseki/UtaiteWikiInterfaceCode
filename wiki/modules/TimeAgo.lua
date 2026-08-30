local p = {}
local lang = mw.getContentLanguage()

function p.main(frame)
	local args = frame.args
	if not args[1] then
		args = frame:getParent().args
	end
	
	local input = args[1] or ''
	if input == '' then return '' end

	local success, inputTimestamp = pcall(function() 
		return lang:formatDate('U', input) 
	end)
	
	if not success or not inputTimestamp then
		return '<span class="uw-text uw-danger">Error: first parameter cannot be parsed as a date or time.</span>'
	end
	
	inputTimestamp = tonumber(inputTimestamp)
	local nowTimestamp = os.time()
	
	local diff = nowTimestamp - inputTimestamp
	local absDiff = math.abs(diff)
	
	local seconds = 1
	local minutes = 60
	local hours = 3600
	local days = 86400
	local weeks = 604800
	local months = 2678400
	local years = 31557600
	
	local value = 0
	local unit = ''
	
	if absDiff >= years then
		value = math.floor(absDiff / years)
		unit = 'year'
	elseif absDiff >= months then
		value = math.floor(absDiff / months)
		unit = 'month'
	elseif absDiff >= weeks then
		value = math.floor(absDiff / weeks)
		unit = 'week'
	elseif absDiff >= days then
		value = math.floor(absDiff / days)
		unit = 'day'
	elseif absDiff >= hours then
		value = math.floor(absDiff / hours)
		unit = 'hour'
	elseif absDiff >= minutes then
		value = math.floor(absDiff / minutes)
		unit = 'minute'
	else
		value = math.floor(absDiff / seconds)
		unit = 'second'
	end
	
	local text = lang:plural(value, unit, unit .. 's')
	local result = value .. ' ' .. text
	
	if diff > 0 then
		return result .. ' ago'
	else
		return result .. ' from now'
	end
end

function p.formatJST(frame)
	local args = frame:getParent().args
	local dateStr = args[1] or ''
	local timeStr = args[2] or ''
	
	if dateStr == '' then return '' end
	
	dateStr = dateStr:gsub("(%d+)[snrt][tdh]", "%1")
	
	local combined = dateStr
	
	if timeStr ~= '' then
		combined = combined .. ' ' .. timeStr
	end
	
	local success, result = pcall(function()
		return lang:formatDate('Y-m-d H:i:s', combined)
	end)
	
	if success then
		return result
	else
		return ''
	end
end

return p