local p = {};
local getArgs = require("Module:Arguments").getArgs;

-- Note to dev wiki editors: this function is copied from Module:Example.
-- Changes to this function should be synced with the source.
function unescape(text)
	if not text:match("UNIQ") then
		return text;
	end
	local unescaped = mw.text.unstripNoWiki(text);
	local text, count = string.gsub(unescaped, "&lt;", "<");
	text, count = string.gsub(text, "&gt;", ">");
	text, count = string.gsub(text, "<//nowiki>", "</nowiki>");
	return text;
end

function perform_substitution(pattern, arguments, values)
	for i = 1, #arguments do
		local arg = arguments[i];
		local val = values[i];
		pattern = string.gsub(pattern, arg, val);
	end
	return pattern;
end

function p.main(frame)
	local args = getArgs(frame, { removeBlanks = false });
	local pattern = args['pattern'] or '';
	local pattern = unescape(pattern);
	local debug_mode = args['debug'] or false;
	local arguments = {};
	for i = 1, 100 do
		local arg = args['arg' .. tostring(i)] or args['argument' .. tostring(i)] or '';
		if arg == '' then
			break
		end
		table.insert(arguments, arg);
	end
	if debug_mode then
		mw.log("Arguments: ");
		mw.logObject(arguments);
	end
	local values = {};
	local result = {};
	for i, value in ipairs(args) do
		if debug_mode then
			mw.log("Value: " .. value);
		end
		table.insert(values, value);
		if #arguments == #values then
			local substituted = perform_substitution(pattern, arguments, values);
			if debug_mode then
				mw.log("Substituted: ");
				mw.log(substituted);
			end
			table.insert(
				result,
				substituted
			);
			values = {};
		end
	end
	result = table.concat(result);
	return frame:preprocess(result);
end

return p;