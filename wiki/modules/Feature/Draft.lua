--- Miscellaneous useful functions.
local lib = {}

local util = require('libraryUtil')
local checkType = util.checkType
local checkTypeMulti = util.checkTypeMulti
local NIL_OK = true

--- Choose one of two values to return.
--  @param {boolean} cond Determines which value to return.
--  @param T The value to return if `cond` is true (or truthy).
--  @param F The value to return if `cond` is false (or falsey).
function lib.ternary(cond, T, F)
    if cond then
        return T
    end

    return F
end

--- Some functions from `mw.text` are slow or may not always work as intended.
--  This group of functions provides better alternatives for them.
--  @section `mw.text` replacements

--- 
--  Removes ASCII whitespace from the start and end of `text`.
--  Slightly more efficient than the `mw.text` implementation.
--  @see https://help.fandom.com/wiki/Extension:Scribunto#mw.text.trim_is_slow
--  @param {string} text The text to trim.
--  @return {string} The trimmed text.
function lib.trim(text)
	return (text:gsub( '^[\t\r\n\f ]+', '' ):gsub( '[\t\r\n\f ]+$', '' ))
	-- the "extra" parentheses are important for removing the second value returned from `gsub`
end


--- Returns an iterator over substrings that would be returned by @{lib.split}.
--  @see @{lib.split} for argument documentation.
--  @return {function} Iterator over substrings of `text` separated by `delim`.
function lib.gsplit(text, delim, opt)
	checkType('Feature.gsplit', 1, text, 'string')
	checkType('Feature.gsplit', 2, delim, 'string', NIL_OK)
	checkType('Feature.gsplit', 3, opt, 'table', NIL_OK)
	if delim == nil then delim = " " end
	if opt == nil then opt = {} end
	-- the mediawiki implementation uses ustring, which is slower than string
	-- and also not necessary if delim isn't a pattern.
	-- https://help.fandom.com/wiki/Extension:Scribunto#mw.text.split_is_very_slow
	
	-- local g = mw.text.gsplit(text, delim, true)
	-- local function f()
	-- 	local value = g()
	-- 	if value and not opt.noTrim then -- value is nil when the generator ends
	-- 		value = mw.text.trim(value)
	-- 	end
	-- 	if value == "" and opt.removeEmpty then
	-- 		return f()
	-- 	end
	-- 	return value
	-- end
	-- return f, nil, nil
	
	-- based on https://github.com/wikimedia/mediawiki-extensions-Scribunto/blob/1eecdac6def6418fb36829cc2f20b464c30e4b37/includes/Engines/LuaCommon/lualib/mw.text.lua#L222
	local s, l = 1, #text
	local function f()
		if s then
			local e, n = string.find( text, delim, s, true )
			local ret
			if not e then
				ret = string.sub( text, s )
				s = nil
			elseif n < e then
				-- Empty separator!
				ret = string.sub( text, s, e )
				if e < l then
					s = e + 1
				else
					s = nil
				end
			else
				ret = e > s and string.sub( text, s, e - 1 ) or ''
				s = n + 1
			end
			
			if not opt.noTrim then
				ret = lib.trim(ret)
			end
			if ret == '' and opt.removeEmpty then
				return f()
			end
			return ret
		end
	end
	return f, nil, nil
end

