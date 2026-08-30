-- This implements [[Template:Template link general]] and various other templates in its family
local getArgs = require('Module:Arguments').getArgs
local yesno = require('Module:Yesno')

local cfg = mw.loadData('Module:Template link general/config')

local p = {}

-- Is a string non-empty?
local function _ne(s)
	return s ~= nil and s ~= ""
end

local nw = mw.text.nowiki

local function addTemplate(s)
	local i, _ = s:find(':', 1, true)
	if i == nil then
		return 'Template:' .. s
	end
	local ns = s:sub(1, i - 1)
	if ns == '' or mw.site.namespaces[ns] then
		return s
	else
		return 'Template:' .. s
	end
end

local function trimTemplate(s)
	local needle = 'template:'
	if s:sub(1, needle:len()):lower() == needle then
		return s:sub(needle:len() + 1)
	else
		return s
	end
end

local function linkTitle(args)
	if yesno(args.nolink) then
		return args[1]
	end

	local titleObj
	local titlePart = '[['
	if args[1] then
		-- This handles :Page and other NS
		titleObj = mw.title.new(args[1], 'Template')
	else
		titleObj = mw.title.getCurrentTitle()
	end

	titlePart = titlePart .. (titleObj ~= nil and titleObj.fullText or
				addTemplate(args[1]))

	local textPart = args.alttext
	if not _ne(textPart) then
		if titleObj ~= nil then
			textPart = titleObj:inNamespace("Template") and args[1] or titleObj.fullText
		else
			-- redlink
			textPart = args[1]
		end
	end

	if yesno(args.brace) then
		textPart = nw('{{') .. textPart .. nw('}}')
	elseif yesno(args.braceinside) then
		textPart = nw('{') .. textPart .. nw('}')
	end

	titlePart = titlePart .. '|' .. textPart .. ']]'
	if yesno(args.braceinside) then
		titlePart = nw('{') .. titlePart .. nw('}')
	end
	return titlePart
end

function p.main(frame)
	local args = getArgs(frame, {
		trim = true,
		removeBlanks = false,
		frameOnly = false,
		wrappers = {
			"Template:Tlg",
			"Template:Template link general",
		},
	})
	return p._main(args)
end

function p._main(args)
	-- TemplateStyles
	local templateStyles = {
		mono   = false,
		nowrap = false,
	}

	local bold = yesno(args.bold) or yesno(args.boldlink) or yesno(args.boldname)
	local italic = yesno(args.italic) or yesno(args.italics)
	local dontBrace = yesno(args.brace) or yesno(args.braceinside)
	local code = yesno(args.code) or yesno(args.tt)
	local show_result = yesno(args._show_result)
	local expand = yesno(args._expand)
	local classes = {}

	-- Build the link part
	local titlePart = linkTitle(args)
	if bold then titlePart = "'''" .. titlePart .. "'''" end

	if yesno(args.subst) then
		local substLink = cfg['subst-link']
		if _ne(substLink) and yesno(args['link subst']) then
			titlePart = '[[' .. substLink .. '|subst]]:' .. titlePart
		else
			titlePart = 'subst:' .. titlePart
		end
	end

	if yesno(args.nowrapname) then
		templateStyles.nowrap = true
		titlePart = '<span class="nowrap">' .. titlePart .. '</span>'
	end

	-- Build the arguments
	local textPart = ""
	local textPartBuffer = "&#124;"
	local codeArguments = {}
	local codeArgumentsString = ""
	local i = 2
	local j = 1
	while args[i] do
		local val = args[i]
		if val ~= "" then
			if yesno(args.nowiki) then
				-- Unstrip nowiki tags first because calling nw on something that already contains nowiki tags will
				-- mangle the nowiki strip marker and result in literal UNIQ...QINU showing up
				val = nw(mw.text.unstripNoWiki(val))
			end
			local k, v = string.match(val, "(.*)=(.*)")
			if not k then
				codeArguments[j] = val
				j = j + 1
			else
				codeArguments[k] = v
			end
			codeArgumentsString = codeArgumentsString .. textPartBuffer .. val
			if italic then
				val = '<span style="font-style:italic;">' .. val .. '</span>'
			end
			textPart = textPart .. textPartBuffer .. val
		end
		i = i + 1
	end

	local tagName = nil
	local css = nil

	-- final wrap
	local ret = titlePart .. textPart
	if not dontBrace then ret = nw('{{') .. ret .. nw('}}') end
	if yesno(args.a) then ret = nw('*') .. '&nbsp;' .. ret end
	if yesno(args.kbd) then
		tagName = 'kbd'
	end

	if yesno(args.mono) then
		templateStyles.mono = true
		table.insert(classes, 'monospaced')
	end

	local plaincode = yesno(args.plaincode) and not code
	if code or plaincode then
		if tagName then
			-- kbd == true && code == true
			ret = ('<%s>%s</%s>'):format(tagName, ret, tagName)
		end
		tagName = 'code'
		if plaincode then
			css = {
				background = 'transparent',
				border     = 'none',
				color      = 'var(--color-emphasized, #101418)',
			}
		end
	end

	if show_result then
		local result = mw.getCurrentFrame():expandTemplate{title = addTemplate(args[1]), args = codeArguments}
		ret = ret .. " → " .. result
	end

	if expand then
		local query = mw.text.encode('{{' .. addTemplate(args[1]) .. string.gsub(codeArgumentsString, textPartBuffer, "|") .. '}}')
		local url = mw.uri.fullUrl('special:ExpandTemplates', 'wpInput=' .. query)
		mw.log()
		ret = ret .. " [" .. tostring(url) .. "]"
	end

	if yesno(args.nowrap) then
		templateStyles.nowrap = true
		table.insert(classes, 'nowrap')
	end

	if tagName or #classes > 0 or css then
		local span = mw.html.create(tagName or 'span')
			:addClass(table.concat(classes, ' '))
			:wikitext(ret)

		if css then
			span:css(css)
		end
		ret = tostring(span:allDone())
	end

	local ts = {}
	if templateStyles.mono then
		table.insert(ts, mw.getCurrentFrame():extensionTag{
			name = 'templatestyles',
			args = { src = 'Template:Mono/styles.css' }
		})
	end

	if templateStyles.nowrap then
		table.insert(ts, mw.getCurrentFrame():extensionTag{
			name = 'templatestyles',
			args = { src = 'Template:Nowrap/styles.css' }
		})
	end

	if yesno(args.debug) then
		ret = ret .. '\n<pre>' .. mw.text.encode(mw.dumpObject(args)) .. '</pre>'
	end

	return table.concat(ts) .. ret
end

return p