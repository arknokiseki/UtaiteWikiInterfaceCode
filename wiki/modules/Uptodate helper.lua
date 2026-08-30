--[[
    Module:Uptodate helper
    Compares revision timestamps of multiple pages and returns data
    for the most recently edited one.
    
    Usage:
        {{#invoke:Uptodate helper|main|Page1|Page2|time=18:00|bordercolor=...}}
        {{#invoke:Uptodate helper|date|Page1|Page2}}
        {{#invoke:Uptodate helper|user|Page1|Page2}}
        {{#invoke:Uptodate helper|userlink|Page1|Page2}}
]]

local p = {}

--------------------------------------------------------------------------------
-- INTERNAL HELPER FUNCTIONS
--------------------------------------------------------------------------------

--- Fetches revision info for a single page.
-- @param frame  The current frame object.
-- @param pageName  The title of the page to query.
-- @return A table with page, timestamp, unixTime, user; or nil if page doesn't exist.
local function getRevisionInfo(frame, pageName)
    local timestamp = frame:callParserFunction('REVISIONTIMESTAMP', pageName)
    
    -- If no timestamp, the page likely doesn't exist
    if not timestamp or timestamp == '' then
        return nil
    end
    
    local user = frame:callParserFunction('REVISIONUSER', pageName)
    local unixTimeStr = frame:callParserFunction('#time', {'U', timestamp})
    local unixTime = tonumber(unixTimeStr) or 0
    
    return {
        page = pageName,
        timestamp = timestamp,
        unixTime = unixTime,
        user = user or ''
    }
end

--- Compares pages and finds the one with the latest revision.
-- @param frame  The current frame object.
-- @param pages  A list of page titles.
-- @return Revision info table for the page with the newest edit.
local function getLatest(frame, pages)
    local latest = nil
    
    for _, pageName in ipairs(pages) do
        local info = getRevisionInfo(frame, pageName)
        if info then
            -- Use > so the FIRST page wins on a tie (matches original #ifeq behavior)
            if latest == nil or info.unixTime > latest.unixTime then
                latest = info
            end
        end
    end
    
    return latest
end

--- Parses page arguments from the frame.
-- Checks both direct args and parent args (for template transclusion).
-- @param frame  The current frame object.
-- @return A list of page titles.
local function getPages(frame)
    local args = frame.args
    local parentArgs = frame:getParent() and frame:getParent().args or {}
    local pages = {}
    
    -- Support up to 10 pages
    for i = 1, 10 do
        local page = args[i] or parentArgs[i]
        if page and mw.text.trim(page) ~= '' then
            table.insert(pages, mw.text.trim(page))
        end
    end
    
    return pages
end

--- Helper to get a named argument, checking both sources.
local function getArg(frame, name, default)
    local args = frame.args
    local parentArgs = frame:getParent() and frame:getParent().args or {}
    local value = args[name] or parentArgs[name]
    
    if value and mw.text.trim(value) ~= '' then
        return mw.text.trim(value)
    end
    return default
end

--------------------------------------------------------------------------------
-- PUBLIC FUNCTIONS
--------------------------------------------------------------------------------

--- Main entry point: Outputs the fully rendered {{Uptodate}} template.
-- @usage {{#invoke:Uptodate helper|main|Page1|Page2|bordercolor=...|utdcolor=...}}
function p.main(frame)
    local pages = getPages(frame)
    
    if #pages == 0 then
        return '<span class="error">Error: No pages specified for Module:Uptodate helper</span>'
    end
    
    local latest = getLatest(frame, pages)
    
    if not latest then
        return '<span class="error">Error: Could not retrieve revision data for any specified page.</span>'
    end
    
    -- Get the formatted date using the existing {{LastRevision}} template
    local date = frame:expandTemplate{
        title = 'LastRevision',
        args = { latest.page }
    }
    
    -- Build arguments for {{Uptodate}}
    local uptodateArgs = {
        [1] = date,
        [3] = getArg(frame, 'time', nil),
        bordercolor = getArg(frame, 'bordercolor', nil),
        utdcolor = getArg(frame, 'utdcolor', nil),
        customlatesteditor = '[[User:' .. latest.user .. '|' .. latest.user .. ']]',
        nocat = getArg(frame, 'nocat', nil),
        discography = getArg(frame, 'discography', nil),
        needrom = getArg(frame, 'needrom', nil),
        ['lastedittext-nolink'] = getArg(frame, 'lastedittext-nolink', nil)
    }
    
    -- Expand and return the Uptodate template
    return frame:expandTemplate{
        title = 'Uptodate',
        args = uptodateArgs
    }
end

--- Returns just the page title with the latest revision.
-- @usage {{#invoke:Uptodate helper|page|Page1|Page2}}
function p.page(frame)
    local pages = getPages(frame)
    if #pages == 0 then return '' end
    
    local latest = getLatest(frame, pages)
    return latest and latest.page or ''
end

--- Returns just the username of the last editor.
-- @usage {{#invoke:Uptodate helper|user|Page1|Page2}}
function p.user(frame)
    local pages = getPages(frame)
    if #pages == 0 then return '' end
    
    local latest = getLatest(frame, pages)
    return latest and latest.user or ''
end

--- Returns a formatted wikilink to the user page.
-- @usage {{#invoke:Uptodate helper|userlink|Page1|Page2}}
function p.userlink(frame)
    local pages = getPages(frame)
    if #pages == 0 then return '' end
    
    local latest = getLatest(frame, pages)
    if latest and latest.user ~= '' then
        return '[[User:' .. latest.user .. '|' .. latest.user .. ']]'
    end
    return ''
end

--- Returns the formatted date via {{LastRevision}}.
-- @usage {{#invoke:Uptodate helper|date|Page1|Page2}}
function p.date(frame)
    local pages = getPages(frame)
    if #pages == 0 then return '' end
    
    local latest = getLatest(frame, pages)
    if latest then
        return frame:expandTemplate{
            title = 'LastRevision',
            args = { latest.page }
        }
    end
    return ''
end

--- Returns the relative time of the latest revision (e.g., "2 days ago").
-- @usage {{#invoke:Uptodate helper|relativetime|Page1|Page2}}
function p.relativetime(frame)
    local pages = getPages(frame)
    if #pages == 0 then return '' end
    
    local latest = getLatest(frame, pages)
    if not latest or latest.unixTime == 0 then return '' end
    
    -- Calculate difference in seconds between now and the revision time
    local diff = os.time() - latest.unixTime
    
    -- Prevent negative times in case of minor server clock desyncs
    if diff < 0 then diff = 0 end
    
    -- Format into human-readable relative time
    if diff < 60 then
        return diff .. " second" .. (diff == 1 and "" or "s") .. " ago"
    elseif diff < 3600 then
        local mins = math.floor(diff / 60)
        return mins .. " minute" .. (mins == 1 and "" or "s") .. " ago"
    elseif diff < 86400 then
        local hours = math.floor(diff / 3600)
        return hours .. " hour" .. (hours == 1 and "" or "s") .. " ago"
    elseif diff < 2592000 then -- Approx 30 days
        local days = math.floor(diff / 86400)
        return days .. " day" .. (days == 1 and "" or "s") .. " ago"
    elseif diff < 31536000 then -- Approx 365 days
        local months = math.floor(diff / 2592000)
        return months .. " month" .. (months == 1 and "" or "s") .. " ago"
    else
        local years = math.floor(diff / 31536000)
        return years .. " year" .. (years == 1 and "" or "s") .. " ago"
    end
end

return p