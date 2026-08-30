local p = {}
local getArgs = require('Module:Arguments').getArgs
local yesno = require('Module:Yesno')
local lang = mw.language.getContentLanguage()

local O_TYPE = "type"
local O_DELIM = "delimiter"
local O_REQUIRED = "required"
local OPTIONS = { O_TYPE, O_DELIM, O_REQUIRED }

local O_ALIASES = {
	delim = 'delimiter',
	notnull = 'required',
}

local C_TARGS = "templateargs"
local C_SUB = "sub"
local C_NOSAVE = "nosave"
local C_LOG = "log"
local CONF_VALS = { C_TARGS, C_SUB, C_NOSAVE, C_LOG }

---Is `value` one of the `targets`?
---@param value string Type you want to check is in list.
---@param targets string[] List of targets that `value` could be.
---@return boolean
local function oneof(value, targets)
	for _, target in ipairs(targets) do
		if value == target then
			return true
		end
	end
	return false
end

---Parse a single value based on type name
---@param t string Type name
---@param v string Value to parse
---@return boolean success Did parsing succeed?
---@return any value Parsed value if success, string if fail.
function p.parse_typed_value(t, v)
	-- probably should return an object instead
	if oneof(t, { "text" }) then
		-- possible TODO with page
		return true, v
	end

	if oneof(t, { "int", "integer" }) then
		local val = tonumber(v)
		if val ~= nil and val % 1 == 0 then
			return true, val
		else
			return false, "integer"
		end
	end

	if oneof(t, { "float", "double", "num", "number" }) then
		local val = tonumber(v)
		if val ~= nil then
			return true, val
		else
			return false, "number"
		end
	end

	if oneof(t, { "bool", "boolean", "yesno" }) then
		local val = yesno(v)
		if val ~= nil then
			return true, val
		else
			return false, "boolean"
		end
	end

	if oneof(t, { "date", "time", "datetime", "timestamp" }) then
		local s, r = pcall(lang.formatDate, lang, "c", v)
		if s then
			return s, r
		else
			return false, "timestamp"
		end
	end

	if oneof(t, { "unixtime" }) then
		local s, r = pcall(lang.formatDate, lang, "U", v)
		if s then
			r = tonumber(r)
				or error("Could not convert " .. r .. " to a number")
			return s, r
		else
			return false, "Unix timestamp"
		end
	end

	error("Unsupported type: " .. mw.dumpObject(t))
end

---Recursively and safely add items of `keylist` to `args`.
---
---`add_to_args({}, { "a", "b", "c" }, "d")`
---will yield
---`{ a = { b = { c = "d" } } }`
---@param args table
---@param keylist (string | number)[]
---@param value any
local function add_to_args(args, keylist, value)
	local nextvalue = args
	for i, valuename in ipairs(keylist) do
		if i == #keylist then
			nextvalue[valuename] = value
		else
			nextvalue[valuename] = nextvalue[valuename] or {}
			nextvalue = nextvalue[valuename]
		end
	end
end

---Parse specific key-value combination and modify output table.
---@param out_args table
---@param out_config table
---@param key string
---@param value string
---@return nil
function p.parse_args(out_args, out_config, key, value)
	if type(key) ~= "string" then
		return
	end
	value = mw.text.trim(value)
	if value == '' then
		return
	end
	-- basic conditions for parser working

	local optkey, optname = key:match("^([%w_]+)%-(.+)$")
	-- [%w_] matches all valid bucket field names at time of writing
	-- (non-exhaustively, i.e. all valid names are matched by [%w_], but [%w_]
	-- also matches some invalid names)
	if optkey and optname then
		if O_ALIASES[optname] then
			optname = O_ALIASES[optname]
		end
		if not oneof(optname, OPTIONS) then
			local fmt = "Invalid option %s for parameter %s"
			error(fmt:format(optname, optkey))
		end
		return add_to_args(out_args, { optkey, optname }, value)
	end

	local ckey = key:match("^%+(.+)$")
	if ckey then
		if not oneof(ckey, CONF_VALS) then
			error(ckey .. " not a recognised config option")
		end
		out_config[ckey] = value
		-- modify out_config rather than out_args
		return
	end

	return add_to_args(out_args, { key, 1 }, value)
	-- none of the above apply so treat as raw arg
end