--- Returns a table containing the substrings of `text` that are separated by `delim`.
--  (Compared to @{mw.text.split}, this function always treats `delim` as a literal
--  string rather than a pattern, and it trims output substrings using @{lib.trim} by default.)
--  @param       {string} text The string to split.
--  @param[opt]  {string} delim The delimiter string to use when splitting `text`.
--                 (Using an empty string will split `text` into individual characters.)
--  @param[opt]  {table} opt Extra options:
--  @param[opt]  {boolean} opt.noTrim Set true to disable trimming of generated substrings
--                  using @{lib.trim}.
--  @param[opt]  {boolean} opt.removeEmpty Set true to omit empty substrings
--                  (i.e., when multiple `delim` appear consecutively, or when
--                  `delim` appears at the start or end of `text`).
--  @return {table} Substrings of `text separated by `delim`.
function lib.split(text, delim, opt)
	checkType('Feature.split', 1, text, 'string')
	checkType('Feature.split', 2, delim, 'string', NIL_OK)
	checkType('Feature.split', 3, opt, 'table', NIL_OK)
	local output = {}
	for item in lib.gsplit(text, delim, opt) do
		table.insert(output, item)
	end
	return output
end

--- A wrapper around @{mw.text.unstripNoWiki} that un-escapes
--  characters/sequences that <nowiki> escapes.
--  @see https://github.com/wikimedia/mediawiki/blob/c22d01f23b7fe754ef106e97bae32c3966f8db3e/includes/parser/CoreTagHooks.php#L146
--             for MediaWiki source code for <nowiki>
function lib.unstripNoWiki(str)
	return (mw.text.unstripNoWiki(str)
		:gsub('&lt;', '<'):gsub('&gt;', '>')
		:gsub('-&#123;', '-{'):gsub('&#125;-', '}-'))
	-- the "extra" parentheses are important for removing the second value returned from `gsub`
end

--- @section end

--- Returns an iterator over `tbl` that outputs items in the order defined by `order`.
--  @param      {table} tbl The table to iterate over.
--  @param[opt] {table|function} order The iteration order.
-- 
--                Can be specified either as an ordered list (table) of keys from `tbl`
--                or as an ordering function that accepts `tbl`, `keyA`, and `keyB`
--                and returns true when the entry in `tbl` associated wity `keyA`
--                should come before the one for `keyB`.
--
--                If not specified, the keys' natural ordering is used
--                (i.e., `function(tbl, a, b) return a < b end`).
--  @return {function} The iterator.
function lib.spairs(tbl, order)
	checkType('Feature.spairs', 1, tbl, 'table')
	checkTypeMulti('Feature.spairs', 2, order, {'table', 'function', 'nil'})
	local keys
	if type(order) == "table" then
		keys = order
	else
	    -- collect the keys
		keys = {}
		for k in pairs(tbl) do table.insert(keys, k) end
		
		-- sort the keys (using order function if given)
		if order then
		    table.sort(keys, function(a, b) return order(tbl, a, b) end)
		else
		    table.sort(keys)
		end
    end

    -- return the iterator function
	local i = 0
	return function()
		i = i + 1
		local key = keys[i]
		return key, tbl[key]
	end
end

--[[
	Parses Phantom Template Format strings into a list of maps.
	@param       {string} input A string formed by concatenating the output of Phantom Templates.
		Usually, this string is generated by DPL.
	@param[opt]  {string} key_separator Separator between the entries (key-value pairs) of items in `input`. Defaults to ';'.
	@param[opt]  {string} end_separator Separator between items in `input`. Defaults to '$'.
	@param[opt]  {string} equal_separator Separator between the key and value of each entry in `input`. Defaults to '='.
	@return      {table} A list of items from `input`; each value is a map of the item's entries.
--]]
function lib.parseTemplateFormat (inputStr, key_separator, end_separator, equal_separator)
	if key_separator == nil then key_separator = ";" end
	if end_separator == nil then end_separator = "$" end
	if equal_separator == nil then equal_separator = "=" end
	
	local arg_format = "^%s*(.-)%s*" .. equal_separator .. "%s*(.-)%s*$"
	
	local resultTable = {}
	for str in lib.gsplit(inputStr, end_separator, {noTrim=true, removeEmpty=true}) do
		local result = {}
		for param in lib.gsplit(str, key_separator) do
			local arg, val = param:match(arg_format)
			if arg then
				result[arg] = val
			else
				-- skip, i guess
				-- mw.log("Warning: Lua module found extra " .. key_separator .. " or " .. end_separator .. " separators in DPL output.")
			end
		end
		table.insert(resultTable, result)
	end
	return resultTable
end

--[=[
	Parses Phantom Template Format strings into a list of ordered maps.
	@param       {string} input A string formed by concatenating the output of Phantom Templates.
		Usually, this string is generated by DPL.
	@param[opt]  {string} key_separator Separator between the entries (key-value pairs) of items in `input`. Defaults to ';'.
	@param[opt]  {string} end_separator Separator between items in `input`. Defaults to '$'.
	@param[opt]  {string} equal_separator Separator between the key and value of each entry in `input`. Defaults to '='.
	@return[name=output] {table} A list of items from `input`; each value is a list of the item's entries.
	@return[name=output[i]] {table} The i-th item of `input`.
	@return[name=output[i].page] {string} The value of the `page` key for this item.
	@return[name=output[i][j]] {table} The j-th key-value pair of this item.
	@return[name=output[i][j].key] {string} The j-th key of this item.
	@return[name=output[i][j].value] The j-th value of this item.
--]=]
function lib.parseTemplateFormatOrdered (inputStr, key_separator, end_separator, equal_separator)
	if key_separator == nil then key_separator = ";" end
	if end_separator == nil then end_separator = "$" end
	if equal_separator == nil then equal_separator = "=" end
	
	local arg_format = "^%s*(.-)%s*" .. equal_separator .. "%s*(.-)%s*$"
		
	local resultTable = {}
	for str in lib.gsplit(inputStr, end_separator, {noTrim=true, removeEmpty=true}) do
		local result = {}
		for param in lib.gsplit(str, key_separator) do
			local arg, val = param:match(arg_format)
			if arg == 'page' then
				result['page'] = val
			else
				table.insert(result,{
					key = arg,
					value = val
				})
			end
		end
		table.insert(resultTable, result)
	end
	return resultTable
end

-- searches ordered table and returns value
function lib.orderedTableSearch(tbl, search)
    for i, obj in ipairs(tbl) do
        if obj.key == search then
            return obj.value
        end
    end
    return false
end

--- Add thousands separator to number `n`.
--  @param {number|frame} n If a frame is given, then its first argument (`frame.args[1]`) will be used as input instead.
--  @return {string} The number formatted with commas for thousands separators.
--  @see https://stackoverflow.com/questions/10989788/format-integer-in-lua/10992898#10992898
function lib.thousandsSeparator(n)
	if (n == mw.getCurrentFrame()) then
		n = n.args[1]
	elseif (type(n) == "table") then
		n = n[1]
	end
	
	local i, j, minus, int, fraction = tostring(n):find('([-]?)(%d+)([.]?%d*)')

	-- reverse the int-string and append a comma to all blocks of 3 digits
	int = int:reverse():gsub("(%d%d%d)", "%1,")
	
	-- reverse the int-string back remove an optional comma and put the optional minus and fractional part back
	return minus .. int:reverse():gsub("^,", "") .. fraction
end


--- @return {boolean} true iff string or table is empty
--  @note May not be correct for tables with metatables.
function lib.isEmpty(item)
	if item == nil or item == "" then
		return true
	end
	if type(item) == "table" then
		return next(item) == nil
	end
	return false
end

--- @return {boolean} true iff string or table is not empty
--  @note May not be correct for tables with metatables.
function lib.isNotEmpty(item)
	return not lib.isEmpty(item)
end

--- @return nil if string or table is empty, otherwise return the value.
function lib.nilIfEmpty(item)
	if lib.isEmpty(item) then
		return nil
	else
		return item
	end
end

---
-- @param {table} t A table of items
-- @param elm The item to search for
-- @returns true if `elm` is a value in `t`; false otherwise. (Does not check keys of `t`.)
-- @see http://stackoverflow.com/q/2282444
-- @see another implementation: Dev:TableTools.includes()
function lib.inArray(t, elm)
    for _, v in pairs(t) do
        if v == elm then
            return true
        end
    end
    return false
end

return lib