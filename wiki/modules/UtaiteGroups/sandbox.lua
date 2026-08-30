local p = {}

-- Find the full '{{...}}' block starting at startPos (index of '{{'),
-- balancing nested braces. Returns block text and the index after it.
local function findBlock(content, startPos)
	local depth = 0
	local i = startPos
	local len = #content
	while i <= len do
		local two = content:sub(i, i + 1)
		if two == '{{' then
			depth = depth + 1
			i = i + 2
		elseif two == '}}' then
			depth = depth - 1
			i = i + 2
			if depth == 0 then
				return content:sub(startPos, i - 1), i
			end
		else
			i = i + 1
		end
	end
	return content:sub(startPos), len + 1
end

-- Pull member names out of one member-template block.
-- Handles numbered params (name1=, status1=, ...) and the legacy
-- unnumbered style (name=, status=). Skips terminated members.
local function extractMembers(block, members)
	local foundNumbered = false
	for idx, name in block:gmatch('|%s*name(%d+)%s*=%s*([^|}\n]+)') do
		foundNumbered = true
		local status = block:match('|%s*status' .. idx .. '%s*=%s*([^|}\n]+)')
		status = status and mw.ustring.lower(mw.text.trim(status)) or 'active'
		if status ~= 'terminated' then
			table.insert(members, '[[' .. mw.text.trim(name) .. ']]')
		end
	end
	if not foundNumbered then
		local name = block:match('|%s*name%s*=%s*([^|}\n]+)')
		if name then
			local status = block:match('|%s*status%s*=%s*([^|}\n]+)')
			status = status and mw.ustring.lower(mw.text.trim(status)) or 'active'
			if status ~= 'terminated' then
				table.insert(members, '[[' .. mw.text.trim(name) .. ']]')
			end
		end
	end
end

function p.processPage(frame)
	local pageName = frame.args[1]

	local title = mw.title.new(pageName)
	if not title or not title.exists then
		return "Error: Page '" .. tostring(pageName) .. "' does not exist"
	end

	local content = title:getContent()
	if not content then
		return "Error: Unable to get content for '" .. tostring(pageName) .. "'. Check permissions."
	end

	-- Matches {{UtaiteUnitMember and {{UtaiteGroupMember (redirect)
	local members = {}
	local pos = 1
	while true do
		local s = content:find('{{%s*Utaite%a*Member', pos)
		if not s then break end
		local block, nextPos = findBlock(content, s)
		extractMembers(block, members)
		pos = nextPos
	end

	if #members == 0 then
		return "No members found"
	end
	return table.concat(members, ", ")
end

return p