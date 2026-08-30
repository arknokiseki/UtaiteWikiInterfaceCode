local p = {}

-- Helper function to trim whitespace
local function trim(s)
    return s:match("^%s*(.-)%s*$")
end

-- Helper function to extract first image from gallery
local function getFirstGalleryImage(galleryContent)
    if not galleryContent then return nil end
    
    -- Remove gallery attributes
    local cleanGallery = galleryContent:gsub("<gallery[^>]*>", ""):gsub("</gallery>", "")
    
    -- Look for first valid image line
    for line in cleanGallery:gmatch("[^\n]+") do
        -- Remove any file prefix if present
        local imageName = line:match("^[Ff]ile:(.+)$") or line
        -- Remove any gallery parameters (everything after |)
        imageName = imageName:match("^([^|]+)") or imageName
        -- Trim whitespace
        imageName = trim(imageName)
        
        if imageName ~= "" then
            return imageName
        end
    end
    
    return nil
end

-- Main function to get group image
function p.getImage(frame)
    local pageName = frame.args[1]
    
    if not pageName then
        return "404simple.png"
    end
    
    -- Create title object
    local title = mw.title.new(pageName)
    if not title or not title.exists then
        return "404simple.png"
    end
    
    -- Get page content
    local content = title:getContent()
    if not content then
        return "404simple.png"
    end
    
    -- First try to get ImageCat parameter
    local imageCatPattern = '|%s*ImageCat%s*=%s*([^|}\n]+)'
    local imageCatParam = content:match(imageCatPattern)
    
    if imageCatParam then
        imageCatParam = trim(imageCatParam)
        if imageCatParam ~= "" then
            return imageCatParam
        end
    end
    
    -- If no ImageCat parameter or it's empty, try Image parameter
    local imagePattern = '|%s*Image%s*=%s*([^|}\n]+)'
    local imageParam = content:match(imagePattern)
    
    if imageParam then
        imageParam = trim(imageParam)
        if imageParam ~= "" then
            return imageParam
        end
    end
    
    -- If no Image parameter or it's empty, try Gallery
    local galleryPattern = '|%s*Gallery%s*=%s*<gallery[^>]*>(.-)</gallery>'
    local galleryContent = content:match(galleryPattern)
    local galleryImage = getFirstGalleryImage(galleryContent)
    
    if galleryImage then
        return galleryImage
    end
    
    -- If nothing found, return fallback
    return "404simple.png"
end

-- Function to get any template parameter (for compatibility)
function p.getParameter(frame)
    local pageName = frame.args[1]
    local paramName = frame.args[2]
    
    if paramName == "image" then
        return p.getImage(mw.getCurrentFrame():newChild{args = {pageName}})
    end
    
    if not pageName or not paramName then
        return "Error: Missing required parameters"
    end
    
    local title = mw.title.new(pageName)
    if not title or not title.exists then
        return "Error: Page '" .. tostring(pageName) .. "' does not exist"
    end
    
    local content = title:getContent()
    if not content then
        return "Error: Unable to get content"
    end
    
    local pattern = '|%s*' .. paramName .. '%s*=%s*([^|}\n]+)'
    local result = content:match(pattern)
    
    return result and trim(result) or ""
end

return p