-- <pre>
--------------------------------------------------------------------------------
-- Allows wikis to locally override `/config` subpages of modules.
--
-- @script config
-- @alias p
-- @release experimental
-- @require [[Module:No globals]]
-- @require [[Module:TableTools]]
-- @author [[User:ExE Boss]]
-- @see [[Module:I18n]] - Inspired the way in which the @{Config} class works.
--------------------------------------------------------------------------------

local libraryUtil = require('libraryUtil');
local checkType = libraryUtil.checkType;
local checkTypeMulti = libraryUtil.checkTypeMulti;
local checkTypeForNamedArg = libraryUtil.checkTypeForNamedArg;

local tableTools = require('Module:TableTools');

-- Module constants
local DEV_WIKI = 'https://utaite.miraheze.org';

local p = {};

--[[
-- @function p._substArgsInMsg
-- @param {string} msg
-- @param {table} args
--]]
local function substArgsInMsg(msg, args)
	checkType('substArgsInMsg', 1, msg, 'string');
	checkType('substArgsInMsg', 2, args, 'table');

	for i, value in tableTools.sparseIpairs(args) do
		msg = string.gsub(msg, '%$' .. tostring(i), tostring(value));
	end
	return msg;
end
p._substArgsInMsg = substArgsInMsg;

--[[
-- Configuration datastore class
-- @type Config
--]]
local Config = {};
Config.__index = Config;

--[[
-- Datastore option getter.
--
-- This method returns values from the datastore corresponding to a `key`.
--
-- If the value is a string, then these values may have `$n` parameters, which
-- can be replaced by optional argument strings supplied by the `getValue` call.
--
-- @function Config:getValue
-- @param {string|table} option Config query or string key to return from the datastore.
-- @param {string} option.key String key to return from the datastore.
-- @param[opt] {table} option.args Arguments to substitute into the value (`$n`).
-- @param[opt] {string} ... Arguments to substitute into the value (`$n`).
-- @return {nil|boolean|string|number|table}
--]]
function Config:getValue(option, ...)
	checkTypeMulti('Config:getValue', 1, option, { 'table', 'string' });

	local key;
	local args;

	if (type(option) == 'table') then
		key = option.key;
		checkTypeForNamedArg('Config:getValue', 'key', key, 'string');

		args = option.args;
		checkTypeForNamedArg('Config:getValue', 'args', args, 'table', true);
	else -- type(option) == 'string'
		key = option;
		args = select('#', ...) > 0 and { ... } or nil;
	end

	-- value fetching
	local value;
	for _, data in ipairs(self._data) do
		value = data[key];
		if (value ~= nil) then
			break;
		end
	end

	if (type(value) == 'string' and args) then
		value = substArgsInMsg(value, args);
	end

	return value;
end

--[[
-- Loads the configuration from the global `"Dev:" .. source .. "/config"` configuration page
-- with overrides from the local `"Module:" .. source .. "/config"` configuration page.
--
-- @function p.loadConfig
-- @param {string} source
-- @return {Config}
--]]
function p.loadConfig(source)
	if (source == '') then
		source = nil
	end
	checkType('loadConfig', 1, source, 'string');

	local cfg = {};
	cfg._data = {};
	setmetatable(cfg, Config);
	
	source = string.gsub(source, '^.', mw.ustring.upper);
	local hasNS = mw.ustring.find(source, ':');
	if (not hasNS) then
		source = source .. '/config';
		if (mw.site.server ~= DEV_WIKI) then
			-- If this is utaite.miraheze.org, then `"Module:" .. source .. "/config"`
			-- and `"Dev:" .. source .. "/config"` point to the same configuration page
			local exists, localData = pcall(mw.loadData, 'Module:' .. source);
			if (exists and type(localData) == 'table') then
				cfg._data[#cfg._data + 1] = localData;
			end
		end
		source = 'Module:' .. source;
	end

	cfg._data[#cfg._data + 1] = mw.loadData(source);
	return cfg;
end

--[[
-- Exports classes for testing
--
-- @function p._exportClasses
-- @private
-- @return {table}
--]]
function p._exportClasses()
	return {
		Config = Config,
	};
end

return p;
-- </pre>