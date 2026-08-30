local p = {}

function p.getOutdatedFromSubpage(frame)
    -- Get the current page's root name
    local currentTitle = mw.title.getCurrentTitle()
    local rootPageName = currentTitle.rootText
    
    -- Construct the Songs subpage title
    local songsPageTitle = rootPageName .. "/Songs"
    
    -- Get the Songs subpage
    local songsPage = mw.title.new(songsPageTitle)
    
    -- Check if the Songs subpage exists
    if not songsPage or not songsPage.exists then
        return '<div class="error">Songs subpage does not exist: ' .. songsPageTitle .. '</div>'
    end
    
    -- Get the content of the Songs subpage
    local songsContent = songsPage:getContent()
    
    if not songsContent then
        return '<div class="error">Could not retrieve content from: ' .. songsPageTitle .. '</div>'
    end
    
    -- Pattern to match the Outdated template usage
    -- This pattern looks for {{Outdated with parameters, handling nested braces
    local outdatedPattern = "{{%s*[Oo]utdated%s*|([^}]*)}}"
    
    -- Find the Outdated template usage
    local templateParams = string.match(songsContent, outdatedPattern)
    
    if not templateParams then
        -- Try alternative pattern for templates without parameters
        local simplePattern = "{{%s*[Oo]utdated%s*}}"
        if string.match(songsContent, simplePattern) then
            templateParams = ""
        else
            return '<div class="error">Outdated template not found in: ' .. songsPageTitle .. '</div>'
        end
    end
    
    -- Parse the parameters
    local parsedParams = {}
    
    if templateParams and templateParams ~= "" then
        -- Split parameters by |
        local paramList = mw.text.split(templateParams, "|")
        
        for i, param in ipairs(paramList) do
            param = mw.text.trim(param)
            if param ~= "" then
                -- Check if it's a named parameter (contains =)
                local name, value = string.match(param, "^%s*([^=]+)%s*=%s*(.*)%s*$")
                if name and value then
                    parsedParams[mw.text.trim(name)] = mw.text.trim(value)
                else
                    -- It's a positional parameter
                    parsedParams[i] = param
                end
            end
        end
    end
    
    -- Build the template call with extracted parameters
    local templateCall = "{{Outdated"
    
    -- Add positional parameters first
    for i = 1, 10 do
        if parsedParams[i] then
            templateCall = templateCall .. "|" .. parsedParams[i]
        end
    end
    
    -- Add named parameters (excluding nocat)
    for name, value in pairs(parsedParams) do
        if type(name) == "string" and name ~= "nocat" then
            templateCall = templateCall .. "|" .. name .. "=" .. value
        end
    end
    
    templateCall = templateCall .. "}}"
    
    -- Expand the template
    return frame:preprocess(templateCall)
end

return p