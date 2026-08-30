local p = {}

function p.main(frame)
	local args = frame:getParent().args
	local titleObj = mw.title.getCurrentTitle()
	
	-- 1. Determine Template Page
	local templatePage = args[1]
	if not templatePage then
		if titleObj.subpageText == 'doc' or titleObj.subpageText == 'Draft' then
			templatePage = titleObj.baseText
		else
			templatePage = titleObj.fullText
		end
	end
	
	-- 2. Determine Namespace Type
	local namespace = 'template'
	if mw.title.new(templatePage).namespace == 828 then
		namespace = 'Lua module'
	end
	
	-- 3. Calculate Total Pages (DPL)
	local targetNamespaceStr = nil
	local dplCall = '{{#dpl:uses=' .. templatePage .. '|format=,|resultsheader=%TOTALPAGES%'
	
	if args.pagetype and args.pagetype ~= '-' then
		if args.pagetype:lower() == 'main' then
			targetNamespaceStr = 'Main'
		else
			targetNamespaceStr = args.pagetype
		end
		dplCall = dplCall .. '|namespace=' .. targetNamespaceStr
	end
	
	dplCall = dplCall .. '}}'
	
	local dplResult = frame:preprocess(dplCall)
	local totalPages = tonumber(dplResult) or 0
	
	-- 4. Calculate Denominator (Total Wiki Pages vs Namespace Pages)
	local numberOfPages = 0
	
	if targetNamespaceStr then
		local nsId = 0
		
		if targetNamespaceStr == 'Main' then
			nsId = 0
		else
			local nsObj = mw.site.namespaces[targetNamespaceStr]
			if nsObj then
				nsId = nsObj.id
			else
				nsId = tonumber(targetNamespaceStr) or 0
			end
		end
		
		local nsCountRaw = frame:preprocess('{{PAGESINNAMESPACE:' .. nsId .. '}}')
		numberOfPages = tonumber(frame:callParserFunction('formatnum', { nsCountRaw, 'R' })) or 0
	else
		numberOfPages = mw.site.stats.pages
	end
	
	-- 5. Check for System Usage (MediaWiki namespace)
	local systemDplCall = '{{#dpl:uses=' .. templatePage .. '|namespace=MediaWiki}}'
	local systemDpl = frame:preprocess(systemDplCall)
	local isSystem = (systemDpl ~= '')
	
	-- 6. Risk Analysis
	local isHighRisk = (totalPages > 10000) or isSystem
	local percentage = 0
	if numberOfPages > 0 then
		percentage = (totalPages / numberOfPages) * 100
	end
	
	local isHighUse = (percentage > 0.10) or (totalPages > 1000) or isSystem
	
	if not isHighUse then
		return ""
	end
	
	-- 7. Build MessageBox Content
	local image = isSystem and 'Sou Sotto Blue.png' or 'Sou Sotto Blue.png'
	if args.image then image = args.image end 
	
	local header = ''
	if isHighRisk then header = '<big>WARNING:</big> ' end
	
	header = header .. string.format('This %s is used ', namespace)
	
	if isSystem then
		header = header .. 'in system messages, and '
	end
	
	if not targetNamespaceStr then
		header = header .. 'on '
	else
		header = header .. string.format('primarily on pages in the %s namespace. It can be found on ', targetNamespaceStr)
	end
	
	local linkText = frame:callParserFunction('formatnum', { totalPages })
	if totalPages > 100000 then linkText = 'a very large number of' end
	
	header = header .. string.format('[[Special:WhatLinksHere/%s|%s pages]]', templatePage, linkText)
	
	if totalPages > 0 and numberOfPages > 0 then
		local contextWord = targetNamespaceStr and 'those' or 'all'
		header = header .. string.format(', or on about %.2f%% of %s pages.', percentage, contextWord)
	else
		header = header .. '.'
	end
	
	local text = ''
	if isSystem then
		text = text .. "Edits will '''immediately''' change the MediaWiki user interface. "
	else
		text = text .. string.format('Edits to this %s will be widely noticed. ', namespace)
	end
	
	text = text .. 'To avoid large-scale disruption'
	if totalPages > 10000 then text = text .. ' and unnecessary server load' end
	text = text .. string.format(', any changes to this %s ', namespace)
	
	if isHighRisk then
		text = text .. '<u>must</u>'
	else
		text = text .. 'should'
	end
	
	text = text .. ' be tested in its '
	
	local function exists(page)
		local t = mw.title.new(page)
		return t and t.exists
	end
	
	local sandboxPage = templatePage .. '/Draft'
	if exists(sandboxPage) then
		text = text .. string.format('[[%s|sandbox]]', sandboxPage)
	else
		text = text .. 'sandbox'
	end
	
	text = text .. ' or '
	
	local testcasesPage = templatePage .. '/testcases'
	if exists(testcasesPage) then
		text = text .. string.format('[[%s|testcase]]', testcasesPage)
	else
		text = text .. 'testcases'
	end
	
	text = text .. ' subpages'
	
	if namespace == 'Lua module' then
		text = text .. ', or in your own [[Special:MyPage|user space]].'
	else
		text = text .. '.'
	end
	
	local protection = frame:preprocess('{{PROTECTIONLEVEL:edit|' .. templatePage .. '}}')
	
	if protection == 'sysop' then
		text = text .. ' The tested changes can then be added to this page in one single edit by an [[Genshin Impact Wiki:User Rights#Administrator|administrator]] or a [[Genshin Impact Wiki:User Rights#Content Moderator|content moderator]].'
	else
		text = text .. ' The tested changes can then be added to this page in one single edit.'
		if isHighRisk then
			text = text .. ' <strong>This page must be fully protected.</strong>'
		end
	end
	
	if isSystem then
		text = text .. ' The following MediaWiki pages use this ' .. namespace .. ': ' .. systemDpl
	end
	
	-- 8. Render
	local box = frame:expandTemplate{ title = 'MessageBox', args = {
		class = 'highrisk',
		type = 'important',
		image = image,
		style = 'background-color:rgba(200,0,0,0.2)',
		header = header,
		text = text,
		comment = 'Please consider discussing any changes in the [https://discord.gg/jAw6ytcVKA wiki\'s Discord].'
	}}
	
	-- 9. Add Categories
	local cats = ''
	if args.nocat ~= '1' then
		local sub = titleObj.subpageText
		if sub ~= 'Draft' and sub ~= 'doc' and sub ~= 'testcases' then
			if namespace == 'Lua module' then
				cats = '[[Category:High-Risk Modules]]'
			else
				cats = '[[Category:High-Risk Templates]]'
			end
		end
	end
	
	return box .. cats
end

return p