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

local RS = '\30'
local FS = '\31'

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

--- Splits a |track= blob of {{Track}} records into track tables.
function p._parseRecords(blob)
  local tracks = {}
  for record in string.gmatch(blob or '', RS .. '([^' .. RS .. ']*)') do
    local track, i = {}, 1
    -- Trailing empty fields are preserved by appending a sentinel separator.
    for field in string.gmatch(record .. FS, '([^' .. FS .. ']*)' .. FS) do
      local key = RECORD_FIELDS[i]
      if key then
        track[key] = (key == 'n') and mw.text.trim(field) or p._clean(field)
      end
      i = i + 1
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

return p
