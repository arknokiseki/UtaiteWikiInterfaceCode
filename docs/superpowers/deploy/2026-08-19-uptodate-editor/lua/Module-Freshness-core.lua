-- Pure logic for the Freshness box. No `mw` dependency: unit-tested via lupa,
-- and required by Module:Freshness on-wiki.
local core = {}

core.BASE_DEFAULT = "#c3e6f9"
core.GREY         = "#9a9a9a"
core.FADE_MAX     = 30
core.FRESH_MAX    = 6
core.AGING_MAX    = 18
core.LABELS = { fresh = "Up to date", aging = "Slightly outdated", outdated = "Outdated" }
-- Header label for a pinned list. It replaces "Up to date" in the box header
-- rather than adding a sentence to the body, so the status reads at a glance.
core.LABEL_PINNED = "Marked as completed"
core.ICONS  = { fresh = "fa-circle-check", aging = "fa-clock", outdated = "fa-triangle-exclamation" }
core.CTA    = "Spot missing covers? Help by updating the list."

local function clamp(x, lo, hi)
  if x < lo then return lo elseif x > hi then return hi else return x end
end
local function round(x) return math.floor(x + 0.5) end

function core.is_hex(s)
  return type(s) == "string" and s:match("^#?%x%x%x%x%x%x$") ~= nil
end

-- Conservative allowlist of CSS colour syntaxes we are willing to emit into an
-- inline style attribute. Anything that could break out of the attribute is
-- rejected here; MediaWiki's sanitizer is a second line of defence, not the first.
function core.is_css_color(s)
  if type(s) ~= "string" then return false end
  s = s:gsub("^%s+", ""):gsub("%s+$", "")
  if s == "" then return false end
  -- Plain substring search (4th arg true), not a pattern, so this security
  -- check has no escaping subtleties. Parentheses are deliberately allowed:
  -- var(), rgb() and hsl() need them.
  for _, bad in ipairs({ ";", "{", "}", "<", ">", '"', "'", "\\" }) do
    if s:find(bad, 1, true) then return false end
  end
  local low = s:lower()
  if low:find("expression") or low:find("javascript") or low:find("url") then return false end
  if s:match("^#%x%x%x$") or s:match("^#%x%x%x%x$")
     or s:match("^#%x%x%x%x%x%x$") or s:match("^#%x%x%x%x%x%x%x%x$") then return true end
  if s:match("^%a[%w%-]*$") then return true end                       -- magenta, rebeccapurple
  if s:match("^var%(%s*%-%-[%w%-]+%s*%)$") then return true end         -- var(--x)
  if s:match("^var%(%s*%-%-[%w%-]+%s*,[^()]*%)$") then return true end  -- var(--x, fallback)
  if s:match("^rgba?%([%d%s%.,%%/]*%)$") then return true end
  if s:match("^hsla?%([%d%s%.,%%/deg]*%)$") then return true end
  return false
end

-- Fades an arbitrary CSS colour toward grey in the browser, since Lua cannot
-- resolve var() or a named colour to RGB. The percentage is still computed here,
-- so the ageing curve matches core.fade exactly.
function core.mix(css, months)
  local f = clamp(months / core.FADE_MAX, 0, 1)
  return "color-mix(in srgb, " .. css .. " " .. round((1 - f) * 100) .. "%, " .. core.GREY .. ")"
end

function core.hex_to_rgb(hex)
  hex = hex:gsub("#", "")
  return tonumber(hex:sub(1, 2), 16), tonumber(hex:sub(3, 4), 16), tonumber(hex:sub(5, 6), 16)
end

function core.rgb_to_hex(r, g, b)
  return string.format("#%02x%02x%02x", round(r), round(g), round(b))
end

function core.fade(hex, months)
  local f = clamp(months / core.FADE_MAX, 0, 1)
  local br, bg, bb = core.hex_to_rgb(hex)
  local gr, gg, gb = core.hex_to_rgb(core.GREY)
  return core.rgb_to_hex(br + (gr - br) * f, bg + (gg - bg) * f, bb + (gb - bb) * f)
