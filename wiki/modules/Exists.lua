local p = {}

function p.main(frame)
    local args = require('Module:Arguments').getArgs(frame, {
        parentFirst = true,
        wrapper = {'Template:Exists'}
    })
    return p._main(args)
end

function p._main(args)
	local page = args[1] or ''
	local trueResult = args[2] or args['then'] or ''
	local falseResult = args[3] or args['else'] or ''
	
	if (p.checkExists(page)) then
		return trueResult
	else
		return falseResult
	end
end

function p.checkExists(page)
	page = mw.text.decode(page or '')
	local frame = mw.getCurrentFrame()
	if (page:match('[#<>%[%]%{%}]+') or page == '') then
		return false
	elseif (frame:callParserFunction('PROTECTIONEXPIRY:edit', page) ~= '') then
		return true
	else
		return false
	end
end

return p