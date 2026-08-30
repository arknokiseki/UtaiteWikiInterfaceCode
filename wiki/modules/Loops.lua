-- <nowiki>
--------------------------------------------------------------------------------
-- Lua module implementing features similar to [[mw:Extension:Loops]].
--
-- @module loops
--------------------------------------------------------------------------------

local p = {};
local getArgs = require("Module:Arguments").getArgs;
local libraryUtil = require("libraryUtil");

local checkType = libraryUtil.checkType;
local checkTypeForNamedArg = libraryUtil.checkTypeForNamedArg;
local ustring = mw.ustring;

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

-- User-facing error message
local function userError(message)
	return '<strong class="error">' .. message .. '</strong>';
end

-- Check if a value is a frame object
local function isFrame(frame)
	return type(frame) == "table"
		and type(frame.args) == "table"
		and type(frame.getParent) == "function";
end

-- Get table length (for numeric keys)
local function tableLength(t)
	local count = 0;
	for k, v in pairs(t) do
		if type(k) == "number" and k > 0 and math.floor(k) == k then
			if k > count then
				count = k;
			end
		end
	end
	return count;
end

-- Unescape nowiki-wrapped content
local function unescape(text)
	if not text then
		return "";
	end
	if not text:match("UNIQ") then
		return text;
	end
	local unescaped = mw.text.unstripNoWiki(text);
	local result, count = string.gsub(unescaped, "&lt;", "<");
	result, count = string.gsub(result, "&gt;", ">");
	result, count = string.gsub(result, "<//nowiki>", "</nowiki>");
	return result;
end

-- Preprocesses text escaped using the DynamicPageList3 method
local function preprocessDPL3(frame, msg)
	msg = ustring.gsub(msg, "«", "<");
	msg = ustring.gsub(msg, "»", ">");
	msg = ustring.gsub(msg, "¦", "|");
	msg = ustring.gsub(msg, "²{", "{{");
	msg = ustring.gsub(msg, "}²", "}}");
	return frame:preprocess(msg);
end
p._preprocess = preprocessDPL3;

-- Escape pattern special characters
local function escapePattern(pattern)
	return ustring.gsub(pattern, "([%(%)%.%%%+%-%*%?%[%^%$%]])", "%%%1");
end
p._escapePattern = escapePattern;

-- Sentence-style joining (experimental)
local function sentenceJoin(lst, delimiter, beforeLast)
	if not delimiter then
		delimiter = ", ";
		if not beforeLast then
			beforeLast = "and";
		end
	elseif not beforeLast then
		beforeLast = delimiter;
	end
	local count = #lst;
	if count == 0 then
		return "";
	elseif count == 1 then
		return lst[1];
	elseif count == 2 then
		return string.format("%s %s %s", lst[1], beforeLast, lst[2]);
	else
		local last = lst[count];
		lst[count] = nil;
		return string.format("%s %s %s",
			table.concat(lst, delimiter),
			beforeLast,
			last
		);
	end
end

-- Formatted output (experimental)
local function formatConcat(result, args)
	local outputFormat = args and args['format'] or nil;
	if not outputFormat then
		return table.concat(result, "");
	end
	if outputFormat == "concat" then
		return sentenceJoin(result, args['delimiter'], args['final-delimiter']);
	end
	return table.concat(result, "");
end

