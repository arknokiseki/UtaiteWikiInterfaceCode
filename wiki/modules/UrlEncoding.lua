-- Way to encode URLs so they don't break things
local encode = function (str)
        str = string.gsub (str, "\n", "\r\n")
        str = string.gsub (str, "([^%w ])",
            function (c) return string.format ("%%%02X", string.byte(c)) end)
        str = string.gsub (str, " ", "+")
        return str
end

local decode = function (str)
    str = string.gsub (str, "+", " ")
    str = string.gsub (str, "%%(%x%x)",
        function(h) return string.char(tonumber(h,16)) end)
    str = string.gsub (str, "\r\n", "\n")
end

return {
	_encode = encode,
	_decode = decode,

    encode = function (frame)
        str = frame.args[1]
        if (str ~= nil) then
        	str = encode(str)
        end
        return str
    end,

	decode = function (frame)
        str = frame.args[1]
        if (str ~= nil) then
        	str = decode(str)
        end
        return str
    end
}