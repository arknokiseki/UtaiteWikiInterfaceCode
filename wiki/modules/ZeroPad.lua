local p = {}

function p.pad(frame)
    local number = tonumber(frame.args[1])
    local length = tonumber(frame.args[2]) or 2
    if not number then
        return ''
    end
    return string.format('%0' .. length .. 'd', number)
end

return p