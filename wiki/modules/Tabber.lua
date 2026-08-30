local p = {}

local seq = 0

-- @param frame Frame object passed from #invoke
-- @return processed TabberNeue element
function p.main(frame)
    local args = require('Module:Arguments').getArgs(frame)
    local parent = frame:getParent()

    -- Compute depth index (0-based) per page parse
    local depthIndex = seq
    seq = seq + 1

    local visibleTabs = {}
    local idx = 1

    while args['tab' .. idx] do
        local hideParam = args['hide' .. idx]
        local isHidden = hideParam and string.lower(tostring(hideParam)) == "true"

        if not isHidden then
            table.insert(visibleTabs, {
                label = args['tab' .. idx],
                content = args['content' .. idx] or ''
            })
        end

        idx = idx + 1
    end

    if #visibleTabs == 0 then
        return ''
    end

    local userId = args.id
    local effectiveTabberId = nil
    if userId and userId ~= '' then
        -- Append -depth to user-provided id to ensure per-instance uniqueness
        -- Example: id="my-id" -> data-tabber-id="my-id-0", then "my-id-1", etc.
        effectiveTabberId = tostring(userId) .. '-' .. tostring(depthIndex)
    end

    local tabberContent = ''

    -- Generate the content for the <tabber> tag
    for _, tab in ipairs(visibleTabs) do
        local finalLabel = tab.label
        -- If an ID is provided, create the unique label for the link.
        -- Example: "my-id-0-Overview"
        if effectiveTabberId and effectiveTabberId ~= '' then
            finalLabel = effectiveTabberId .. '-' .. tab.label
        end
        tabberContent = tabberContent .. '|-|' .. finalLabel .. '=\n' .. tab.content .. '\n'
    end

    -- Prepare the attributes for the main <div>
    local attrs = { class = 'wds-tabber dev-tabber' }
    if effectiveTabberId and effectiveTabberId ~= '' then
        -- Add a hook class for our JavaScript to find this element
        attrs.class = attrs.class .. ' js-custom-tabber'

        -- Add the effective ID (with -depth) as a data attribute for the JS to read
        attrs['data-tabber-id'] = effectiveTabberId
    end

    -- Create the tabber element
    return frame:extensionTag('tabber', tabberContent, attrs)
end

return p