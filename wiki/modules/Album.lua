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

return p
