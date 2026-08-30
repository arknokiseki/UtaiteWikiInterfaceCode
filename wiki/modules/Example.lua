local p = {};

-- Note to dev wiki editors: this function is copied to other modules. Updates
-- to this function should be synced with the following modules:
-- Module:Loops
-- Module:Repeat
function p._unescape(text)
	if not text:match("UNIQ") then
		return text;
	end
	local unescaped = mw.text.unstripNoWiki(text);
	local text, count = string.gsub(unescaped, "&lt;", "<");
	text, count = string.gsub(text, "&gt;", ">");
	text, count = string.gsub(text, "<//nowiki>", "</nowiki>");
	return text;
end

function p.unescape(frame)
	local text = frame.args[1];
	return p._unescape(text);
end

function p.preprocess(frame)
	local text = frame.args[1];
	text = p._unescape(text);
	return frame:preprocess(text);
end

return p;