--------------------------------------------------------------------------------
-- Parses and prints wikitext markup N times
-- @usage {{#invoke:Loops|loop|$1|1|5|Iteration $1<br>}}
--------------------------------------------------------------------------------
function p.loop(frame)
	local args = getArgs(frame);
	local variableName = args[1] or "$1";
	local startingValue = tonumber(args[2]) or 1;
	local loopNum = tonumber(args[3]) or 0;
	local markup = unescape(args[4] or "");
	
	-- Handle negative loop counts
	local endValue;
	local step = 1;
	if loopNum < 0 then
		endValue = startingValue + loopNum + 1;
		step = -1;
	else
		endValue = startingValue + loopNum - 1;
	end
	
	local result = {};
	for i = startingValue, endValue, step do
		local s = markup:gsub(escapePattern(variableName), tostring(i));
		table.insert(result, s);
	end
	return frame:getParent():preprocess(formatConcat(result, args));
end

--------------------------------------------------------------------------------
-- Iterates over numbered arguments
-- @usage {{#invoke:Loops|fornumargs|key=$1|value=$2|pattern=* $1: $2|arg1|arg2}}
--------------------------------------------------------------------------------
function p.fornumargs(frame)
	local args = getArgs(frame, { removeBlanks = false });
	local keyName = args['key'] or "DNE";
	local valueName = args['value'] or "DNE";
	local markup = unescape(args['pattern'] or "");
	
	local keys = {};
	for k, v in pairs(args) do
		if type(k) == "number" then
			table.insert(keys, k);
		end
	end
	table.sort(keys);
	
	local result = {};
	for _, key in ipairs(keys) do
		local value = args[key];
		local s = markup:gsub(escapePattern(keyName), tostring(key)):gsub(escapePattern(valueName), tostring(value));
		table.insert(result, s);
	end
	return frame:getParent():preprocess(formatConcat(result, args));
end

--------------------------------------------------------------------------------
-- Iterates over arguments with a specific prefix
-- @usage {{#invoke:Loops|forargs|item_|$1|$2|* $1 = $2|item_a=1|item_b=2}}
--------------------------------------------------------------------------------
function p.forargs(frame)
	local args = getArgs(frame, { removeBlanks = false });
	local prefix = args[1] or "";
	local keyName = args[2] or "DNE";
	local valueName = args[3] or "DNE";
	local markup = unescape(args[4] or "");
	
	-- Remove the first 4 positional args from consideration
	args[1] = nil;
	args[2] = nil;
	args[3] = nil;
	args[4] = nil;
	
	local keys = {};
	for k, v in pairs(args) do
		if type(k) == "string" then
			local i, j = k:find(prefix, 1, true);
			if i ~= nil and i == 1 then
				table.insert(keys, k:sub(j + 1));
			end
		end
	end
	table.sort(keys);
	
	local result = {};
	for _, key in ipairs(keys) do
		local value = args[prefix .. key];
		local s = markup:gsub(escapePattern(keyName), key):gsub(escapePattern(valueName), tostring(value));
		table.insert(result, s);
	end
	return frame:getParent():preprocess(formatConcat(result, args));
end

--------------------------------------------------------------------------------
-- Returns the number of arguments
-- @usage {{#invoke:Loops|numArgs}}
--------------------------------------------------------------------------------
function p.numArgs(frame)
	checkType("numArgs", 1, frame, "table");
	local args;
	if isFrame(frame) then
		args = (frame:getParent() or frame).args;
	else
		args = frame;
	end
	return tableLength(args);
end

--------------------------------------------------------------------------------
-- Iterates over numbered arguments
-- Uses parent frame args for data, invoke args for configuration
-- @usage {{#invoke:Loops|forNumArgs|template = $1: $2}}
-- @usage {{#invoke:Loops|forNumArgs|$2|$1: $2}}
-- @usage {{#invoke:Loops|forNumArgs|$1|$2|$1: $2}}
--------------------------------------------------------------------------------
function p.forNumArgs(frame)
	local frameArgs, parentArgs;
	checkType("forNumArgs", 1, frame, "table");
	if isFrame(frame) then
		frameArgs  = frame.args;
		parentArgs = frame:getParent().args;
	else
		return userError("forNumArgs only supports invocation");
	end

	local kPattern, vPattern, template;
	local frameNumArgs = tableLength(frameArgs);
	if frameNumArgs >= 3 then
		kPattern = frameArgs[1];
		vPattern = frameArgs[2];
		template = frameArgs[3];
	elseif frameNumArgs >= 2 then
		vPattern = frameArgs[1];
		template = frameArgs[2];
	else
		template = frameArgs[1];
	end

	kPattern = frameArgs.key      or kPattern;
	vPattern = frameArgs.value    or vPattern;
	template = frameArgs.template or template;

	checkTypeForNamedArg("forNumArgs", "key",      kPattern, "string", true);
	checkTypeForNamedArg("forNumArgs", "value",    vPattern, "string", true);
	checkTypeForNamedArg("forNumArgs", "template", template, "string", true);

	if template == nil then
		return userError("Must supply template parameter to forNumArgs");
	end

	vPattern = vPattern or "$1";
	if kPattern ~= nil then
		if #kPattern > 0 then
			if kPattern == vPattern then
				return userError("key pattern must be different from value pattern");
			end
			kPattern = escapePattern(kPattern);
		else
			kPattern = nil;
		end
	elseif vPattern ~= "$2" then
		kPattern = "%$2";
	end
	if #vPattern == 0 then
		vPattern = nil;
	else
		vPattern = escapePattern(vPattern);
	end

	local result = {};
	local v, msg;
	for k = 1, tableLength(parentArgs) do
		v = parentArgs[k];
		if v ~= nil then
			msg = template;
			if kPattern then
				msg = ustring.gsub(msg, kPattern, (ustring.gsub(tostring(k), "%%", "%%%%")));
			end
			if vPattern then
				msg = ustring.gsub(msg, vPattern, (ustring.gsub(tostring(v), "%%", "%%%%")));
			end
			result[#result + 1] = preprocessDPL3(frame, msg);
		end
	end

	return table.concat(result);
end

--------------------------------------------------------------------------------
-- Loop function (uses DPL3 preprocessing)
-- @usage {{#invoke:Loops|loop_v1|$1|1|5|Iteration $1}}
--------------------------------------------------------------------------------
function p.loop_v1(frame)
	local frameArgs;
	checkType("loop_v1", 1, frame, "table");
	if isFrame(frame) then
		frameArgs = frame.args;
	else
		return userError("loop_v1 only supports invocation");
	end
	
	local pattern = frameArgs[1] or "$1";
	local start = tonumber(frameArgs[2]) or 1;
	local loopsPerformed = tonumber(frameArgs[3]) or 0;
	local fin = loopsPerformed < 0 and start + (loopsPerformed + 1) or (start - 1) + loopsPerformed;
	local step = loopsPerformed < 0 and -1 or 1;
	local template = frameArgs[4] or "";
	
	local result = {};
	for i = start, fin, step do
		local msg = ustring.gsub(template, escapePattern(pattern), tostring(i));
		result[#result + 1] = msg;
	end
	
	return preprocessDPL3(frame, table.concat(result));
end

--------------------------------------------------------------------------------
-- ALIASES
--------------------------------------------------------------------------------

p.fornumArgs  = p.fornumargs;
p.forNumargs  = p.forNumArgs;
p.Fornumargs  = p.fornumargs;
p.ForNumArgs  = p.forNumArgs;
p.Loop        = p.loop;
p.LOOP        = p.loop;
p.forArgs     = p.forargs;
p.ForArgs     = p.forargs;
p.Forargs     = p.forargs;
p.NumArgs     = p.numArgs;
p.Numargs     = p.numArgs;
p.numargs     = p.numArgs;

--------------------------------------------------------------------------------
-- UTILITY FUNCTIONS
--------------------------------------------------------------------------------

p._unescape     = unescape;
p._isFrame      = isFrame;
p._tableLength  = tableLength;
p._formatConcat = formatConcat;
p._userError    = userError;

return p;
-- </nowiki>