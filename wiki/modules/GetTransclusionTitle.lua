local p = {}

function p.getCallingPageTitle(frame)
    -- Get the parent frame (template's frame)
    local parentFrame = frame:getParent()
    
    if not parentFrame then
        return nil
    end
    
    -- Get the parent frame's parent (the page that called the template)
    local templateParentFrame = parentFrame:getParent()
    
    if templateParentFrame then
        -- If there's a parent of the template frame, that's your transcluding page
        return templateParentFrame:getTitle()
    else
        -- If there's no parent of the template frame, then the template was called directly
        return parentFrame:getTitle()
    end
end

-- Alternative approach using frame expansion
function p.getCallingPageTitleAlt(frame)
    -- Expand {{FULLPAGENAME}} in the context of the calling page
    local callingPage = frame:getParent():expandTemplate({
        title = 'FULLPAGENAME'
    })
    return callingPage
end

return p