local p = {}

local lang = require('Module:Template translation').getLanguage()
local frame = mw.getCurrentFrame()

local function msg(name)
	return mw.message.new(name):inLanguage(lang):plain()
end

local function generateLink(i, args)
	local title = args[i]
	local linktext = args['label ' .. tostring(i)] or args['l' .. tostring(i)] or nil
	if args.ll then
		return frame:expandTemplate{ title = 'll', args = { title, linktext } }
	else
		if linktext then
			return string.format('[[:%s|%s]]', title, linktext)
		else
			return string.format('[[:%s]]', title)
		end
	end
end

function p._main(args)
	local t = {}
	for i, v in ipairs(args) do
		table.insert(t, generateLink(i, args))
	end
	if #t > 0 then
		return mw.text.listToText(
			t,
			-- mw.text.listToText’s defaults use wiki language, not page language
			msg('comma-separator'),
			msg('and') .. msg('word-separator')
		)
	else
		return args['msg-empty-array'] or 'Error: no links'
	end
end

function p.main(frame)
	local args = require('Module:Arguments').getArgs(frame)
	return p._main(args)
end

return p