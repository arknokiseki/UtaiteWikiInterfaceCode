local p = {}

-- Helper function to clean wikicode into plain text
local function cleanWikitext(text)
    if not text or text == "" then return "" end

    -- 1. Handle piped links: [[Link|Display Text]] -> Display Text
    -- This looks for [[, followed by anything that isn't a pipe or bracket, a pipe, and then captures the display text
    text = string.gsub(text, "%[%[[^%|%]]-|([^%]]+)%]%]", "%1")
    
    -- 2. Handle standard links: [[Link]] -> Link
    text = string.gsub(text, "%[%[([^%]]+)%]%]", "%1")
    
    -- 3. Handle external links with text: [http://example.com Display Text] -> Display Text
    text = string.gsub(text, "%[https?://[^%s]+%s+([^%]]+)%]", "%1")
    
    -- 4. Strip out any remaining plain external links: [http://example.com] -> (empty)
    text = string.gsub(text, "%[https?://[^%]]+%]", "")
    
    -- 5. Strip any HTML tags (e.g., <span>, <b>) just to be perfectly clean for SEO
    text = string.gsub(text, "<[^>]+>", "")
    
    -- 6. Trim leading/trailing whitespace
    return mw.text.trim(text)
end

function p.cleanName(frame)
    local input = frame.args[1] or frame:getParent().args[1] or ""
    
    if input == "" then
        return ""
    end

    -- 1. Normalize <br> tags and grab the first line (first name)
    local normalized_text = string.gsub(input, "<[bB][rR]%s*/?>", "\n")
    local first_item = mw.text.split(normalized_text, "\n")[1]
    
    -- 2. Completely remove <rt>...</rt> and <rp>...</rp> along with their contents
    -- Using .- for non-greedy matching to prevent deleting text between multiple ruby tags
    local no_ruby_text = string.gsub(first_item, "<[rR][tT][^>]*>.-</[rR][tT]%s*>", "")
    no_ruby_text = string.gsub(no_ruby_text, "<[rR][pP][^>]*>.-</[rR][pP]%s*>", "")
    
    -- 3. Run it through the existing cleanWikitext to strip the remaining <ruby> tags, links, etc.
    return cleanWikitext(no_ruby_text)
end

function p.getFirst(frame)
    -- Get the input either directly passed to the module or from the parent template
    local input = frame.args[1] or frame:getParent().args[1] or ""
    
    if input == "" then
        return ""
    end

    -- Normalize all variations of <br> tags (case-insensitive, with or without slash/spaces) to newlines
    local normalized_text = string.gsub(input, "<[bB][rR]%s*/?>", "\n")
    
    -- Split the text by newlines and grab the very first item
    local first_item = mw.text.split(normalized_text, "\n")[1]
    
    -- Clean the extracted first item and return it
    return cleanWikitext(first_item)
end

return p