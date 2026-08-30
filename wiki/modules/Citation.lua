local p = {}

-- Helper to get the first non-empty value from a list of arguments
local function coalesce(...)
    for i = 1, select('#', ...) do
        local arg = select(i, ...)
        if arg and arg ~= '' then
            return arg
        end
    end
    return ''
end

-- Function to generate the CITEREF ID string from parts
local function build_citeref_id(...)
    local parts = {...}
    local id = 'CITEREF'
    for _, part in ipairs(parts) do
        if part and part ~= '' then
            -- Remove spaces and specific punctuation for a clean anchor
            id = id .. mw.ustring.gsub(part, '[%s%.%-,]', '')
        end
    end
    return id
end

--[[=================================================================
=    1. MAIN FUNCTION for {{Cite book}} and {{Cite journal}}        =
==================================================================]]
function p.main(frame)
    local parent_args = frame:getParent().args
    local invoke_args = frame.args
    local citation_class = invoke_args.CitationClass or 'book'

    -- Check for Japanese style citation
    local is_washo = coalesce(parent_args[1], parent_args.language) == '和書' or parent_args.language == 'ja'

    -- === ANCHOR ID GENERATION ===
    local anchor_id
    if parent_args.ref and parent_args.ref ~= '' then
        -- If a ref is manually provided (e.g., by {{SfnRef}}), use it directly.
        anchor_id = parent_args.ref
    else
        -- Otherwise, automatically generate it from authors and year.
        local authors_for_id = {}
        for i = 1, 4 do
            local author = coalesce(parent_args['last'..i], parent_args['author'..i], i == 1 and parent_args.author or nil)
            if author and author ~= '' then
                table.insert(authors_for_id, author)
            else
                break
            end
        end
        local year_for_id = (coalesce(parent_args.year, parent_args.date):match('(%d%d%d%d?)') or '')
        anchor_id = build_citeref_id(unpack(authors_for_id), year_for_id)
    end

    -- === CITATION STRING CONSTRUCTION ===
    local parts = {}
    
    -- Author(s)
    local author_str = coalesce(parent_args.author, parent_args.last, parent_args.authors)
    if author_str and author_str ~= '' then
        table.insert(parts, author_str)
    end

    -- Date
    local date = coalesce(parent_args.date, parent_args.year)
    if date and date ~= '' then
        if is_washo then
            date = date:gsub('(%d+)%-(%d+)%-(%d+)', '%1年%2月%3日'):gsub('(%d+)%-(%d+)', '%1年%2月号')
        end
        table.insert(parts, '(' .. date .. ')')
    end

    -- Title (and Chapter/Article)
    local title = parent_args.title or ''
    local chapter = parent_args.chapter or ''
    local journal = parent_args.journal or ''

    if is_washo then
        if journal ~= '' and title ~= '' then -- For journals
            table.insert(parts, '「' .. title .. '」')
            table.insert(parts, '『' .. journal .. '』')
        elseif title ~= '' then -- For books
            table.insert(parts, '『' .. title .. '』')
        end
    else -- Western style
        if journal ~= '' and title ~= '' then
             table.insert(parts, '"' .. title .. '."')
             table.insert(parts, "''" .. journal .. ".''")
        elseif title ~= '' then
            table.insert(parts, "''" .. title .. ".''")
        end
    end

    -- Volume & Issue
    if parent_args.volume and parent_args.volume ~= '' then table.insert(parts, parent_args.volume) end
    if parent_args.issue and parent_args.issue ~= '' then table.insert(parts, '('..parent_args.issue..')') end

    -- Publisher & Location
    local publisher = parent_args.publisher or ''
    if publisher ~= '' then table.insert(parts, publisher) end
    
    -- Identifiers with proper external links
    if parent_args.isbn and parent_args.isbn ~= '' then
        local url = 'https://ja.wikipedia.org/wiki/特別:文献資料/' .. parent_args.isbn
        local text = 'ISBN ' .. parent_args.isbn
        table.insert(parts, string.format('[%s %s]', url, text))
    end
    if parent_args.doi and parent_args.doi ~= '' then
        local url = 'https://doi.org/' .. mw.uri.encode(parent_args.doi, 'PATH')
        local text = 'doi:' .. parent_args.doi
        table.insert(parts, string.format('[%s %s]', url, text))
    end
    if parent_args.pmc and parent_args.pmc ~= '' then
        local url = 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC' .. parent_args.pmc
        local text = 'PMC ' .. parent_args.pmc
        table.insert(parts, string.format('[%s %s]', url, text))
    end
    if parent_args.asin and parent_args.asin ~= '' then
        local url = 'https://www.amazon.co.jp/dp/' .. parent_args.asin
        local text = 'ASIN ' .. parent_args.asin
        table.insert(parts, string.format('[%s %s]', url, text))
    end

    local citation_text
    -- Join everything with appropriate separators
    if is_washo then
        citation_text = table.concat(parts, '。')
        citation_text = citation_text:gsub('。。', '。') -- Avoid double periods
    else
        citation_text = table.concat(parts, ' ')
        citation_text = citation_text:gsub('%s+%.', '.'):gsub('%.%s*%.', '.') -- General cleanup
    end


    -- Final output
    return string.format('<cite id="%s" class="citation %s">%s</cite>', anchor_id, citation_class, citation_text)
end


--[[=================================================================
=          2. HARV FUNCTION for {{Harvnb}} and {{R}}              =
==================================================================]]
function p.harv(frame)
    local parent_args = frame:getParent().args
    local invoke_args = frame.args
    
    local parts_for_id = {}
    local parts_for_display = {}
    local year = ''
    
    for i = 1, 10 do -- Allow more parameters
        local arg = parent_args[i]
        if arg then
            if not year:find('%d%d%d%d') and tonumber(arg) and string.len(arg) >= 4 then
                year = arg
                table.insert(parts_for_id, year)
                table.insert(parts_for_display, year)
            else
                 table.insert(parts_for_id, arg)
                 table.insert(parts_for_display, arg)
            end
        else
            break
        end
    end
    
    local anchor_id = build_citeref_id(unpack(parts_for_id))
    local display_text = table.concat(parts_for_display, ' ')

    -- Add page/location
    local p_loc = coalesce(parent_args.p, parent_args.pp, parent_args.loc)
    if p_loc and p_loc ~= '' then
        display_text = display_text .. ' ' .. p_loc
    end
    
    local link = string.format('[[#%s|%s]]', anchor_id, display_text)
    
    return (invoke_args.bracket_left or '') .. link .. (invoke_args.bracket_right or '')
end

--[[=================================================================
=           3. SFNREF FUNCTION for {{SfnRef}}                     =
==================================================================]]
function p.sfnref(frame)
    local parent_args = frame:getParent().args
    local parts = {}
    for i = 1, 10 do
        if parent_args[i] and parent_args[i] ~= '' then
            table.insert(parts, parent_args[i])
        else
            break
        end
    end
    return build_citeref_id(unpack(parts))
end

return p