local n34 = {}
local gsub, char, byte, format = string.gsub, string.char, string.byte, string.format
local entityMap  = {["lt"]="<",["gt"]=">",["amp"]="&",["quot"]='"',["apos"]="'"}
local entitySwap = function(orig,n,s)
  return (n=='' and entityMap[s])
         or (n=="#" and tonumber(s)) and char(s)
         or (n=="#x" and tonumber(s,16)) and char(tonumber(s,16))
         or orig
end

function n34.encode ( frame )
    local args = frame.args;
    local str = args[1];

    str = gsub (str, "\n", "\r\n")
    str = gsub (str, "([^%w ])",
        function (c) return format ("%%%02X", byte(c)) end)
    str = gsub (str, " ", "+")
    return str
end

function n34.decode( frame )
    local args = frame.args;
    local str = args[1];

    str = gsub (str, "+", " ")
    str = gsub (str, "%%(%x%x)",
        function(h) return char(tonumber(h,16)) end)
    str = gsub (str, "\r\n", "\n")

    return str
end

function n34.hextoden( frame )
    local args = frame.args;
    local str = args[1];

    str = tostring(tonumber(str, 16))

    return str
end

function n34.unescapehtml( frame )
    local args = frame.args;
    local str = args[1];

    return (gsub( str, '(&(#?x?)([%d%a]+);)', entitySwap ))
end

function n34.escapehtml( frame )
    local args = frame.args;
    local str = args[1];

    str = gsub (str, "\n", "\r\n")
    str = gsub (str, "([^%w ])",
        function (c) return format ("&#%u;", byte(c)) end)
    str = gsub (str, " ", "+")

    return str
end

return n34