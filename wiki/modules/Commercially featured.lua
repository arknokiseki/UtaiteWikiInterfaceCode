local p = {}

function p.main(frame)
    local args = frame:getParent().args
    local height = args.height or "250"
    
    -- Start the container div with proper HTML structure
    local html = mw.html.create('div')
        :attr('style', 'width:auto; max-height:' .. height .. 'px; overflow:auto; margin-bottom:3px; padding-left:1.5em; padding-top:1.6em;')
    
    -- Create the main list
    local mainList = html:tag('ul')
    
    -- Process songs dynamically
    local i = 1
    local songCount = 0
    
    while args[i] and args[i] ~= "" do
        songCount = songCount + 1
        local title = args[i] or '<span style="color:gray;">(Song Title Unknown)</span>'
        local date = args[i + 1] or "Month XX, 20XX"
        local description = args[i + 2] or ""
        
        -- Create main list item
        local listItem = mainList:tag('li')
        listItem:wikitext('<b>' .. title .. '</b> - Released on ' .. date)
        
        -- Add description if provided
        if description and description ~= "" then
            local subList = listItem:tag('ul')
            local subItem = subList:tag('li')
            local descDiv = subItem:tag('div'):attr('style', 'font-size:85%')
            descDiv:wikitext(description)
            subItem:tag('br')
        end
        
        -- Move to next song (increment by 3: title, date, description)
        i = i + 3
    end
    
    -- Add message if no songs found
    if songCount == 0 then
        mainList:tag('li'):tag('i'):wikitext('No songs listed.')
    end
    
    return tostring(html)
end

return p