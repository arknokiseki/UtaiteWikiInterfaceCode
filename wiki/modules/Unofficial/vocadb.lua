local p = {}

function p.vocadb(frame)
    local args = frame:getParent().args
    
    -- Check if vocadb parameter exists and is not 'ok' (which hides the section)
    if not args.vocadb or args.vocadb == 'ok' then
        return ''
    end
    
    local result = ''
    local base_url = 'http://vocadb.net/'
    local link_type = 'S'  -- Default to Song
    local link_text = 'VocaDB'
    
    -- Determine link type based on parameters
    if args.p == 'yes' then
        link_type = 'P'
        link_text = 'VocaDB (Producer)'
    elseif args.a == 'yes' then
        link_type = 'Al'
        link_text = 'VocaDB (Album)'
    end
    
    -- Create the primary VocaDB link
    local primary_id = args.vocadb
    result = result .. '* [' .. base_url .. link_type .. '/' .. primary_id .. ' ' .. link_text .. ']'
    
    -- Handle additional numbered vocadb parameters (vocadb2, vocadb3, etc.)
    local counter = 2
    while args['vocadb' .. counter] do
        local additional_id = args['vocadb' .. counter]
        if additional_id and additional_id ~= '' and additional_id ~= 'ok' then
            result = result .. '\n* [' .. base_url .. link_type .. '/' .. additional_id .. ' ' .. link_text .. ' (' .. counter .. ')]'
        end
        counter = counter + 1
    end
    
    return result
end

return p