-- Module:Album — unified album renderer.
-- Accepts three input dialects (t1*, legacy track1*, legacy {{Track}} records),
-- normalises them into one model, and renders card + tracklist + tabs.

local p = {}

--- Trims a value and treats editor placeholders as absent.
-- {{Track}} renders "N/A" for an empty credit, and editors have typed it
-- literally; left alone, a column of nothing but "N/A" would look populated.
function p._clean(v)
  v = mw.text.trim(v or '')
  if v == 'N/A' or v == '-' then return '' end
  return v
end

-- Album-level misspellings observed in live ns-0 wikitext.
local ALBUM_TYPOS = {
  crossfadeytid    = 'crossfadeyt',
  cossradenndid    = 'crossfadennd',
  crossdafenndid   = 'crossfadennd',
  crossfadend      = 'crossfadennd',
  daterealeased    = 'datereleased',
  releasedate      = 'datereleased',
  albumartist      = 'albumartist',
  jpshops          = 'jpshops',
  spotifyalbumid   = 'spotifyalbumid',
  officialjapptitle = 'officialjaptitle',
}

-- Misspelled stems of the per-track parameters, e.g. "trac9arranger".
local TRACK_STEMS = {
  trac = true, trakk = true, tracl = true, trach = true, track = true,
}
local FIELD_TYPOS = {
  lyrcist = 'lyricist', lyricst = 'lyricist', yricist = 'lyricist',
  arrange = 'arranger', arrangement = 'arranger', compsoser = 'composer',
  notes = 'info', note = 'info', singer = 'utaite', singers = 'utaite',
}

--- Maps a known misspelling to its canonical parameter name.
function p._canonical(key)
  local lower = string.lower(key or '')
  if ALBUM_TYPOS[lower] then return ALBUM_TYPOS[lower] end

  local stem, num, field = string.match(lower, '^(%a+)(%d+)(%a+)$')
  if stem and TRACK_STEMS[stem] then
    field = FIELD_TYPOS[field] or field
    return 'track' .. num .. field
  end

  return key
end

-- U+241E SYMBOL FOR RECORD SEPARATOR and U+241F SYMBOL FOR UNIT SEPARATOR,
-- as UTF-8 bytes. Real C0 control characters cannot be used here: MediaWiki
-- replaces U+001E/U+001F with U+FFFD during parsing, and the numeric entities
-- &#30;/&#31; survive expansion only as literal five-character text. These
-- printable symbols pass through template expansion unchanged, and are
-- conspicuous if a record ever escapes unparsed.
local RS = '\226\144\158'
local FS = '\226\144\159'

local RECORD_FIELDS = {
  'n', 'title', 'info', 'utaite', 'lyricist', 'composer', 'arranger', 'group',
}

--- True when |track= still holds pre-migration {{Track}} markup.
-- Template edits purge dependent pages lazily, so a cached page can deliver
-- old <tr> output to the new module. Detecting it lets us pass it through
-- rather than requiring the two template edits to be ordered.
function p._isLegacyHtml(blob)
  blob = blob or ''
  if string.find(blob, RS, 1, true) then return false end
  return string.find(blob, '<tr', 1, true) ~= nil
end

