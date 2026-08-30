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

return p
