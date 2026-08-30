local mt = {}

function mt.__index(t, k)
	return function(frame)
		local data = mw.loadData(k)
		local i = 1
		for _,v in ipairs(frame.args) do
			local ty = type(data)
			if ty ~= 'table' then
				local args = {}
				for j = 1, i - 1 do
					args[j] = frame.args[j]
				end
				if frame.args.softfail then
					return '<span class="error">[[Category:Pages with failed Module:Data lookups]]Error: Tried to read index "' .. mw.text.nowiki(v) .. '" of mw.loadData("' .. mw.text.nowiki(k) .. '").' .. mw.text.nowiki(table.concat(args, '.')) .. ', which is a ' .. ty .. '</span>'
				else
					error('Tried to read index "' .. v .. '" of mw.loadData("' .. k .. '").' .. table.concat(args, '.') .. ', which is a ' .. ty)
				end
			end
			data = data[v]
			i = i + 1
		end
		return data
	end
end

return setmetatable({}, mt)