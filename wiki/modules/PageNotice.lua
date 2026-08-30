local p = {}

function p.notice(frame)
	local args = {}
	for k, v in pairs(frame.args) do
		args[k] = v
	end
	if frame:getParent() then
		for k, v in pairs(frame:getParent().args) do
			args[k] = v
		end
	end
	local fileType = args.type or 'js'
	local page1 = args[1] or mw.title.getCurrentTitle().rootText
	local page2 = args[2]
	
	local function getNamespace(page)
		if mw.ustring.find(page, 'Template:') then
			return ''
		else
			return 'MediaWiki:'
		end
	end
	
	local function buildLink(page, ext)
		local ns = getNamespace(page)
		local fullName = ns .. page .. '.' .. ext
		local urlEdit = tostring(mw.uri.fullUrl(fullName, {action='edit'}))
		local urlHist = tostring(mw.uri.fullUrl(fullName, {action='history'}))
		return string.format('[[%s]] ([%s edit] | [%s hist])', fullName, urlEdit, urlHist)
	end
	
	local headerText = string.format('This template uses %s found at %s', 
		fileType:upper(), 
		buildLink(page1, fileType)
	)
	
	if page2 then
		headerText = headerText .. ' and ' .. buildLink(page2, fileType)
	end
	
	headerText = headerText .. '.'
	
	local image = (fileType == 'js') and 'JS logo.svg' or 'CSS logo.svg'
	
	return frame:expandTemplate{ title = 'MessageBox', args = {
		class = fileType,
		header = headerText,
		image = image,
		imagewidth = '32px',
		id = fileType
	}}
end

return p