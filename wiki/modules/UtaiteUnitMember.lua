--------------------------------------------------------------------------------
-- Module:UtaiteUnitMember
--
-- Renders a full member grid for an utaite unit from a single transclusion
-- with numbered parameters (name1, image1, color1, ... name2, image2, ...).
-- Invoked by [[Template:UtaiteUnitMember]].
--
-- Variants: default | fullimage | compact
--------------------------------------------------------------------------------

local p = {}

local FALLBACK_COLOR = '#7fb3d3'

-- Known statuses. Anything else falls back to 'active' styling but the given
-- text is still displayed.
local KNOWN_STATUS = {
	active     = true,
	hiatus     = true,
	inactive   = true,
	graduated  = true,
	terminated = true,
}

--------------------------------------------------------------------------------
-- Helpers
--------------------------------------------------------------------------------

-- Trim; empty string -> nil
local function trim(s)
	if s == nil then return nil end
	s = mw.text.trim(s)
	if s == '' then return nil end
	return s
end

-- Truthy check for leader= (accepts yes/true/1/y, case-insensitive;
-- rejects no/false/0 and absence)
local function isYes(s)
	s = trim(s)
	if not s then return false end
	s = mw.ustring.lower(s)
	return not (s == 'no' or s == 'false' or s == '0' or s == 'n')
end

-- Only allow CSS color-ish values: #hex (3/4/6/8 digits) or a plain
-- alphabetic keyword (named colors). Anything else -> theme fallback.
local function sanitizeColor(c)
	c = trim(c)
	if not c then return nil end
	if c:match('^#%x%x%x$')
		or c:match('^#%x%x%x%x$')
		or c:match('^#%x%x%x%x%x%x$')
		or c:match('^#%x%x%x%x%x%x%x%x$')
	then
		return c
	end
	if c:match('^[A-Za-z]+$') then
		return c -- named CSS color, e.g. "crimson"
	end
	return FALLBACK_COLOR
end

-- Normalized status key + display text
local function statusInfo(raw)
	raw = trim(raw) or 'active'
	local key = mw.ustring.lower(raw)
	local display = mw.ustring.upper(mw.ustring.sub(raw, 1, 1)) .. mw.ustring.sub(raw, 2)
	if not KNOWN_STATUS[key] then
		key = 'active' -- unknown -> active styling, keep given text
	end
	return key, display
end

-- Filename cleanup. Old hand-written wikitext often glued extra syntax onto
-- the image param (e.g. "Member amane.png|thumb]]"). A real filename never
-- contains "|" or "]", so cut at the first one.
local function sanitizeFile(s)
	s = trim(s)
	if not s then return nil end
	s = s:gsub('[|%]].*$', '')
	s = s:gsub('^%s*[Ff]ile:%s*', '') -- tolerate a "File:" prefix
	return trim(s)
end

-- fit: only 'contain' is meaningful (default rendering is cover)
local function validFit(s)
	s = trim(s)
	if s and mw.ustring.lower(s) == 'contain' then return 'contain' end
	return nil
end

-- object-position: 1–2 tokens, each a position keyword or N% / Npx
local function validImgPos(s)
	s = trim(s)
	if not s then return nil end
	local tokens = mw.text.split(s, '%s+')
	if #tokens == 0 or #tokens > 2 then return nil end
	for _, t in ipairs(tokens) do
		t = mw.ustring.lower(t)
		if not (t == 'top' or t == 'bottom' or t == 'left' or t == 'right'
			or t == 'center' or t:match('^%d+%%$') or t:match('^%d+px$'))
		then
			return nil
		end
	end
	return mw.ustring.lower(s)
end

