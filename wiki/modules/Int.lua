-- This is a helper module for [[Template:int]]
local templateTranslation = require('Module:Template translation')
local this = {}

function this.renderIntMessage(frame)
	local args = frame.args
	local pargs = (frame:getParent() or {}).args
	local arguments = {}
	for k, v in pairs(pargs) do
		local n = tonumber(k) or 0
		if (n >= 2) then
			arguments[n - 1] = mw.text.trim(v)
		end
	end

	local lang
	if args.lang and args.lang ~= '' and mw.language.isValidCode(args.lang) then
		lang = args.lang
	else
		lang = templateTranslation.getLanguage()
	end
	local msg = mw.message.new(mw.text.trim(args[1]), arguments):inLanguage(lang)

	if msg:exists() or lang == 'qqx' then
		if msg:isDisabled() then
			return args.missing or ''
		else
			local msgstr = msg:plain()
			return frame:preprocess(msgstr)
		end
	else
		return args.missing ~= ''
			and args.missing
			or '⧼' .. args[1] .. '⧽'
	end
end

return this