--- Splits `s` on the multi-byte literal `sep`.
-- Lua patterns cannot express a negated multi-byte character class, so the
-- separators are matched with plain finds rather than `[^sep]`.
local function splitPlain(s, sep)
  local parts, pos = {}, 1
  while true do
    local a, b = string.find(s, sep, pos, true)
    if not a then
      parts[#parts + 1] = string.sub(s, pos)
      return parts
    end
    parts[#parts + 1] = string.sub(s, pos, a - 1)
    pos = b + 1
  end
end

--- Splits a |track= blob of {{Track}} records into track tables.
function p._parseRecords(blob)
  local tracks = {}
  local records = splitPlain(blob or '', RS)
  -- Element 1 is whatever preceded the first separator, which is not a record.
  for i = 2, #records do
    local fields = splitPlain(records[i], FS)
    local track = {}
    for j, key in ipairs(RECORD_FIELDS) do
      local value = fields[j] or ''
      track[key] = (key == 'n') and mw.text.trim(value) or p._clean(value)
    end
    if track.title and track.title ~= '' then
      tracks[#tracks + 1] = track
    end
  end
  return tracks
end

local TRACK_FIELDS = {
  'title', 'info', 'utaite', 'lyricist', 'composer', 'arranger', 'group',
}

--- Reads one track's fields for index `idx` under a given prefix.
local function readTrack(norm, prefix, idx)
  local track = { n = tostring(idx) }
  local any = false
  for _, field in ipairs(TRACK_FIELDS) do
    local v = p._clean(norm[prefix .. idx .. field])
    track[field] = v
    if v ~= '' then any = true end
  end
  if track.utaite == '' then
    track.utaite = p._clean(norm[prefix .. idx .. 'singers'])
  end
  return track, any
end

--- Normalises every argument key once, repairing known misspellings.
local function normaliseArgs(args)
  local norm = {}
  for k, v in pairs(args) do
    if type(k) == 'string' then
      norm[p._canonical(k)] = v
    else
      norm[k] = v
    end
  end
  return norm
end

--- Builds the ordered track list from whichever dialect `args` uses.
function p._collectTracks(args)
  local norm = normaliseArgs(args)

  local blob = norm.track
  if blob and blob ~= '' then
    if p._isLegacyHtml(blob) then return {} end
    return p._parseRecords(blob)
  end

  -- Scan for the highest populated index rather than stopping at the first
  -- gap; Template:Album's stop-at-gap behaviour silently drops later tracks.
  local indices, seen = {}, {}
  for key in pairs(norm) do
    if type(key) == 'string' then
      local prefix, idx = string.match(key, '^(t)(%d+)title$')
      if not prefix then prefix, idx = string.match(key, '^(track)(%d+)title$') end
      if prefix and not seen[prefix .. idx] then
        seen[prefix .. idx] = true
        indices[#indices + 1] = { prefix = prefix, idx = tonumber(idx) }
      end
    end
  end

  table.sort(indices, function(a, b) return a.idx < b.idx end)

  local tracks = {}
  for _, entry in ipairs(indices) do
    local track, any = readTrack(norm, entry.prefix, entry.idx)
    if any then tracks[#tracks + 1] = track end
  end
  return tracks
end

-- Always rendered. Utaite is pinned because {{Track}} falls back to the page's
-- own singer when the field is blank, so the column is never actually empty.
local SPINE = { '#', 'Title', 'Utaite', 'Lyricist', 'Composer' }

--- Returns the column names this album has earned.
function p._columns(tracks)
  local cols = {}
  for _, name in ipairs(SPINE) do cols[#cols + 1] = name end

  local hasArranger, hasGroup = false, false
  for _, t in ipairs(tracks or {}) do
    if p._clean(t.arranger) ~= '' then hasArranger = true end
    if p._clean(t.group) ~= '' then hasGroup = true end
  end

  if hasArranger then cols[#cols + 1] = 'Arranger' end
  if hasGroup then cols[#cols + 1] = 'Group' end
  return cols
end

local ROLES = {
  { label = 'lyrics',  field = 'lyricist' },
  { label = 'music',   field = 'composer' },
  { label = 'arrange', field = 'arranger' },
}

--- Builds a credit line, merging roles performed by the same person.
-- Restores behaviour Template:Album has and AlbumType2 lost: when the
-- lyricist and composer are the same person, name them once.
function p._credit(track)
  local order, byName = {}, {}
  for _, role in ipairs(ROLES) do
    local who = p._clean(track[role.field])
    if who ~= '' then
      if not byName[who] then
        byName[who] = {}
        order[#order + 1] = who
      end
      local roles = byName[who]
      roles[#roles + 1] = role.label
    end
  end

  local parts = {}
  for _, who in ipairs(order) do
    parts[#parts + 1] = table.concat(byName[who], ', ') .. ': ' .. who
  end
  return table.concat(parts, ' \194\183 ')
end

--- Splits tracks into runs of equal group value, in source order.
function p._sections(tracks)
  local sections, current = {}, nil
  for _, t in ipairs(tracks or {}) do
    local label = p._clean(t.group)
    if not current or current.label ~= label then
      current = { label = label, tracks = {} }
      sections[#sections + 1] = current
    end
    current.tracks[#current.tracks + 1] = t
  end
  return sections
end

--- Decides how `group` should be rendered for this album.
-- `group` carries two meanings in live data: a disc/edition partition whose
-- values form contiguous runs (19 of 26 albums), and a per-track tag whose
-- values interleave (7 of 26). Sectioning the latter shatters the list.
function p._groupMode(tracks, override)
  local any = false
  for _, t in ipairs(tracks or {}) do
    if p._clean(t.group) ~= '' then any = true break end
  end
  if not any then return 'none' end

  override = p._clean(override)
  if override == 'section' or override == 'badge' or override == 'column' then
    return override
  end

  local runs = {}
  for _, section in ipairs(p._sections(tracks)) do
    runs[section.label] = (runs[section.label] or 0) + 1
    if runs[section.label] > 1 then return 'badge' end
  end
  return 'section'
end

-- Below this many rows a table is plain markup with no DataTables instance.
-- Measured: 67% of live tracklists have 10 rows or fewer, yet all 783 boot
-- DataTables with pagination and search panes today.
local FILTER_THRESHOLD = 15

local COLUMN_FIELD = {
  ['#'] = 'n', Title = 'title', Utaite = 'utaite', Lyricist = 'lyricist',
  Composer = 'composer', Arranger = 'arranger', Group = 'group',
}

local function attr(name, value)
  return ' ' .. name .. '="' .. value .. '"'
end

local function renderRow(track, columns, opts, mode)
  local cells = {}
  for _, col in ipairs(columns) do
    local field = COLUMN_FIELD[col]
    local value = (field == 'n') and mw.text.trim(track.n or '') or p._clean(track[field])

    if field == 'utaite' and value == '' then
      value = opts.root or ''
    end
    if field == 'title' then
      local info = p._clean(track.info)
      if info ~= '' then
        value = value .. ' <span class="album-track-info">' .. info .. '</span>'
      end
      if mode == 'badge' and p._clean(track.group) ~= '' then
        value = value .. ' <span class="album-track-badge">' .. p._clean(track.group) .. '</span>'
      end
      -- The merged credit line rides inside the title cell rather than in a
      -- column of its own, so the column count stays stable for DataTables.
      -- CSS hides it on desktop and reveals it on mobile, where the separate
      -- credit columns are hidden instead.
      local credit = p._credit(track)
      if credit ~= '' then
        value = value .. '<span class="album-track-credit">' .. credit .. '</span>'
      end
    end
    if value == '' and field ~= 'n' and field ~= 'title' then
      value = '&mdash;'
    end

    local class = (field == 'n') and ' class="album-track-n"' or ''
    cells[#cells + 1] = '<td' .. class .. '>' .. value .. '</td>'
  end
  return '<tr>' .. table.concat(cells) .. '</tr>'
end

local function renderTable(rows, columns, opts, mode, useFilter)
  local classes = 'wikitable album-track-table'
  local extra = ''
  if useFilter then
    classes = classes .. ' dataTable'
    extra = attr('data-page-length', '25') .. attr('data-order', '[[0, "asc"]]')
  end

  local heads = {}
  for _, col in ipairs(columns) do
    heads[#heads + 1] = '<th scope="col">' .. col .. '</th>'
  end

  local body = {}
  for _, track in ipairs(rows) do
    body[#body + 1] = renderRow(track, columns, opts, mode)
  end

  return '<table' .. attr('class', classes) .. extra .. '>'
    .. '<thead><tr>' .. table.concat(heads) .. '</tr></thead>'
    .. '<tbody>' .. table.concat(body) .. '</tbody></table>'
end

--- Renders the tracklist: one table per section, headers between tables.
function p._renderTracklist(tracks, opts)
  opts = opts or {}
  tracks = tracks or {}
  if #tracks == 0 then
    return '<div class="album-track-empty">No tracks available yet</div>'
  end

  local mode = p._groupMode(tracks, opts.groupstyle)
  local columns = p._columns(tracks)

  -- Group is shown as a section header or an in-row badge, not a column,
  -- unless explicitly overridden.
  if mode ~= 'column' then
    for i = #columns, 1, -1 do
      if columns[i] == 'Group' then table.remove(columns, i) end
    end
  end

  local sectioned = (mode == 'section')
  local useFilter
  if opts.tablefilter == 'never' then
    useFilter = false
  elseif opts.tablefilter == 'always' then
    useFilter = true
  else
    useFilter = (not sectioned) and #tracks > FILTER_THRESHOLD
  end

  if not sectioned then
    return '<div class="album-tracklist">'
      .. renderTable(tracks, columns, opts, mode, useFilter)
      .. '</div>'
  end

  local parts = { '<div class="album-tracklist" data-sectioned="true">' }
  for _, section in ipairs(p._sections(tracks)) do
    parts[#parts + 1] = '<div class="album-track-section">'
      .. '<span class="album-track-section-label">' .. section.label .. '</span>'
      .. '<span class="album-track-section-count">' .. #section.tracks .. ' tracks</span>'
      .. '</div>'
    parts[#parts + 1] = renderTable(section.tracks, columns, opts, mode, false)
  end
  parts[#parts + 1] = '</div>'
  return table.concat(parts)
end

-- Covers are effectively always 1:1. An explicit pixel width is used instead
-- of |thumb| because thumb size follows each reader's own preference, which
-- is why the current desktop cover can be cropped by overflow:hidden.
local COVER_WIDTH = '220px'

local META_ROWS = {
  { label = 'Released',  key = 'datereleased' },
  { label = 'Label',     key = 'label' },
  { label = 'Featuring', key = 'singers' },
  { label = 'Catalog',   key = 'catalognumber' },
  { label = 'Artwork',   key = 'albumartist' },
}

local function displayTitle(args)
  local title = p._clean(args.albumtitle)
  if title ~= '' then return title end
  for _, key in ipairs({ 'officialjaptitle', 'officialromtitle', 'officialengtitle' }) do
    local v = p._clean(args[key])
    if v ~= '' then return v end
  end
  return '<span class="album-error">albumtitle field must be filled</span>'
end

--- Renders the cover box and the metadata grid.
function p._renderCard(args)
  args = args or {}

  local image = p._clean(args.image)
  if image == '' then image = 'Template doc.png' end
  local link = p._clean(args.imagelink)
  local linkPart = (link ~= '') and ('|link=' .. link) or ''
  local cover = '[[File:' .. image .. '|' .. COVER_WIDTH .. '|alt=' .. displayTitle(args) .. linkPart .. ']]'

  local rows = {}
  for _, row in ipairs(META_ROWS) do
    local value = p._clean(args[row.key])
    if value ~= '' then
      rows[#rows + 1] = '<dt>' .. row.label .. '</dt><dd>' .. value .. '</dd>'
    end
  end

  local sub = {}
  for _, key in ipairs({ 'officialromtitle', 'officialengtitle' }) do
    local v = p._clean(args[key])
    if v ~= '' and v ~= displayTitle(args) then sub[#sub + 1] = v end
  end

  return '<div class="album-row">'
    .. '<div class="album-cover">' .. cover .. '</div>'
    .. '<div class="album-details">'
    .. '<div class="album-title">' .. displayTitle(args) .. '</div>'
    .. (#sub > 0 and ('<div class="album-subtitle">' .. table.concat(sub, ' \194\183 ') .. '</div>') or '')
    .. '<dl class="album-meta">' .. table.concat(rows) .. '</dl>'
    .. '</div></div>'
end

local LEGACY_COLUMNS = 7

--- Wraps pre-migration {{Track}} markup in a fixed-column table, unchanged.
local function renderLegacy(blob)
  return '<div class="album-tracklist album-track-legacy">'
    .. '<table class="wikitable album-track-table"><tbody>' .. blob .. '</tbody></table>'
    .. '</div>'
end

--- Builds every renderable piece of the album. Frame-free so it stays testable.
function p._build(args, root)
  args = args or {}

  local tracks = p._collectTracks(args)
  local tracklist
  local blob = args.track
  if blob and blob ~= '' and p._isLegacyHtml(blob) then
    tracklist = renderLegacy(blob)
  else
    tracklist = p._renderTracklist(tracks, {
      groupstyle = args.groupstyle,
      tablefilter = args.tablefilter,
      root = root,
    })
  end

  local tabs = {
    { label = 'Tracklist', content = tracklist },
  }

  local gallery = p._clean(args.gallery)
  if gallery ~= '' and p._clean(args.suppressacg) ~= 'true' then
    tabs[#tabs + 1] = { label = 'Cover Art', content = '<div class="album-art">' .. gallery .. '</div>' }
  end

  local jpshops, shops = p._clean(args.jpshops), p._clean(args.shops)
  if jpshops ~= '' or shops ~= '' then
    local parts = { '<div class="album-shops">' }
    if jpshops ~= '' then
      parts[#parts + 1] = '<h4>Japan Only</h4><div class="shop-links">' .. jpshops .. '</div>'
    end
    if shops ~= '' then
      parts[#parts + 1] = '<h4>International</h4><div class="shop-links">' .. shops .. '</div>'
    end
    parts[#parts + 1] = '</div>'
    tabs[#tabs + 1] = { label = 'Shops & Downloads', content = table.concat(parts) }
  end

  local streams, spotify = p._clean(args.streams), p._clean(args.spotifyalbumid)
  if streams ~= '' or spotify ~= '' then
    tabs[#tabs + 1] = {
      label = 'Streaming',
      content = '<div class="album-streams">' .. streams .. '</div>',
    }
  end

  local yt = p._clean(args.crossfadeyt)
  if yt ~= '' then
    tabs[#tabs + 1] = { label = 'YT Crossfade', content = '<div class="album-crossfade">' .. yt .. '</div>' }
  end

  local nnd = p._clean(args.crossfadennd)
  if nnd ~= '' then
    tabs[#tabs + 1] = { label = 'NND Crossfade', content = '<div class="album-crossfade">' .. nnd .. '</div>' }
  end

  return { card = p._renderCard(args), tracklist = tracklist, tabs = tabs }
end

--- Entry point. The only frame-aware function.
function p.main(frame)
  local args = require('Module:Arguments').getArgs(frame)
  local root = mw.title.getCurrentTitle().rootText
  local built = p._build(args, root)

  local tabber = ''
  for _, tab in ipairs(built.tabs) do
    tabber = tabber .. '|-|' .. tab.label .. '=\n' .. tab.content .. '\n'
  end

  return built.card
    .. frame:extensionTag('tabber', tabber, { class = 'wds-tabber dev-tabber album-tabs' })
end

return p
