local p = {}

function p.strip_links(frame)
    local text = frame.args[1] or ""
    
    if text == "" then
        return ""
    end

    text = mw.ustring.gsub(text, "%[%a+://%S+%s+([^%]]+)%]", "%1")
    text = mw.ustring.gsub(text, "%[(%a+://%S+)%]", "%1")
    text = mw.ustring.gsub(text, "%[%[[^%|%]]+%|([^%]]+)%]%]", "%1")
    text = mw.ustring.gsub(text, "%[%[([^%]]+)%]%]", "%1")
    return mw.text.trim(text)
end

return p