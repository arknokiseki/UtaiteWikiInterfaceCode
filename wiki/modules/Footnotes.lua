local p = {}

function p.harvard_citation(frame)
    local args = frame:getParent().args
    local authors = {}
    local year = ''
    local author_count = 0

    -- Collect authors and find the year
    for i = 1, 4 do
        if args[i] then
            -- A simple check to see if it looks like a year
            if tonumber(args[i]) and string.len(args[i]) >= 4 and not args[i+1] then
                year = args[i]
                break
            else
                table.insert(authors, args[i])
                author_count = author_count + 1
            end
        else
            break
        end
    end

    -- If the last argument collected was the year, it would have been missed above
    if year == '' and tonumber(args[author_count + 1]) then
         year = args[author_count + 1]
    end

    -- Build the display text
    local text
    if author_count > 1 then
        text = table.concat(authors, ' & ')
    else
        text = authors[1] or ''
    end

    if year ~= '' then
        text = text .. ' ' .. year
    end

    -- Build the anchor ID
    local anchor_id = 'CITEREF'
    for _, author in ipairs(authors) do
        anchor_id = anchor_id .. author:gsub('%s', '') -- Remove spaces for anchor
    end
    anchor_id = anchor_id .. year

    -- Add page numbers if they exist
    local p_loc = args.p or args.pp or args.loc
    if p_loc then
        text = text .. ', ' .. p_loc
    end

    -- Create the final link
    local link = string.format('[[#%s|%s]]', anchor_id, text)

    -- Handle brackets from the invoking template
    local pframe_args = frame.args
    local bracket_left = pframe_args.bracket_left or ''
    local bracket_right = pframe_args.bracket_right or ''

    return bracket_left .. link .. bracket_right
end

return p