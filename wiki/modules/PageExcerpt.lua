local p = {}

function p.main(frame)
    local pageName = frame.args[1]
    local charLimit = tonumber(frame.args[2]) or 150
    local stripWikitext = frame.args.strip ~= 'no'
    
    if not pageName then
        return ''
    end
    
    -- Get page object
    local page = mw.title.new(pageName)
    if not page or not page.exists then
        return ''
    end
    
    -- Get page content
    local content = page:getContent()
    if not content then
        return ''
    end
    
    -- Extract excerpt
    local excerpt = content or ''
    
    if stripWikitext then
        -- Remove common wiki markup
        excerpt = excerpt:gsub('%[%[File:.-|?.-]]', '') -- Remove images
        excerpt = excerpt:gsub('%[%[Category:.-]]', '') -- Remove categories
        excerpt = excerpt:gsub('%[%[([^%]|]+)|?([^%]]+)]]', '%2') -- Convert links
        excerpt = excerpt:gsub("'''(.-)'''", '%1') -- Remove bold
        excerpt = excerpt:gsub("''(.-)''", '%1') -- Remove italic
        excerpt = excerpt:gsub('=+%s*(.-)%s*=+', '%1') -- Remove headers
        excerpt = excerpt:gsub('{|.-|}', '') -- Remove tables
        excerpt = excerpt:gsub('{{.-}}', '') -- Remove templates
        excerpt = excerpt:gsub('%[http[^%s%]]+%s*([^%]]*)%]', '%1') -- External links
        excerpt = excerpt:gsub('<comment%-streams%s*/?>', '') -- Remove comment-streams tag
        
        -- Remove HTML tags (with error handling)
        local success, result = pcall(function()
            local temp = mw.text.killMarkers(excerpt)
            return mw.text.unstrip(temp)
        end)
        
        if success and result then
            excerpt = result
        end
        
        -- Ensure excerpt is still a string
        excerpt = tostring(excerpt or '')
        
        excerpt = excerpt:gsub('<%s*/?%s*[^>]+>', '') -- Remove all HTML tags
        
        -- Remove list markup
        excerpt = excerpt:gsub('\n[*#:;]+%s*(.-)(\n|$)', '\n%1%2') -- Remove list markers at line start
        excerpt = excerpt:gsub('^[*#:;]+%s*', '') -- Remove list markers at content start
        
        excerpt = excerpt:gsub('\n\n+', ' ') -- Replace multiple newlines
        excerpt = excerpt:gsub('\n', ' ') -- Replace single newlines with space
        excerpt = excerpt:gsub('%s+', ' ') -- Normalize whitespace
        excerpt = excerpt:gsub('^%s*', '') -- Trim start
        excerpt = excerpt:gsub('%s*$', '') -- Trim end
    end
    
    -- Ensure excerpt is a string
    excerpt = tostring(excerpt or '')
    
    -- Truncate to character limit
    -- Try using string.len if mw.ustring.len fails
    local excerptLength
    local success, len = pcall(function() return mw.ustring.len(excerpt) end)
    if success and len then
        excerptLength = len
    else
        excerptLength = string.len(excerpt)
    end
    
    if excerptLength > charLimit then
        -- Try mw.ustring.sub first, fallback to string.sub
        local success2, truncated = pcall(function() return mw.ustring.sub(excerpt, 1, charLimit) end)
        if success2 and truncated then
            excerpt = truncated
        else
            excerpt = string.sub(excerpt, 1, charLimit)
        end
        
        -- Try to cut at word boundary
        local lastSpace = excerpt:find(' [^ ]*$')
        if lastSpace then
            excerpt = excerpt:sub(1, lastSpace - 1)
        end
        excerpt = excerpt .. '...'
    end
    
    return excerpt
end

-- Get first paragraph only
function p.firstParagraph(frame)
    local pageName = frame.args[1]
    local charLimit = tonumber(frame.args[2]) or 150
    
    if not pageName then
        return ''
    end
    
    local page = mw.title.new(pageName)
    if not page or not page.exists then
        return ''
    end
    
    local content = page:getContent()
    if not content then
        return ''
    end
    
    -- Find first paragraph (text before double newline)
    local firstPara = content:match('^(.-)\n\n') or content:match('^(.-)\n*$') or ''
    
    -- Strip wikitext
    firstPara = firstPara:gsub('%[%[([^%]|]+)|?([^%]]+)]]', '%2')
    firstPara = firstPara:gsub("'''(.-)'''", '%1')
    firstPara = firstPara:gsub("''(.-)''", '%1')
    firstPara = firstPara:gsub('{{.-}}', '')
    firstPara = firstPara:gsub('<comment%-streams%s*/?>', '') -- Remove comment-streams tag
    
    -- Remove HTML tags
    firstPara = firstPara:gsub('<%s*/?%s*[^>]+>', '') -- Remove all HTML tags
    
    -- Remove list markup
    firstPara = firstPara:gsub('\n[*#:;]+%s*(.-)(\n|$)', ' %1')
    firstPara = firstPara:gsub('^[*#:;]+%s*', '')
    
    -- Clean up whitespace
    firstPara = firstPara:gsub('\n', ' ')
    firstPara = firstPara:gsub('%s+', ' ')
    firstPara = firstPara:gsub('^%s*', '')
    firstPara = firstPara:gsub('%s*$', '')
    
    -- Ensure firstPara is a string
    firstPara = tostring(firstPara or '')
    
    -- Truncate if needed
    -- Try using string.len if mw.ustring.len fails
    local paraLength
    local success, len = pcall(function() return mw.ustring.len(firstPara) end)
    if success and len then
        paraLength = len
    else
        paraLength = string.len(firstPara)
    end
    
    if paraLength > charLimit then
        -- Try mw.ustring.sub first, fallback to string.sub
        local success2, truncated = pcall(function() return mw.ustring.sub(firstPara, 1, charLimit) end)
        if success2 and truncated then
            firstPara = truncated
        else
            firstPara = string.sub(firstPara, 1, charLimit)
        end
        
        -- Try to cut at word boundary
        local lastSpace = firstPara:find(' [^ ]*$')
        if lastSpace then
            firstPara = firstPara:sub(1, lastSpace - 1)
        end
        firstPara = firstPara .. '...'
    end
    
    return firstPara
end

return p