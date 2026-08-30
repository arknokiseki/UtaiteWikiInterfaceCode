local p = {}

function p.main(frame)
    -- Get parameters from the parent frame (template call)
    local args = frame:getParent().args
    
    -- Build parameter list
    local paramList = {}
    
    -- Content parameters
    if args.category or args.target then
        table.insert(paramList, 'category=' .. (args.target or args.category or mw.title.getCurrentTitle().text))
    end
    
    -- Handle multiple categories
    local i = 1
    while args['category' .. i] do
        table.insert(paramList, 'category=' .. args['category' .. i])
        i = i + 1
    end
    
    -- Handle notcategory
    if args.notcategory then
        table.insert(paramList, 'notcategory=' .. args.notcategory)
    end
    i = 1
    while args['notcategory' .. i] do
        table.insert(paramList, 'notcategory=' .. args['notcategory' .. i])
        i = i + 1
    end
    
    if args.namespace then
        table.insert(paramList, 'namespace=' .. args.namespace)
    end
    
    if args.prefix then
        table.insert(paramList, 'prefix=' .. args.prefix)
    end
    
    if args.start then
        table.insert(paramList, 'start=' .. args.start)
    elseif mw.getCurrentFrame():callParserFunction('#urlget', 'offset') ~= '' then
        table.insert(paramList, 'start=' .. mw.getCurrentFrame():callParserFunction('#urlget', 'offset', '0'))
    end
    
    if args.count then
        table.insert(paramList, 'count=' .. args.count)
    end
    
    if args.title then
        table.insert(paramList, 'title=' .. args.title)
    end
    
    -- Structural parameters
    if args.mode then
        table.insert(paramList, 'mode=' .. args.mode)
    end
    
    if args.compact then
        table.insert(paramList, 'compact=' .. args.compact)
    end
    
    if args.addcreationdate then
        table.insert(paramList, 'addcreationdate=' .. args.addcreationdate)
    end
    
    if args.addauthor then
        table.insert(paramList, 'addauthor=' .. args.addauthor)
    end
    
    if args.addlasteditor then
        table.insert(paramList, 'addlasteditor=' .. args.addlasteditor)
    end
    
    if args.addlastedit then
        table.insert(paramList, 'addlastedit=' .. args.addlastedit)
    end
    
    -- Output parameters
    if args.ordermethod then
        table.insert(paramList, 'ordermethod=' .. args.ordermethod)
    end
    
    if args.historylink then
        table.insert(paramList, 'historylink=' .. args.historylink)
    end
    
    if args.omit then
        table.insert(paramList, 'omit=' .. args.omit)
    end
    
    if args.order then
        table.insert(paramList, 'order=' .. args.order)
    end
    
    if args.newdays then
        table.insert(paramList, 'newdays=' .. args.newdays)
    end
    
    if args.timestamp then
        table.insert(paramList, 'timestamp=' .. args.timestamp)
    end
    
    if args.cache then
        table.insert(paramList, 'cache=' .. args.cache)
    end
    
    if args.shownamespace then
        table.insert(paramList, 'shownamespace=' .. args.shownamespace)
    end
    
    -- Build the forum tag
    local forumTag = '<forum>\n' .. table.concat(paramList, '\n') .. '\n</forum>'
    
    -- Return the forum tag for parsing
    return frame:preprocess(forumTag)
end

function p.withTable(frame)
    -- Get parameters from the parent frame (template call)
    local args = frame:getParent().args
    
    -- Set default values for table mode
    local defaults = {
        namespace = 'Forum',
        shownamespace = 'false',
        addlasteditor = 'true',
        historylink = 'true',
        cache = 'false',
        count = '5',
        mode = 'table',
    }
    
    -- Apply defaults only if not specified
    for key, value in pairs(defaults) do
        if not args[key] then
            args[key] = value
        end
    end
    
    -- Ensure we have a category
    if not args.category and not args.target then
        args.category = mw.title.getCurrentTitle().text
    end
    
    -- Get mode to determine table structure
    local mode = args.mode or 'table'
    
    -- Build the output based on mode
    local output = ''
    
    if mode == 'table' then
        -- Determine which columns to show
        local showAuthor = args.addauthor == 'true'
        local showCreated = args.addcreationdate == 'true'
        local showEditor = args.addlasteditor ~= 'false'
        local showEdit = args.addlastedit ~= 'false'
        local compact = args.compact
        
        output = '<table class="forumlist" width="100%">\n<tr>\n'
        
        -- Title column
        output = output .. '<th class="forum_title" align="left">Topic</th>\n'
        
        -- Author column (if not compacted with title)
        if showAuthor and compact ~= 'author' and compact ~= 'all' then
            output = output .. '<th class="forum_author" align="left">Author</th>\n'
        end
        
        -- Creation date column
        if showCreated then
            output = output .. '<th class="forum_created" align="left">Created</th>\n'
        end
        
        -- Last edit column (if not compacted with editor)
        if showEdit and compact ~= 'editor' and compact ~= 'all' then
            output = output .. '<th class="forum_edited" align="left">Last Edit</th>\n'
        end
        
        -- Last editor column
        if showEditor then
            output = output .. '<th class="forum_editor" align="left">Last Editor</th>\n'
        end
        
        output = output .. '</tr>\n'
    elseif mode == 'list' then
        -- List mode - no opening tag needed as user should provide <ul> or <ol>
        output = ''
    elseif mode == 'none' then
        -- No special formatting
        output = ''
    elseif mode == 'count' then
        -- Count mode - just return the forum tag
        return p.main(frame)
    end
    
    -- Add the forum tag
    output = output .. p.main(frame)
    
    -- Close table if in table mode
    if mode == 'table' then
        -- Check if category is empty and add no results message
        local category = args.target or args.category or mw.title.getCurrentTitle().text
        local pageCount = mw.site.stats.pagesInCategory(category, 'pages')
        
        if pageCount == 0 then
            local noresult = args.noresult or 'post something here'
            local buttonlabel = args.buttonlabel or 'Add New Topic'
            output = output .. string.format([[
<tr style="padding: 20px;">
<td colspan="5" style="text-align: center;">''No posts yet! Be the first to %s by clicking the "%s" button above.''</td>
</tr>]], noresult, buttonlabel)
        end
        
        output = output .. '\n</table>'
    end
    
    return output
end

return p