end

local MONTHS = {
  january = 1, february = 2, march = 3, april = 4, may = 5, june = 6,
  july = 7, august = 8, september = 9, october = 10, november = 11, december = 12,
  jan = 1, feb = 2, mar = 3, apr = 4, jun = 6, jul = 7, aug = 8,
  sep = 9, sept = 9, oct = 10, nov = 11, dec = 12,
}

function core.parse_date(s)
  if not s or s == "" then return nil end
  s = s:gsub("^%s+", ""):gsub("%s+$", "")
  -- Japanese YYYY年M月D日
  local y, m, d = s:match("(%d+)%s*年%s*(%d+)%s*月%s*(%d+)")
  if y then return tonumber(y), tonumber(m), tonumber(d) end
  -- Numeric YYYY <sep> MM <sep> DD
  y, m, d = s:match("(%d%d%d%d)[%.%-/](%d%d?)[%.%-/](%d%d?)")
  if y then return tonumber(y), tonumber(m), tonumber(d) end
  -- "Month DD[st], YYYY" (ordinal suffix and comma optional)
  local mon, day, yr = s:match("(%a+)%s+(%d+)%a-,?%s+(%d%d%d%d)")
  if mon then
    local mm = MONTHS[mon:lower()]
    if mm then return tonumber(yr), mm, tonumber(day) end
  end
  return nil
end

function core.months_between(y1, m1, d1, y2, m2, d2)
  local months = (y2 - y1) * 12 + (m2 - m1)
  if d2 < d1 then months = months - 1 end
  return months
end

function core.classify(months)
  if months < core.FRESH_MAX then return "fresh"
  elseif months < core.AGING_MAX then return "aging"
  else return "outdated" end
end

function core.meter(months)
  local f = months / core.FADE_MAX
  if f < 0 then f = 0 elseif f > 1 then f = 1 end
  local pct = math.floor((1 - f) * 100 + 0.5)
  if pct < 3 then pct = 3 end
  return pct
end

function core.ago(months)
  if not months then return "" end
  if months < 1 then return "this month" end
  if months < 12 then return months .. (months == 1 and " month ago" or " months ago") end
  local y = math.floor(months / 12)
  local mm = months % 12
  local s = y .. (y == 1 and " year" or " years")
  if mm > 0 then s = s .. " " .. mm .. " mo" end
  return s .. " ago"
end

-- params: date, base, force(bool), reason, discography, nocat, needrom
-- now:    { year=, month=, day= }
function core.decide(params, now)
  -- Hex is faded numerically here, exactly as it always has been, so existing
  -- pages do not shift. Other valid CSS colours (var(--x), X11 names, rgb())
  -- cannot be resolved to RGB in Lua, so their fade is handed to the browser
  -- via color-mix(). Anything unrecognised still falls back to the default.
  local raw = params.base
  local base = (raw and core.is_hex(raw)) and raw or core.BASE_DEFAULT
  local css = nil
  if raw and not core.is_hex(raw) and core.is_css_color(raw) then css = raw end
  local y, mo, d = core.parse_date(params.date)
  local dated = (y ~= nil)
  local months = nil
  if dated then
    months = core.months_between(y, mo, d, now.year, now.month, now.day)
    if months < 0 then months = 0 end
  end
  local reason = (params.reason and params.reason ~= "") and params.reason or nil
  local forced = (params.force == true) or (reason ~= nil) or (not dated)
  -- A pin marks a list complete for a singer who is no longer active, so it
  -- must stop ageing. An explicit outdated flag still wins over a pin.
  local pinned = (params.pin == true) and dated and not forced

  local tier
  if forced then tier = "outdated"
  elseif pinned then tier = "fresh"
  else tier = core.classify(months) end
  
  local color
  if forced then
    color = core.GREY
  elseif pinned then
    color = css or base            -- pinned pages keep the colour at full strength
  elseif css then
    color = core.mix(css, months)
  else
    color = core.fade(base, months)
  end

  local state = {
    base = base, dated = dated, forced = forced, months = months,
    tier = tier,
    label = pinned and core.LABEL_PINNED or core.LABELS[tier],
    icon = core.ICONS[tier],
    pinned = pinned,
    color = color,
    meter = forced and 3 or (pinned and 100 or core.meter(months)),
    category = (tier == "fresh") and "up-to-date" or "outdated",
    reason = reason, date = params.date,
    discography = params.discography, nocat = params.nocat, needrom = params.needrom,
  }
  return state
