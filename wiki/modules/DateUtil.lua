-- Module:DateUtil
local p = {}

local function trim(s)
  if not s then return '' end
  return mw.text.trim(tostring(s))
end

function p.normalize(raw)
  local s = trim(raw)
  if s == '' then return '' end

  -- unify separators: . / whitespace → -
  s = s:gsub('[%./%s]', '-')
  s = s:gsub('%-+', '-') -- collapse multiple dashes

  -- YYYY-MM-DD
  local y, m, d = s:match('^(%d%d%d%d)%-(%d%d?)%-(%d%d?)$')
  if y then
    m = string.format('%02d', tonumber(m))
    d = string.format('%02d', tonumber(d))
    return string.format('%s-%s-%s', y, m, d)
  end

  -- YYYY-MM → assume day 01
  y, m = s:match('^(%d%d%d%d)%-(%d%d?)$')
  if y then
    m = string.format('%02d', tonumber(m))
    return string.format('%s-%s-01', y, m)
  end

  -- YYYY only → assume Jan 01
  y = s:match('^(%d%d%d%d)$')
  if y then
    return string.format('%s-01-01', y)
  end

  return '' -- unrecognized format
end

function p.year(raw)
  local s = trim(raw)
  if s == '' then return '' end

  -- Prefer normalized date if possible
  local n = p.normalize(s)
  if n ~= '' then
    return n:sub(1, 4)
  end

  -- Fallback: first 4-digit year in the raw string
  local y = s:match('(%d%d%d%d)')
  if y then
    local yi = tonumber(y)
    if yi and yi >= 1900 and yi <= 2100 then
      return y
    end
  end

  return ''
end

return p