local p = {}

-- Ordered list of pinned blog posts (full page names). First entry = topmost pin.
local PIN_JSON_PAGE = 'Template:MP-Blog/pin.json'

local function loadPins()
	local ok, data = pcall(mw.loadJsonData, PIN_JSON_PAGE)
	if not ok or type(data) ~= 'table' then
		return {}
	end
	return data
end

function p.card(frame)
	-- 1. Get arguments from the parent template
	local args = frame:getParent().args
	local title = args.title or ''
	local page = args.page or ''
	local pinned = args.pinned or ''
	local isPinned = pinned ~= '' and pinned ~= 'no'

	-- 2. Parse the title
	local titleParts = mw.text.split(title, '/')
	local username = titleParts[1] or ''
	local blogTitle = titleParts[2] or ''

	-- 3. Fetch external data via preprocess
	local creationDate = frame:preprocess('{{GetPageCreationDate|' .. page .. '}}')
	local avatar = frame:preprocess('{{GetUserAvatar|' .. username .. '|size=20}}')

	-- 4. Build HTML Structure
	local root = mw.html.create('div')
		:addClass('blog-card')
	if isPinned then
		root:addClass('blog-card-pinned')
	end

	-- Header Section
	local header = root:tag('div')
		:addClass('blog-card-header')

	-- Meta Span
	local meta = header:tag('span')
		:addClass('blog-card-meta')
		:css('text-align', 'left !important')

	local userLink = string.format('[%s %s]', tostring(mw.uri.fullUrl('User:' .. username, {action='view'})), avatar)
	local blogLink = string.format('[%s %s]', tostring(mw.uri.fullUrl('User blog:' .. username, {action='view'})), username)

	meta:wikitext(userLink .. '&nbsp;' .. blogLink .. '&nbsp;・&nbsp;' .. creationDate)

	-- Comment Count Span
	header:tag('span')
		:addClass('blog-comment-count')
		:wikitext('<i class="fa-regular fa-comment"></i>&nbsp;')
		:tag('span')
			:addClass('comment-count')
			:addClass('js-comment-count')
			:attr('data-page', page)
			:wikitext('...')

	-- Blog Post Title (H3)
	local pinIcon = ''
	if isPinned then
		pinIcon = '<i class="fa-solid fa-thumbtack blog-pin-icon" title="Pinned post"></i>&nbsp;'
	end
	root:tag('h3')
		:addClass('blog-card-title')
		:css('text-align', 'center !important')
		:wikitext(pinIcon .. '[[' .. page .. '|' .. blogTitle .. ']]')

	-- Excerpt Div
	root:tag('div')
		:addClass('blog-card-excerpt')
		:addClass('js-text-extract')
		:attr('data-page', page)
		:css('text-align', 'center !important')
		:tag('span')
			:addClass('extract-loading')
			:css('color', '#888')
			:css('font-style', 'italic')
			:wikitext('Loading...')

	-- Footer / Read More
	root:tag('div')
		:addClass('blog-card-footer')
		:css('text-align', 'center !important')
		:tag('span')
			:addClass('blog-read-more')
			:wikitext('[[' .. page .. '|Read full post]]')

	return tostring(root)
end

-- Render the pinned blog cards, in the order they appear in pin.json.
-- Wraps each card in the same containers DPL uses in Template:LatestUserBlogs.
function p.pinned(frame)
	local out = {}
	for _, entry in ipairs(loadPins()) do
		if type(entry) == 'string' and entry ~= '' then
			local t = mw.title.new(entry)
			if t and t.exists then
				local card = frame:expandTemplate{
					title = 'LatestUserBlogItem',
					args = { page = t.prefixedText, title = t.text, pinned = 'yes' },
				}
				table.insert(out, '<div class="left-articles"><div class="listpages-container">' .. card .. '</div></div>')
			end
		end
	end
	return table.concat(out)
end

-- Pipe-separated title patterns (namespace stripped) for DPL nottitlematch,
-- so pinned posts don't appear a second time in the latest list.
function p.pinnedExclude(frame)
	local pats = {}
	for _, entry in ipairs(loadPins()) do
		if type(entry) == 'string' and entry ~= '' then
			local t = mw.title.new(entry)
			if t then
				table.insert(pats, t.text)
				local underscored = string.gsub(t.text, ' ', '_')
				if underscored ~= t.text then
					table.insert(pats, underscored)
				end
			end
		end
	end
	if #pats == 0 then
		-- DPL needs a non-empty value; this matches no real page.
		return 'ZZZ-no-pinned-blogs-placeholder'
	end
	return table.concat(pats, '|')
end

return p