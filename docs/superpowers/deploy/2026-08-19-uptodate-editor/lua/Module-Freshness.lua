-- Thin mw glue: marshals frame args / subpage content into core.decide + core.render.
local core = require('Module:Freshness/core')
local p = {}

local function now_table()
  local t = os.date('!*t')
  return { year = t.year, month = t.month, day = t.day }
end

local function meta_html(frame, params)
  local editor
  if params.customlatesteditor and params.customlatesteditor ~= "" then
    editor = params.customlatesteditor
  else
    editor = "[[User:{{REVISIONUSER}}|{{REVISIONUSER}}]]"
  end
  local edited
  if params["lastedittext-nolink"] == "true" then
    edited = "last edited"
  else
    edited = "[{{fullurl:{{FULLPAGENAME}}|diff=cur}} last edited]"
  end
  return frame:preprocess(
    '<div class="freshness-meta"><span class="plainlinks">This page was ' .. edited
    .. ' by ' .. editor .. '. <span class="freshness-purge">'
    .. '([{{fullurl:{{FULLPAGENAMEE}}|action=purge}} Purge])</span></span></div>')
end

local function emit(frame, params)
  local state = core.decide(params, now_table())
  -- #invoke output is NOT re-parsed for template calls, so the category wikitext
  -- (which uses {{ForAllUtaite|...}}) must be expanded here via frame:preprocess,
  -- otherwise it renders as raw "{{ForAllUtaite|...}}" text on the page.
  return core.render(state, meta_html(frame, params)) .. frame:preprocess(core.categories(state))
end

function p.render(frame)
  local a = frame:getParent().args
  local params = {
    date = a[1],
    base = (a.base ~= nil and a.base ~= "") and a.base or a.bordercolor,
    force = (a['force-outdated'] == 'yes') or (a.status == 'outdated'),
    pin = (a['force-uptodate'] == 'yes'),
    reason = a.reason,
    discography = a.discography,
    nocat = a.nocat,
    needrom = a.needrom,
    customlatesteditor = a.customlatesteditor,
    ['lastedittext-nolink'] = a['lastedittext-nolink'],
  }
  return emit(frame, params)
end

function p.fromSubpage(frame)
  local root = mw.title.getCurrentTitle().rootText
  local sub = mw.title.new(root .. '/Songs')
  if not sub or not sub.exists then return '' end
  local params = core.from_subpage_params(sub:getContent() or '')
  if not params then return '' end
  return emit(frame, params)
end

return p