-- Build one member record from args using the given key suffix
-- ('' for legacy unnumbered params, '1'/'2'/... for numbered)
local function buildMember(args, suffix)
	local name = trim(args['name' .. suffix])
	if not name then return nil end

	local statusKey, statusDisplay = statusInfo(args['status' .. suffix])
	return {
		name          = name,
		image         = sanitizeFile(args['image' .. suffix]) or sanitizeFile(args['img' .. suffix]),
		color         = sanitizeColor(args['color' .. suffix]), -- nil if not given
		desc          = trim(args['desc' .. suffix]),
		fanname       = trim(args['fanname' .. suffix]),
		oshimark      = trim(args['oshimark' .. suffix]),
		statusKey     = statusKey,
		statusDisplay = statusDisplay,
		leader        = isYes(args['leader' .. suffix]),
		terminated    = (statusKey == 'terminated'),
		dimmed        = (statusKey == 'terminated' or statusKey == 'graduated'),
		-- image fitting: per-member value falls back to the grid-level one
		fit           = validFit(args['fit' .. suffix]) or validFit(args.fit),
		imgpos        = validImgPos(args['imgpos' .. suffix]) or validImgPos(args.imgpos),
	}
end

-- Collect members from numbered args; stops at the first missing name{i}.
-- LEGACY fallback: if no numbered members exist but unnumbered |name= does
-- (the pre-module, one-transclusion-per-member syntax), render that single
-- member so old pages keep working during migration.
local function getMembers(args)
	local members = {}
	local i = 1
	while true do
		local m = buildMember(args, tostring(i))
		if not m then break end
		members[#members + 1] = m
		i = i + 1
	end
	if #members == 0 then
		local legacy = buildMember(args, '')
		if legacy then
			members[1] = legacy
			members.legacy = true
		end
	end
	return members
end

--------------------------------------------------------------------------------
-- Fragment builders
--------------------------------------------------------------------------------

-- [[File:...]] wikitext. Terminated members get link= (no link).
local function fileWikitext(m, size)
	if not m.image then return nil end
	local link = m.terminated and '' or m.name
	return string.format('[[File:%s|%s|link=%s|%s]]', m.image, size, link, m.name)
end

-- Name: wiki link, or plain text when terminated
local function nameWikitext(m)
	if m.terminated then
		return m.name
	end
	return string.format('[[%s]]', m.name)
end

-- Expanding crown badge (default + fullimage variants)
local function leaderBadge(node)
	node:tag('span')
		:addClass('uum-leader')
		:attr('title', 'Leader')
		:tag('span'):addClass('uum-leader-icon'):wikitext('👑'):done()
		:tag('span'):addClass('uum-leader-text'):wikitext('LEADER'):done()
end

-- Apply per-member image fitting options to a portrait container
local function applyImageOpts(node, m)
	if m.fit == 'contain' then
		node:addClass('uum-fit-contain')
	end
	if m.imgpos then
		node:css('--uum-imgpos', m.imgpos)
	end
end

--------------------------------------------------------------------------------
-- Variant renderers
--------------------------------------------------------------------------------

local function renderDefault(m)
	local card = mw.html.create('div')
		:addClass('uum-card uum-card-default')

	-- top color bar
	card:tag('div')
		:addClass('uum-colorbar')
		:css('background-color', m.color or FALLBACK_COLOR)

	-- image
	local imgBox = card:tag('div'):addClass('uum-image')
	applyImageOpts(imgBox, m)
	local file = fileWikitext(m, '200x200px')
	if file then imgBox:wikitext(file) end
	if m.leader then leaderBadge(imgBox) end

	-- body
	local body = card:tag('div'):addClass('uum-body')

	body:tag('div'):addClass('uum-name'):wikitext(nameWikitext(m))

	if m.desc then
		body:tag('div'):addClass('uum-desc'):wikitext(m.desc)
	end

	if m.color then
		local line = body:tag('div'):addClass('uum-line uum-color-line')
		line:tag('span'):addClass('uum-swatch'):css('background-color', m.color)
		line:tag('span'):wikitext(m.color)
	end

	if m.fanname then
		body:tag('div'):addClass('uum-line')
			:tag('span'):addClass('uum-label'):wikitext('Fan name:'):done()
			:wikitext(' ' .. m.fanname)
	end

	if m.oshimark then
		body:tag('div'):addClass('uum-line')
			:tag('span'):addClass('uum-label'):wikitext('Oshi mark:'):done()
			:wikitext(' ' .. m.oshimark)
	end

	body:tag('span')
		:addClass('uum-pill uum-status-' .. m.statusKey)
		:wikitext(m.statusDisplay)

	return card
end

local function renderFullimage(m)
	local card = mw.html.create('div')
		:addClass('uum-card uum-card-full')
	if m.dimmed then card:addClass('uum-dim') end

	local imgBox = card:tag('div'):addClass('uum-full-image')
	applyImageOpts(imgBox, m)
	local file = fileWikitext(m, '280x280px')
	if file then imgBox:wikitext(file) end

	if m.leader then leaderBadge(card) end

	card:tag('div')
		:addClass('uum-ribbon uum-status-' .. m.statusKey)
		:wikitext(m.statusDisplay)

	local overlay = card:tag('div'):addClass('uum-overlay')

	local nameLine = overlay:tag('div'):addClass('uum-full-name')
	nameLine:tag('span'):addClass('uum-dot'):css('background-color', m.color or FALLBACK_COLOR)
	nameLine:tag('span'):addClass('uum-name'):wikitext(nameWikitext(m))

	local extra = overlay:tag('div'):addClass('uum-extra')
	if m.desc then
		extra:tag('div'):addClass('uum-line'):wikitext(m.desc)
	end
	if m.fanname then
		extra:tag('div'):addClass('uum-line')
			:tag('span'):addClass('uum-label'):wikitext('Fan name:'):done()
			:wikitext(' ' .. m.fanname)
	end
	if m.oshimark then
		extra:tag('div'):addClass('uum-line')
			:tag('span'):addClass('uum-label'):wikitext('Oshi mark:'):done()
			:wikitext(' ' .. m.oshimark)
	end
	if m.color then
		extra:tag('div'):addClass('uum-line'):wikitext(m.color)
	end

	return card
end

local function renderCompact(m)
	local card = mw.html.create('div')
		:addClass('uum-card uum-card-compact')
		:css('border-left-color', m.color or FALLBACK_COLOR)
	if m.dimmed then card:addClass('uum-dim') end

	local imgBox = card:tag('div'):addClass('uum-compact-image')
	applyImageOpts(imgBox, m)
	local file = fileWikitext(m, '170x170px')
	if file then imgBox:wikitext(file) end

	local body = card:tag('div'):addClass('uum-compact-body')

	local nameLine = body:tag('div'):addClass('uum-name')
	nameLine:wikitext(nameWikitext(m))
	if m.leader then
		nameLine:tag('span')
			:addClass('uum-leader-inline')
			:attr('title', 'Leader')
			:wikitext(' 👑')
	end

	if m.desc then
		body:tag('div'):addClass('uum-desc'):wikitext(m.desc)
	end

	body:tag('div')
		:addClass('uum-status-text uum-status-' .. m.statusKey)
		:wikitext('● ' .. m.statusDisplay)

	local extra = body:tag('div'):addClass('uum-extra')
	if m.fanname then
		extra:tag('div'):addClass('uum-line')
			:tag('span'):addClass('uum-label'):wikitext('Fan name:'):done()
			:wikitext(' ' .. m.fanname)
	end
	if m.color then
		extra:tag('div'):addClass('uum-line'):wikitext(m.color)
	end

	return card
end

local RENDERERS = {
	default   = renderDefault,
	fullimage = renderFullimage,
	compact   = renderCompact,
}

-- Card width (border-box, px) and the max columns we ever allow per variant.
-- Must match the CSS: cards are fixed-width, container gap is 16px.
local METRICS = {
	default   = { w = 200, max = 4 },
	fullimage = { w = 200, max = 4 },
	compact   = { w = 250, max = 3 },
}

local GAP = 16

-- Balanced column count.
-- Evaluates every column count from 2..maxCols and picks the nicest layout:
--   1. Avoid stranding a single card alone on the last row, if avoidable.
--   2. Among the rest, use the fewest rows.
--   3. Tie-break on the fullest last row (so 6 -> 3/3, not 4/2).
-- Examples (maxCols=4):
--   5 -> 3/2 | 6 -> 3/3 | 7 -> 4/3 | 9 -> 3/3/3 | 10 -> 4/4/2
--   33 -> 3x11 (rather than 4/4/4/4/4/4/4/4/1)
-- Returns nil when everything fits in one row (no cap needed).
local function balancedCols(n, maxCols)
	if n <= maxCols then return nil end

	local candidates = {}
	for cols = 2, maxCols do
		local rows = math.ceil(n / cols)
		local last = n - (rows - 1) * cols -- cards on the final row
		candidates[#candidates + 1] = {
			cols   = cols,
			rows   = rows,
			orphan = (last == 1),
			empty  = cols - last, -- empty slots on the final row
		}
	end

	-- Prefer layouts without a lone trailing card, unless none exist
	-- (e.g. n=13 with maxCols=4 — every split leaves one over).
	local pool = {}
	for _, c in ipairs(candidates) do
		if not c.orphan then pool[#pool + 1] = c end
	end
	if #pool == 0 then pool = candidates end

	local best = pool[1]
	for _, c in ipairs(pool) do
		if c.rows < best.rows
			or (c.rows == best.rows and c.empty < best.empty)
		then
			best = c
		end
	end

	return best.cols
end

--------------------------------------------------------------------------------
-- Entry point
--------------------------------------------------------------------------------

function p.main(frame)
	-- Args come from the template call ({{UtaiteUnitMember|...}}), i.e. the
	-- parent frame. Fall back to direct #invoke args for previewing/testing.
	local parent = frame:getParent()
	local args = parent and parent.args or frame.args

	local variant = mw.ustring.lower(trim(args.variant) or 'default')
	if not RENDERERS[variant] then variant = 'default' end

	local members = getMembers(args)
	if #members == 0 then
		return '<span class="error">UtaiteUnitMember: no members given (name1= is required)</span>'
	end

	local root = mw.html.create('div')
		:addClass('uum-container')
		:addClass('uum-variant-' .. variant)

	-- Symmetric wrapping (non-legacy only; legacy renders one card per
	-- transclusion so the module can't see the full count). Cap the
	-- container width so flex-wrap breaks at a balanced column count.
	-- |perrow= overrides the automatic choice.
	if not members.legacy then
		local cols
		local perrow = tonumber(trim(args.perrow) or '')
		if perrow then
			cols = math.max(1, math.min(10, math.floor(perrow)))
		else
			cols = balancedCols(#members, METRICS[variant].max)
		end
		if cols then
			-- +8px slack against subpixel rounding causing an early wrap
			local width = cols * METRICS[variant].w + (cols - 1) * GAP + 8
			root:addClass('uum-balanced')
			root:css('max-width', width .. 'px')
		end
	end

	local render = RENDERERS[variant]
	for _, m in ipairs(members) do
		root:node(render(m))
	end

	local out = tostring(root)

	-- Legacy (unnumbered) syntax: tag the container and drop the page into a
	-- tracking category so remaining old-style transclusions can be found
	-- and migrated. Skip the category outside content namespaces (docs etc.).
	if members.legacy then
		root:addClass('uum-legacy')
		out = tostring(root)
		local title = mw.title.getCurrentTitle()
		if title.namespace == 0 then
			out = out .. '[[Category:Pages using legacy UtaiteUnitMember syntax]]'
		end
	end

	-- tostring(mw.html) emits no newlines, so this is safe inside wikitext
	-- (no accidental <p> wrapping / list parsing).
	return out
end

return p