end

local function esc_none(s) return s or "" end

function core.render(state, meta_html)
  local c = state.color
  local ago = state.months and core.ago(state.months) or ""
  local line
  if state.reason then
    line = state.reason
  elseif state.forced and state.dated then
    line = "Last updated <b>" .. esc_none(state.date) .. "</b>. Flagged as outdated."
  elseif state.forced then
    line = "This song list is flagged as outdated."
  else
    line = "Song list last updated <b>" .. esc_none(state.date) .. "</b>."
  end
  if state.discography and state.discography ~= "" then
    line = line:gsub("[Ss]ong list", "song list and discography")
  end

  local p = {}
  p[#p + 1] = '<div class="freshness-box" style="border-color:' .. c .. '">'
  p[#p + 1] =   '<div class="freshness-head" style="background:' .. c .. '">'
  p[#p + 1] =     '<span class="freshness-ic fa-solid ' .. state.icon .. '"></span>'
  p[#p + 1] =     '<span class="freshness-label">' .. state.label .. '</span>'
  if ago ~= "" then p[#p + 1] = '<span class="freshness-ago">' .. ago .. '</span>' end
  p[#p + 1] =   '</div>'
  p[#p + 1] =   '<div class="freshness-body">'
  p[#p + 1] =     '<div class="freshness-line">' .. line .. '</div>'
  p[#p + 1] =     '<div class="freshness-meter"><div class="freshness-fill" style="width:'
                    .. state.meter .. '%;background:' .. c .. '"></div></div>'
  p[#p + 1] =     '<div class="freshness-cta">' .. core.CTA .. '</div>'
  if meta_html and meta_html ~= "" then p[#p + 1] = meta_html end
  p[#p + 1] =   '</div>'
  p[#p + 1] = '</div>'
  return table.concat(p)
end

function core.categories(state)
  if state.nocat == true or state.nocat == "true" then return "" end
  local cat
  if state.category == "up-to-date" then
    cat = "{{ForAllUtaite|[[Category:Utaite with up-to-date covered song list]]"
       .. "|[[Category:Youtaite with up-to-date covered song list]]}}"
  else
    cat = "{{ForAllUtaite|[[Category:Utaite with outdated covered song list]]"
       .. "|[[Category:Youtaite with outdated covered song list]]}}"
  end
  if state.needrom == true or state.needrom == "true" then
    cat = cat .. "[[Category:Songlists requiring romanization]]"
  end
  return cat
end

function core.split_params(body)
  local out = { pos = {} }
  local idx = 0
  for raw in (body .. "|"):gmatch("(.-)|") do
    local field = (raw:gsub("^%s+", ""):gsub("%s+$", ""))
    idx = idx + 1
    if field ~= "" then
      local k, v = field:match("^([%w%-_]+)%s*=%s*(.*)$")
      if k then out[k] = v else out.pos[idx] = field end
    end
  end
  out.date = out.pos[1]
  return out
end

function core.from_subpage_params(text)
  text = text:gsub("<!%-%-.-%-%->", "")
  local specs = { { name = "[Oo]utdated", force = true }, { name = "[Uu]ptodate", force = false } }
  for _, spec in ipairs(specs) do
    local body = text:match("{{%s*" .. spec.name .. "%s*|([^}]*)}}")
    local bare = text:match("{{%s*" .. spec.name .. "%s*}}")
    if body or bare then
      local params = core.split_params(body or "")
      params.base = params.base or params.bordercolor
      if spec.force then params.force = true end
      return params
    end
  end
  return nil
end

return core