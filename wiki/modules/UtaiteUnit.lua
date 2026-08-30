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
    
    -- Special handling for image parameter
    if paramName == "image" then
        -- Try to get Image2 first
        local image2Pattern = '|%s*[Ii]mage2%s*=%s*([^|}\n]+)'
        local image2Result = mw.ustring.match(content, image2Pattern)
        
        mw.log("Checking Image2 field:")
        mw.log("Content sample:", string.sub(content, 1, 200))  -- Log first 200 chars of content
        mw.log("Image2 pattern:", image2Pattern)
        mw.log("Image2 result:", image2Result)
        
        -- If Image2 exists and is not empty
        if image2Result and image2Result:match("%S") then
            mw.log("Using Image2:", image2Result)
            return mw.text.trim(image2Result)
        end
        
        -- Otherwise, fall back to Image field
        local imagePattern = '|%s*[Ii]mage%s*=%s*([^|}\n]+)'
        local imageResult = mw.ustring.match(content, imagePattern)
        
        mw.log("Falling back to Image field:")
        mw.log("Image pattern:", imagePattern)
        mw.log("Image result:", imageResult)
        
        -- If neither Image2 nor Image exists or they're empty, return fallback
        if not imageResult or not imageResult:match("%S") then
            mw.log("No valid image found, using fallback")
            return "404simple.png"
        end
        
        mw.log("Using Image:", imageResult)
        return mw.text.trim(imageResult)
    end
    
    -- Normal handling for non-image parameters
    local pattern = '|%s*' .. paramName .. '%s*=%s*([^|}\n]+)'
    local result = mw.ustring.match(content, pattern)
    
    return result and mw.text.trim(result) or result
end

return p