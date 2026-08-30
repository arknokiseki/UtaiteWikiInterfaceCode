local p = {}

function p.getParameter(frame)
    local pageName = frame.args[1]
    local paramName = frame.args[2]
    
    mw.log("Debugging: pageName =", pageName, ", paramName =", paramName)
    
    if not pageName then
        return "Error: No page name provided"
    end
    
    local title = mw.title.new(pageName)
    if not title then
        return "Error: Unable to create title object for '" .. tostring(pageName) .. "'"
    end
    
    mw.log("Title object created successfully for", pageName)
    mw.log("Namespace:", title.namespace)
    mw.log("Page exists:", title.exists)
    
    if not title.exists then
        -- Special case for image: return the fallback image instead of error message
        if paramName == "image" then
            return "404simple.png"
        else
            return "Error: Page '" .. tostring(pageName) .. "' does not exist"
        end
    end
    
    local content = title:getContent()
    if not content then
        return "Error: Unable to get content for '" .. tostring(pageName) .. "'. Check permissions."
    end
    
    local pattern = '|%s*' .. paramName .. '%s*=%s*([^|}\n]+)'
    local result = mw.ustring.match(content, pattern)
    
    -- Handle fallback for image
    if paramName == "image" then
        if result == nil or result == "" or result:match("^Error") then
            return "404simple.png"
        end
    end
    
    return result
end

return p