---Turn parsed argument object to single value to send to `mw.bucket.put`.
---@param argname string
---@param data table
---@return any
function p.get_bucket_arg(argname, data)
	local item = data[1]
	if not item then
		if not yesno(data[O_REQUIRED]) then
			return
		end
		error(("Required argument %s was not given"):format(argname))
	end
	item = mw.text.trim(item)
	local type = data[O_TYPE] or "text"

	if not data[O_DELIM] then
		local success, value_or_typename = p.parse_typed_value(type, item)
		if success then
			return value_or_typename
			-- value
		else
			local fmt = "Invalid %s given for parameter %s: %s"
			error(fmt:format(value_or_typename, mw.dumpObject(argname), mw.dumpObject(item)))
			-- typename
		end
	end

	local delim = data[O_DELIM]
	delim = delim:gsub('%f[\\]\\n', '\n')
	delim = delim:gsub('\\\\n', '\\n')
	--[[
		removes a backslash from start, so:
		\n -> newline
		\\n -> \n
		\\\n -> \\n
		etc.
	]]

	local items = {}
	for entry in mw.text.gsplit(item, delim) do
		entry = mw.text.trim(entry)
		if entry ~= "" then
			local success, value_or_typename = p.parse_typed_value(type, entry)
			if success then
				table.insert(items, value_or_typename)
				-- value
			else
				local fmt = "Invalid %s given for parameter %s: %s"
				error(fmt:format(value_or_typename, mw.dumpObject(argname), mw.dumpObject(entry)))
				-- typename
			end
		end
	end

	return items
end

---Turn list of parsed arguments into `mw.bucket.put` arg table.
---@param out_args table
---@return table
function p.get_bucket_args(out_args)
	local bucket_args = {}
	for arg, data in pairs(out_args) do
		bucket_args[arg] = p.get_bucket_arg(arg, data)
	end
	return bucket_args
end

---Main invokable function.
---@param frame any
function p.put(frame)
	local args = getArgs(frame, { frameOnly = true })
	local parent_args = getArgs(frame, { parentOnly = true })
	local bucket_name = mw.text.trim(args[1] or '')

	-- Replicate the behavior of $wgCargoStoreUseTemplateArgsFallback for specified arguments
	local implicit_store_args = mw.text.trim(args['+' .. C_TARGS] or '')
	for arg in implicit_store_args:gmatch("[^,]+") do
		arg = mw.text.trim(arg)
		args[arg] = parent_args[arg]
	end

	-- Convert all arguments to consistent format
	local out_args = {}
	local out_config = {}
	for k, v in pairs(args) do
		p.parse_args(out_args, out_config, k, v)
	end

	local bucket_args = p.get_bucket_args(out_args)

	if yesno(out_config[C_LOG]) then
		mw.log("Passed args: " .. mw.dumpObject(args))
		mw.log("out_args: " .. mw.dumpObject(out_args))
		mw.log("out_config: " .. mw.dumpObject(out_config))
		mw.log("bucket_args: " .. mw.dumpObject(bucket_args))
	end

	-- put changes to bucket
	if not yesno(out_config[C_NOSAVE]) then
		local bucket = mw.bucket(bucket_name)
		if out_config[C_SUB] then
			bucket.sub(out_config[C_SUB])
		end
		bucket.put(bucket_args)
	end
end

return p

--[[
p.put({
	"character",
	name = "Buck",
	["name-required"] = "true",
	hp = "1000",
	["hp-type"] = "int",
	attack = "50",
	["attack-type"] = "int",
	type = "\nGreen;\n;\nBlue;\n",
	["type-delim"] = ";\\n",
	rarity = "well-done",
	is_obtainable = "yes",
	["is_obtainable-type"] = "bool",
	["+sub"] = "random",
	["+nosave"] = "true",
	["+log"] = "true",
})

Should have:
<pre>
bucket_args: table#1 {
    ["attack"] = 50,
    ["hp"] = 1000,
    ["is_obtainable"] = true,
    ["name"] = "Buck",
    ["rarity"] = "well-done",
    ["type"] = table#2 {
        "Green",
        "Blue;",
    },
}
</pre>

p.put({
	"test1",
	precise = "5.78;4;51.2;43.21",
	["precise-delimiter"] = ";",
	["precise-type"] = "float",
	intager = "32",
	["intager-type"] = "int",
	["+nosave"] = "true",
	["+log"] = "true",
})

Should have:
<pre>
bucket_args: table#1 {
    ["intager"] = 32,
    ["precise"] = table#2 {
        5.78,
        4,
        51.2,
        43.21,
    },
}
</pre>

p.put({
	"banners",
	id = "1",
	["id-type"] = "int",
	server = "JP",
	name_jp = "拝啓、はじまりの季節へ",
	name_en = nil,
	image = "Starter_Banner.png",
	-- do page here?
	rateup_character = "Hoshino,Shiroko",
	["rateup_character-delimiter"] = ",",
	limited = "no",
	["limited-type"] = "bool",
	start_date = "2021-02-04T12:00+09",
	["start_date-type"] = "time",
	end_date = "2021-02-11T12:00+09",
	["end_date-type"] = "unixtime",
	["+nosave"] = "true",
	["+log"] = "true",
})

Should have:
<pre>
bucket_args: table#1 {
    ["end_date"] = 1613012400,
    ["id"] = 1,
    ["image"] = "Starter_Banner.png",
    ["limited"] = false,
    ["name_jp"] = "拝啓、はじまりの季節へ",
    ["rateup_character"] = table#2 {
        "Hoshino",
        "Shiroko",
    },
    ["server"] = "JP",
    ["start_date"] = "2021-02-04T03:00:00+00:00",
}
</pre>
]]