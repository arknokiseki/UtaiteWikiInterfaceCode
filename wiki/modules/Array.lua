local p = {}
local lib = require('Module:Feature')

function p.main(frame)
	local args = require('Module:Arguments').getArgs(frame, {
		wrapper = { 'Template:Array' }
	})
	--mw.logObject(args,'args') --debug
	return p._main(args, frame)
end

function p._main(args, frame)
	local arrayString = args[1] or nil
	local separator = args[2] or args.delim or nil
	local form = args[3] or args['format'] or nil
	local join = args[4] or args.join or ''
	local dedupe = args['dedupe'] or nil
	local sort = args['sort'] or nil
	local sentence = args['sentence'] or nil
	local template = args['template'] or nil
	local prefix = args['prefix'] or ''
	local suffix = args['suffix'] or ''
	local sentence_last = args['sentence_last'] or ' and '
	local sentence_join = args['sentence_join'] or ', '
	local sub_separator = args.subsep or nil
	local split_opt = {
		removeEmpty = args['removeEmpty'] or nil,
		noTrim = args['noTrim'] or nil
	}

	-- argument validation
	if arrayString == nil then return '' end
	if separator == nil then return error('Second argument (separator) must not be empty.') end
	if separator == '' then return error('Second argument (separator) must not be empty string.') end
	if form == nil then return error('Third argument (format) must not be empty.') end
	if form:find('{item[%d%.]*}') == nil then return error('Third argument (format) does not include {item}.') end

	-- split string to array
	local array = lib.split(arrayString, separator, split_opt)

	-- remove duplcates from array
	if dedupe == '1' then
		array = p._removeDuplicates(array)
	end
	
	-- sort array
	if sort ~= nil then
		array = p._sort(array, sort)
	end
	
	-- replace keywords in array
	for key, value in pairs(array) do
		local item = form
		item = item:gsub('{newline}', '\n')
		item = item:gsub('{index}', key)
		
		-- figure out sub-divisions if any
		function split(arr, index)
			if args['delim' .. index] then
				for v in lib.gsplit(arr.main, args['delim' .. index], split_opt) do
					local subarr = {main = v}
					split(subarr, tostring(tonumber(index)+1))
					table.insert(arr, subarr)
				end
			else
				return
			end
		end
		local values = { main = value }
		split(values, '2')
		
		item = item:gsub('{item}', value)
		item = item:gsub('{item([%d%.]*)}',
			function(suffix)
				local val = values
				for index in lib.gsplit(suffix, '.') do
					if val[tonumber(index)] then
						val = val[tonumber(index)]
					else
						val = {main=''}
						break
					end
				end
				return val.main
			end
		)
		
		array[key] = item
	end
	
	if args.debug then mw.logObject(array, 'input array') end
	
	-- create result array
	local result = ''
	
	-- join as sentence
	if sentence ~= nil then
		if #array == 0 then return ''
		elseif #array == 1 then result =  array[1]
		elseif #array == 2 then result =  array[1] .. sentence_last .. array[2]
		else
			local last = table.remove(array, #array)
			result = table.concat(array, sentence_join) .. ',' .. sentence_last .. last
		end
	-- join with join string
	else
		result = table.concat(array, join):gsub('{newline}', '\n'):gsub('{space}', ' ')--in case joining string contains keyword
	end
	result = prefix .. result .. suffix
	if template then
		if args.debug then mw.logObject(result, 'final result pre-preprocess') end
		if not args.nodpl then
			result = result
				:gsub('²{','{{')
				:gsub('}²','}}')
				:gsub('¦','|')
		end
		result = result
			:gsub('%^2{','{{')	-- for use inside DPL
			:gsub('}%^2','}}')	--
			:gsub('¹','|')		--
		result = frame:preprocess(result)
	end
	
	if args.debug then mw.logObject(result, 'final result') end
	
	return result
end

function p._removeDuplicates(arr)
	local hash = {}
	local res = {}

	for _,v in ipairs(arr) do
	   if (not hash[v]) then
	       res[#res+1] = v
	       hash[v] = true
	   end
	end

	return res
end

function p._sort(arr, dir)
	local order = nil
	if (dir == -1 or dir == '-1') then
		order = function(tVal, a, b) return a > b end
	elseif (dir == 1 or dir == '1') then
		order = function(tVal, a, b) return a < b end
	else
		return arr
	end
	table.sort(arr, function(a, b) return order(t, a, b) end)
	return arr
end

return p