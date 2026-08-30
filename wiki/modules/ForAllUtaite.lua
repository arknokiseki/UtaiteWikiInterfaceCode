-- Like {{Main other}}, but the condition is "does the current page
-- transclude {{Utaite}}?" — returns the first parameter on pages that
-- use {{Utaite}}, the second parameter on all other pages.
local p = {}

-- Namespaces where the template stays inert (returns nothing), so that a
-- template embedding {{ForAllUtaite|...}} does not categorize its own page.
local SKIP_NAMESPACES = {
	[8] = true,   -- MediaWiki
	[10] = true,  -- Template
	[828] = true, -- Module
}

local function normalizeName(name)
	name = name:gsub('_', ' ')
	name = name:gsub('^%s*[Tt]emplate%s*:', '')
	return mw.text.trim(name)
end

local function hasUtaite(content)
	if not content then
		return false
	end
	-- Editors sometimes put HTML comments inside the template call, even
	-- between "{{" and the template name — strip them before matching.
	content = content:gsub('<!%-%-.-%-%->', '')
	for name in content:gmatch('{{([^{}|]+)') do
		name = normalizeName(name)
		if name == 'Utaite' or name == 'utaite' then
			return true
		end
	end
	return false
end

function p.main(frame)
	local args = frame:getParent().args
	local demo = mw.text.trim(args.demo or '')
	local title = mw.title.getCurrentTitle()

	local isUtaite
	if demo == 'utaite' then
		isUtaite = true
	elseif demo == 'other' then
		isUtaite = false
	elseif SKIP_NAMESPACES[title.namespace] then
		return ''
	else
		isUtaite = hasUtaite(title:getContent())
	end

	if isUtaite then
		return args[1] or ''
	end
	return args[2] or ''
end

return p