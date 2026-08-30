local p = {}

function p.main(frame)
	local formatCode = frame.args[1]
	
	local jstTimestamp = os.time() + 32400
	
	local d = os.date("!*t", jstTimestamp)
	
	if formatCode == 'Y' then
		return d.year
		
	elseif formatCode == 'm' then
		return string.format("%02d", d.month)
		
	elseif formatCode == 'd' then
		return string.format("%02d", d.day)
		
	elseif formatCode == 'H' then
		return string.format("%02d", d.hour)
		
	elseif formatCode == 'i' then
		return string.format("%02d", d.min)
		
	elseif formatCode == 's' then
		return string.format("%02d", d.sec)
		
	elseif formatCode == 'F' then
		return os.date("!%B", jstTimestamp)
		
	elseif formatCode == 'dow' then
		local wday = d.wday
		local map = {"日-Sun", "月-Mon", "火-Tue", "水-Wed", "木-Thu", "金-Fri", "土-Sat"}
		return map[wday]
		
	elseif formatCode == 'dow_en' then
		return os.date("!%a", jstTimestamp)
		
	elseif formatCode == 'dow_en_full' then
		return os.date("!%A", jstTimestamp)
		
	elseif formatCode == 'dow_jap' then
		local wday = d.wday
		local map = {"日", "月", "火", "水", "木", "金", "土"}
		return map[wday]
		
	elseif formatCode == 'dow_jap_full' then
		local wday = d.wday
		local map = {"日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"}
		return map[wday]
	end
	
	return ""
end

return p