local p = {}
local getArgs = require('Module:Arguments').getArgs
local Bucket = mw.bucket

local TYPE_ORDER = { ["nil"] = 1, number = 2, string = 3, boolean = 4, table = 5 }

local function compareValues(a, b)
	if a == b then
		return 0
	end

	local function typeOrder(val)
		local t = type(val)
		return TYPE_ORDER[t] or 6
	end

	local a_type = typeOrder(a)
	local b_type = typeOrder(b)

	if a_type ~= b_type then
		return a_type < b_type and -1 or 1
	end

	if a_type == 1 then
		return 0
	elseif a_type == 2 then
		if a < b then return -1 else return 1 end
	elseif a_type == 3 then
		if a < b then return -1 else return 1 end
	elseif a_type == 4 then
		if (a == false and b == true) then return -1 else return 1 end
	elseif a_type == 5 then
		local max_len = math.max(#a, #b)
		for i = 1, max_len do
			local a_elem = a[i]
			local b_elem = b[i]
			local cmp = compareValues(a_elem, b_elem)
			if cmp ~= 0 then
				return cmp
			end
		end
		if #a < #b then
			return -1
		elseif #a > #b then
			return 1
		else
			return 0
		end
	end

	return 0
end

local function sortResults(results, order_by)
	table.sort(results, function(a, b)
		for _, order in ipairs(order_by) do
			local a_val = a[order.column]
			local b_val = b[order.column]

			local cmp = compareValues(a_val, b_val)
			if cmp ~= 0 then
				if order.direction == "ASC" then
					return cmp == -1
				else
					return cmp == 1
				end
			end
		end
		return false
	end)
end

local function formatTable(frame, results, columns, args)
	local table_columns_str = args['table-columns']
	if table_columns_str then
		local by_alias = {}
		for _, col in ipairs(columns) do
			by_alias[col.alias] = col
		end
		local display_columns = {}
		for part in table_columns_str:gmatch('[^,]+') do
			local alias, new_label = part:match('^%s*(.-)%s*=%s*(.-)%s*$')
			if not alias then
				alias = part:match('^%s*(.-)%s*$')
			end
			local col = by_alias[alias]
			if col then
				if new_label then
					col.label = new_label
				end
				table.insert(display_columns, col)
			end
		end
		columns = display_columns
	end

	local html = mw.html.create('table'):addClass('wikitable')
	local header_row = html:tag('tr')
	for _, col in ipairs(columns) do
		header_row:tag('th'):wikitext(col.label)
	end

	for _, row in ipairs(results) do
		local tr = html:tag('tr')
		for _, col in ipairs(columns) do
			local data = row[col.alias]
			if data == nil then
				data = '<i>null</i>'
			else
				data = tostring(data)
			end
			tr:tag('td'):wikitext(data)
		end
	end

	-- In case an earlier step introduced a template that needs to be preprocessed.	
	if args['table-preprocess'] then
		return frame:preprocess(tostring(html));
	end

	return tostring(html)
end

local function getDelimiter(args)
	local delimiter = args['delimiter'] or ""
	return delimiter:gsub("\\n", "\n")
end

local function formatTemplate(frame, results, columns, args)
	local template_name = args['template']
	if not template_name then
		error("Template name must be specified for format=template")
	end
	local delimiter = getDelimiter(args)
	local output = {}
	for _, row in ipairs(results) do
		local parts = {}
		table.insert(parts, ("{{%s"):format(template_name))

		for _, col in ipairs(columns) do
			local value = row[col.alias]
			if value == nil then
				value = ''
			elseif type(value) == "table" then
				value = table.concat(value, '; ')
			else
				value = tostring(value)
			end
			table.insert(parts, ("|%s=%s"):format(col.label, value))
		end

		table.insert(parts, "}}")
		table.insert(output, table.concat(parts, ""))
	end

	return frame:preprocess(table.concat(output, delimiter))
end

local function parseColumns(columns_str)
	local columns = {}
	for col_raw in columns_str:gmatch("[^,]+") do
		local column, alias
		local col = col_raw:match("^%s*(.-)%s*$")

		local eq_pos = col:find("=")
		local as_pos, as_end = col:lower():find("%sas%s")

		if eq_pos then
			column = col:sub(1, eq_pos - 1):match("^%s*(.-)%s*$")
			alias = col:sub(eq_pos + 1):match("^%s*(.-)%s*$")
		elseif as_pos then
			column = col:sub(1, as_pos - 1):match("^%s*(.-)%s*$")
			alias = col:sub(as_end + 1):match("^%s*(.-)%s*$")
		else
			column = col
			alias = col
		end

		table.insert(columns, { column = column, alias = alias })
	end
	return columns
end

-- Convert column names to their alias
local function renameColumns(results, columns)
	for _, col in ipairs(columns) do
		if col.alias ~= col.column then
			for _, row in ipairs(results) do
				row[col.alias] = row[col.column]
				row[col.column] = nil
			end
		end
	end
end

local function applySplitColumns(results, columns, args)
	local split_specs = {}
	for _, col in ipairs(columns) do
		local val = args[col.alias .. '-split']
		if val ~= nil then
			local count
			if val == 'auto' then
				count = 'auto'
			elseif tonumber(val) and tonumber(val) >= 1 then
				count = tonumber(val)
			else
				error(string.format("Invalid %s-split value '%s': must be 'auto' or a positive integer", col.alias, val))
			end
			table.insert(split_specs, {alias=col.alias, count=count})
		end
	end

	if #split_specs == 0 then
		return
	end

	for _, spec in ipairs(split_specs) do
		-- resolve 'auto' counts: max table length across all rows
		if spec.count == 'auto' then
			local max_n = 0
			for _, row in ipairs(results) do
				local v = row[spec.alias]
				if type(v) == 'table' and #v > max_n then
					max_n = #v
				end
			end
			spec.count = max_n
		end
		-- create new columns based on count
		for i = 1, spec.count do
			local sub_alias = spec.alias .. i
			table.insert(columns, {
				alias=sub_alias,
				label=args[sub_alias .. '-label'] or sub_alias
			})
		end
	end

	for _, row in ipairs(results) do
		for _, spec in ipairs(split_specs) do
			local v = row[spec.alias]
			for i = 1, spec.count do
				local val
				if type(v) == 'table' then
					val = v[i]
				else
					val = (i == 1) and v
				end
				row[spec.alias .. i] = val or ""
			end
		end
	end
end

local function translateAliases(node, alias_to_column)
	if node.type == 'and' or node.type == 'or' then
		translateAliases(node.left, alias_to_column)
		translateAliases(node.right, alias_to_column)
	elseif node.type == 'not' then
		translateAliases(node.operand, alias_to_column)
	elseif node.type == 'comparison' or node.type == 'filter_op' then
		local original = alias_to_column[node.field]
		if original then
			node.field = original
		end
	end
end

local function parseOrderBy(order_by_str)
	local order_by = {}
	for col_raw in order_by_str:gmatch("[^,]+") do
		local col = mw.text.trim(col_raw)
		local column, direction
		local lower_col = col:lower()
		local space_pos = lower_col:find("%s+")

		if space_pos then
			column = mw.text.trim(col:sub(1, space_pos - 1))
			local dir = mw.text.trim(col:sub(space_pos + 1)):lower()
			if dir == "desc" then
				direction = "DESC"
			elseif dir == "asc" then
				direction = "ASC"
			else
				error(("Sort direction must be either ASC or DESC. %s provided."):format(dir))
			end
		else
			column = col
			direction = "ASC"
		end

		table.insert(order_by, { column = column, direction = direction })
	end
	return order_by
end

local function unescape(text)
	if not text:match("UNIQ") then
		return text
	end
	local unescaped = mw.text.unstripNoWiki(text)
	local text, count = string.gsub(unescaped, "&lt;", "<")
	text, count = string.gsub(text, "&gt;", ">")
	text, count = string.gsub(text, "<//nowiki>", "</nowiki>")
	return text
end

local function formatUserformat(frame, results, columns, args)
	local formatter = args['userformat']
	if not formatter then
		error("format=userformat expects an accompanying formatter")
	end
	formatter = unescape(formatter)
	local delimiter = getDelimiter(args)

	local output = {}
	for _, row in ipairs(results) do
		local formatted = formatter
		for _, col in ipairs(columns) do
			local value = row[col.alias]
			if value == nil then
				value = ''
			elseif type(value) == "table" then
				value = table.concat(value, '; ')
			else
				value = tostring(value)
			end
			local placeholder = "%%" .. col.label .. "%%"
			formatted = formatted:gsub(placeholder, function() return value end)
		end
		table.insert(output, formatted)
	end

	return frame:preprocess(table.concat(output, delimiter))
end

local function parseGroupBy(group_by_str)
	local group_by = {}
	for col_raw in group_by_str:gmatch("[^,]+") do
		local col = mw.text.trim(col_raw)
		table.insert(group_by, col)
	end
	return group_by
end

local function parseAggregateArg(aggregate_str, columns)
	local agg_specs = {}
	if not aggregate_str or aggregate_str:match('^%s*$') then
		return agg_specs
	end

	for spec_str in aggregate_str:gmatch('[^,]+') do
		spec_str = spec_str:match('^%s*(.-)%s*$')

		-- Check for AS alias
		local output_col, main_part
		local as_pos, as_end = spec_str:lower():find('%s+as%s+')
		if as_pos then
			main_part = spec_str:sub(1, as_pos - 1):match('^%s*(.-)%s*$')
			output_col = spec_str:sub(as_end + 1):match('^%s*(.-)%s*$')
		else
			main_part = spec_str
			output_col = nil
		end

		-- Check for FUNC(args) pattern
		local func_name, args_str = main_part:match('^(%w+)%s*%((.*)%)%s*$')
		if func_name then
			func_name = func_name:upper()
			local args = {}
			for arg in args_str:gmatch('%S+') do
				table.insert(args, arg)
			end

			if not output_col then
				output_col = args[1]
			end

			local is_new_col = true
			for _, col_info in ipairs(columns) do
				if col_info.alias == output_col then
					is_new_col = false
					break
				end
			end

			table.insert(agg_specs, {
				func = func_name,
				args = args,
				output_col = output_col,
				is_new_col = is_new_col
			})
		else
			-- Bare column name → TABLE
			local col_name = main_part:match('^%s*(.-)%s*$')
			if col_name ~= '' then
				if not output_col then
					output_col = col_name
				end
				local is_new_col = true
				for _, col_info in ipairs(columns) do
					if col_info.alias == output_col then
						is_new_col = false
						break
					end
				end
				table.insert(agg_specs, {
					func = 'TABLE',
					args = { col_name },
					output_col = output_col,
					is_new_col = is_new_col
				})
			end
		end
	end
	return agg_specs
end

local function aggCount(rows, column)
	return #rows
end

local function aggTable(rows, column)
	local result = {}
	for _, row in ipairs(rows) do
		local value = row[column]
		if value ~= nil then
			if type(value) == "table" then
				for _, v in ipairs(value) do
					table.insert(result, v)
				end
			else
				table.insert(result, value)
			end
		end
	end
	return result
end

local function aggMin(rows, column)
	local min_val = nil
	for _, row in ipairs(rows) do
		local v = tonumber(row[column]) or row[column]
		if min_val == nil or v < min_val then min_val = v end
	end
	return min_val
end

local function aggMax(rows, column)
	local max_val = nil
	for _, row in ipairs(rows) do
		local v = tonumber(row[column]) or row[column]
		if max_val == nil or v > max_val then max_val = v end
	end
	return max_val
end

local function aggAny(rows, column)
	return rows[1][column]
end

local function applyValueFormats(results, columns, args, frame)
	local formats_to_apply = {}

	local link_columns = { page_name = true, page_name_sub = true }

	local table_name = args[1]
	local data = mw.loadJsonData("Bucket:" .. table_name)
	for column, info in pairs(data) do
		if info['type'] == 'PAGE' then
			link_columns[column] = true
		end
	end

	for _, col in ipairs(columns) do
		local format_key = col.alias .. "-format"
		if args[format_key] or type(results[1][col.alias]) == "table" then
			local formatter = args[format_key] or (link_columns[col.column] and "[[%s]]" or "%s")
			local delimiter = args[col.alias .. "-delimiter"] or "; "
			delimiter = delimiter:gsub("\\n", "\n")

			table.insert(formats_to_apply, {
				column = col.alias,
				format = unescape(formatter),
				delimiter = delimiter
			})
		end
	end

	if #formats_to_apply == 0 then
		return results
	end

	for _, row in ipairs(results) do
		for _, fmt_info in ipairs(formats_to_apply) do
			local value = row[fmt_info.column]
			if value == nil then
				value = ''
			elseif type(value) == "table" then
				local formatted_values = {}
				for _, v in ipairs(value) do
					local formatted = fmt_info.format:gsub("%%s", function() return v or '' end)
					table.insert(formatted_values, formatted)
				end
				row[fmt_info.column] = table.concat(formatted_values, fmt_info.delimiter)
			else
				local formatted = fmt_info.format:gsub("%%s", function() return value end)
				row[fmt_info.column] = formatted
			end
		end
	end

	return results
end

local function buildGroups(results, group_by_cols)
	local groups = {}
	local group_order = {}
	for _, row in ipairs(results) do
		local key_parts = {}
		for _, col in ipairs(group_by_cols) do
			local value = row[col]
			if type(value) == 'table' then
				table.insert(key_parts, table.concat(value, '\0'))
			elseif value == nil then
				table.insert(key_parts, '\0')
			else
				table.insert(key_parts, tostring(value))
			end
		end
		local key = table.concat(key_parts, '\1')
		if not groups[key] then
			groups[key] = {}
			table.insert(group_order, key)
		end
		table.insert(groups[key], row)
	end
	return groups, group_order
end

local function applyAggregation(group_rows, agg_specs, new_row)
	local format_specs = {}
	for _, spec in ipairs(agg_specs) do
		if spec.func == 'FORMAT' then
			table.insert(format_specs, spec)
		elseif spec.func == 'COUNT' then
			new_row[spec.output_col] = aggCount(group_rows, spec.args[1])
		elseif spec.func == 'TABLE' then
			new_row[spec.output_col] = aggTable(group_rows, spec.args[1])
		elseif spec.func == 'MIN' then
			new_row[spec.output_col] = aggMin(group_rows, spec.args[1])
		elseif spec.func == 'MAX' then
			new_row[spec.output_col] = aggMax(group_rows, spec.args[1])
		elseif spec.func == 'ANY' then
			new_row[spec.output_col] = aggAny(group_rows, spec.args[1])
		end
	end
	return format_specs
end

local function applyFormatSpec(new_row, spec, fmt_template)
	local array_len = nil
	for _, arg_col in ipairs(spec.args) do
		if type(new_row[arg_col]) == 'table' then
			array_len = #new_row[arg_col]
			break
		end
	end

	if array_len then
		local results = {}
		for i = 1, array_len do
			local result_str = fmt_template
			for _, arg_col in ipairs(spec.args) do
				local val = new_row[arg_col]
				local sv
				if type(val) == 'table' then
					sv = tostring(val[i] ~= nil and val[i] or '')
				elseif val == nil then
					sv = ''
				else
					sv = tostring(val)
				end
				result_str = result_str:gsub('%%' .. arg_col .. '%%', function() return sv end)
			end
			table.insert(results, result_str)
		end
		new_row[spec.output_col] = results
	else
		local result_str = fmt_template
		for _, arg_col in ipairs(spec.args) do
			local val = new_row[arg_col]
			result_str = result_str:gsub('%%' .. arg_col .. '%%',
				function() return val == nil and '' or tostring(val) end)
		end
		new_row[spec.output_col] = result_str
	end
end

local function groupResults(results, group_by_cols, agg_specs, columns, group_sort, args)
	if #group_by_cols == 0 then
		return results
	end

	local group_by_set = {}
	for _, col in ipairs(group_by_cols) do
		group_by_set[col] = true
	end

	local covered = {}
	for _, spec in ipairs(agg_specs) do
		covered[spec.output_col] = true
	end

	local groups, group_order = buildGroups(results, group_by_cols)

	local grouped_results = {}
	for _, key in ipairs(group_order) do
		local group_rows = groups[key]
		if group_sort then
			sortResults(group_rows, group_sort)
		end

		local new_row = {}
		for _, col in ipairs(group_by_cols) do
			new_row[col] = group_rows[1][col]
		end

		local format_specs = applyAggregation(group_rows, agg_specs, new_row)

		for _, col_info in ipairs(columns) do
			local col_name = col_info.alias
			if not group_by_set[col_name] and not covered[col_name] then
				new_row[col_name] = aggAny(group_rows, col_name)
			end
		end

		for _, spec in ipairs(format_specs) do
			local fmt_template = args[spec.output_col .. '-agg']
			if fmt_template then
				applyFormatSpec(new_row, spec, unescape(fmt_template))
			end
		end

		table.insert(grouped_results, new_row)
	end
	return grouped_results
end

local T = { PARENTHESIS_L = 1, PARENTHESIS_R = 2, AND = 3, OR = 4, NOT = 5, COMP = 7, STR = 8, NUM = 9, BOOL = 10, ID = 11, EOF = 12 }
local KW = {
	['AND'] = T.AND,
	['OR'] = T.OR,
	['NOT'] = T.NOT,
	['true'] = T.BOOL,
	['false'] = T.BOOL
}
local FILTER_OPS = { CONTAINS = true, ICONTAINS = true, MATCH = true }

local function parseJoins(join_str)
	local joins = {}
	for join_part in join_str:gmatch("[^,]+") do
		local join = {}
		local parts = {}
		for part in join_part:gmatch("[^=]+") do
			table.insert(parts, mw.text.trim(part))
		end
		if #parts == 2 then
			join.left = parts[1]
			join.right = parts[2]
			table.insert(joins, join)
		end
	end
	return joins
end

local function tokenize(s)
	local t, i = {}, 1
	while i <= #s do
		local c = s:sub(i, i)
		if c:match('%s') then
			i = i + 1
		elseif c == '(' then
			table.insert(t, { type = T.PARENTHESIS_L }); i = i + 1
		elseif c == ')' then
			table.insert(t, { type = T.PARENTHESIS_R }); i = i + 1
		elseif c:match('%d') or c == '.' then
			local n = s:match('^%-?%d*%.?%d+', i)
			table.insert(t, { type = T.NUM, val = tonumber(n) })
			i = i + #n
		elseif c:match("[%w_]") then
			local w = s:match('^[%w_.]+', i)
			table.insert(t, { type = KW[w:upper()] or KW[w] or T.ID, val = w })
			i = i + #w
		elseif c:match('["\']') then
			local q, str = c, ''
			for j = i + 1, #s do
				local ch = s:sub(j, j)
				if ch == q then
					table.insert(t, { type = T.STR, val = str }); i = j + 1; break
				end
				str = str .. ch
			end
		elseif c:match('%d') or c == '.' then
			local n = s:match('^%-?%d*%.?%d+', i)
			table.insert(t, { type = T.NUM, val = tonumber(n) })
			i = i + #n
		elseif c:match('[=<>!]') then
			local op = s:match('[=<>!]+', i)
			if not op then
				error("Invalid operator at position " .. i)
			end
			table.insert(t, { type = T.COMP, val = op })
			i = i + #op
		else
			error("Unexpected character '" .. c .. "' at position " .. i)
		end
	end
	return t
end

-- Break out of the dependency loop
local parsePrimary

local function parseNotExpr(toks, pos)
	if toks[pos] and toks[pos].type == T.NOT then
		local node, new_pos = parseNotExpr(toks, pos + 1)
		return { type = 'not', operand = node }, new_pos
	else
		return parsePrimary(toks, pos)
	end
end

local function parseAndExpr(toks, pos)
	local left, new_pos = parseNotExpr(toks, pos)
	while new_pos <= #toks and toks[new_pos].type == T.AND do
		local right, next_pos = parseNotExpr(toks, new_pos + 1)
		left = { type = 'and', left = left, right = right }
		new_pos = next_pos
	end
	return left, new_pos
end

local function parseExpression(toks, pos)
	local left, new_pos = parseAndExpr(toks, pos)
	while new_pos <= #toks and toks[new_pos].type == T.OR do
		local right, next_pos = parseAndExpr(toks, new_pos + 1)
		left = { type = 'or', left = left, right = right }
		new_pos = next_pos
	end
	return left, new_pos
end

parsePrimary = function(toks, pos)
	if toks[pos].type == T.PARENTHESIS_L then
		local node, new_pos = parseExpression(toks, pos + 1)
		if toks[new_pos].type ~= T.PARENTHESIS_R then
			error("Expected ')' at position " .. new_pos)
		end
		return node, new_pos + 1
	elseif toks[pos].type == T.ID then
		local op_tok = toks[pos + 1]
		if op_tok and op_tok.type == T.ID and FILTER_OPS[op_tok.val:upper()] then
			local v = toks[pos + 2]
			if not v or (v.type ~= T.STR and v.type ~= T.NUM and v.type ~= T.BOOL and v.type ~= T.ID) then
				error("Expected value after filter operator at position " .. (pos + 2))
			end
			local value = (v.type == T.NUM) and v.val or tostring(v.val)
			return { type = 'filter_op', field = toks[pos].val, op = op_tok.val:upper(), value = value }, pos + 3
		elseif op_tok and op_tok.type == T.COMP then
			local v = toks[pos + 2]
			if v.type ~= T.STR and v.type ~= T.NUM and v.type ~= T.BOOL then
				error("Expected value after comparison operator at position " .. (pos + 2))
			end
			return { type = 'comparison', field = toks[pos].val, op = op_tok.val, value = v.val }, pos + 3
		else
			error("Expected comparison or filter operator after identifier at position " .. (pos + 1))
		end
	else
		error("Unexpected token at position " .. pos .. ", expected identifier or '('")
	end
end

local function parseCond(toks, pos)
	local node, new_pos = parseExpression(toks, pos)
	return node, new_pos
end

local function toBucket(n)
	if n.type == 'and' then
		return Bucket.And(toBucket(n.left), toBucket(n.right))
	elseif n.type == 'or' then
		return Bucket.Or(toBucket(n.left), toBucket(n.right))
	elseif n.type == 'not' then
		return Bucket.Not(toBucket(n.operand))
	elseif n.type == 'comparison' then
		return { n.field, n.op, n.value }
	end
end

local FILTER_FUNCS = {
	CONTAINS  = function(v, s) return type(v) == 'string' and mw.ustring.find(v, s, 1, true) ~= nil end,
	ICONTAINS = function(v, s)
		return
			type(v) == 'string' and
			mw.ustring.find(mw.ustring.lower(v), mw.ustring.lower(s), 1, true) ~= nil
	end,
	MATCH     = function(v, s) return type(v) == 'string' and mw.ustring.match(v, s) ~= nil end,
}

local COMP_FUNCS = {
	['=']  = function(a, b) return a == b end,
	['!='] = function(a, b) return a ~= b end,
	['<']  = function(a, b) return compareValues(a, b) == -1 end,
	['>']  = function(a, b) return compareValues(a, b) == 1 end,
	['<='] = function(a, b) return compareValues(a, b) <= 0 end,
	['>='] = function(a, b) return compareValues(a, b) >= 0 end,
}

local function evalFilter(node, row)
	if node.type == 'and' then
		return evalFilter(node.left, row) and evalFilter(node.right, row)
	elseif node.type == 'or' then
		return evalFilter(node.left, row) or evalFilter(node.right, row)
	elseif node.type == 'not' then
		return not evalFilter(node.operand, row)
	elseif node.type == 'filter_op' then
		local fn = FILTER_FUNCS[node.op]
		if not fn then error('Unknown filter op: ' .. node.op) end
		return fn(row[node.field], node.value)
	elseif node.type == 'comparison' then
		local fn = COMP_FUNCS[node.op]
		if not fn then error('Unknown comparison op: ' .. node.op) end
		return fn(row[node.field], node.value)
	end
end

local function applyFilter(results, ast)
	local filtered = {}
	for _, row in ipairs(results) do
		if evalFilter(ast, row) then
			table.insert(filtered, row)
		end
	end
	return filtered
end

local function runQuery(columns, args)
	local bucket_name = mw.text.trim(args[1] or args['bucket'] or '')
	if bucket_name == '' then
		error('Must specify the name of the bucket')
	end

	for _, col in ipairs(columns) do
		col.label = args[col.alias .. '-label'] or col.alias
	end

	local all_originals = {}
	for _, col in ipairs(columns) do
		all_originals[col.column] = true
	end
	local alias_to_column = {}
	for _, col in ipairs(columns) do
		if col.alias ~= col.column and not all_originals[col.alias] then
			alias_to_column[col.alias] = col.column
		end
	end

	local column_names = {}
	for _, col in ipairs(columns) do
		table.insert(column_names, col.column)
	end
	local query = mw.bucket(bucket_name).select(unpack(column_names))

	local join_str = args['join on'] or args['join']
	if join_str then
		local joins = parseJoins(join_str)
		for _, join in ipairs(joins) do
			join.left = alias_to_column[join.left] or join.left
			join.right = alias_to_column[join.right] or join.right
			local right_table = join.right:match("^[^.]+") or join.right
			query = query.join(right_table, join.left, join.right)
		end
	end

	local where_str = args['where']
	if where_str then
		local toks = tokenize(where_str)
		local ast = parseCond(toks, 1)
		translateAliases(ast, alias_to_column)
		query = query.where(toBucket(ast))
	end

	local limit = tonumber(args['limit'])
	if limit ~= nil then
		query = query.limit(limit)
	end

	local offset = tonumber(args['offset'])
	if offset ~= nil then
		query = query.offset(offset)
	end

	return query:run()
end

function p.get(frame)
	local args = getArgs(frame)
	local columns_str = args['select'] or args['fields']
	if not columns_str then
		error("Must specify which columns to select.")
	end

	local columns = parseColumns(columns_str)

	local results = runQuery(columns, args)
	-- mw.logObject(results)
	renameColumns(results, columns)

	local filter_str = args['filter']
	if filter_str then
		local toks = tokenize(filter_str)
		local ast = parseCond(toks, 1)
		results = applyFilter(results, ast)
	end

	if #results == 0 then
		return args['default'] or "No result"
	end

	local group_by_str = args['group by']
	if group_by_str then
		local group_by_cols = parseGroupBy(group_by_str)
		local agg_specs = parseAggregateArg(args['aggregate'] or '', columns)
		for _, spec in ipairs(agg_specs) do
			if spec.is_new_col then
				table.insert(
					columns,
					{
						column = spec.output_col,
						alias = spec.output_col,
						label = args[spec.output_col .. '-label'] or spec.output_col
					}
				)
			end
		end
		local group_sort = parseOrderBy(args['group-sort'] or '')
		results = groupResults(results, group_by_cols, agg_specs, columns, group_sort, args)
	end

	applySplitColumns(results, columns, args)

	local order_by_str = args['order by']
	if order_by_str then
		local order_by_rules = parseOrderBy(order_by_str)
		sortResults(results, order_by_rules)
	end

	-- FIXME: this inserts markup that may need to be preprocessed, but for performance reasons
	-- we don't want to preprocess them row-by-row.
	applyValueFormats(results, columns, args, frame)

	local format = args['format'] or "table"
	local intro = args['intro'] or ""
	local outro = args['outro'] or ""
	local text = ""

	if format == "table" then
		text = formatTable(frame, results, columns, args)
	elseif format == "template" then
		text = formatTemplate(frame, results, columns, args)
	elseif format == "userformat" then
		text = formatUserformat(frame, results, columns, args)
	else
		error(string.format("Invalid format %s specified.", format))
	end

	return intro .. text .. outro
end

-- Exports for testing
p.sortResults = sortResults
p.aggCount = aggCount
p.aggTable = aggTable
p.groupResults = groupResults
p.parseAggregateArg = parseAggregateArg
p.T = T
p.tokenize = tokenize
p.parseCond = parseCond
p.applyFilter = applyFilter
p.renameColumns = renameColumns
p.applySplitColumns = applySplitColumns
p.translateAliases = translateAliases

return p