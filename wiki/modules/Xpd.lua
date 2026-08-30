-- Expansion demo, like [[Template:Xpd]]

local p = {}

function p.f(frame, showwikitext, sep)
    local pframe, w = frame:getParent(), { '{{' }
    
    for n,v in pairs( pframe.args ) do
        if type(n) == "string" then
            table.insert( w, table.concat({ '|', p.unexpand(n), '=', p.unexpand(v) }) )
        elseif n ~= 1 then
            table.insert( w, table.concat({ '|', p.unexpand(v) }) )
        else
            table.insert( w, 2, v )
        end
    end
    
    table.insert( w, '}}' )
    w = table.concat( w )
    
    local xpw = frame:preprocess( w )
    
    w = table.concat({ '<code>', p.swt(w), '</code> → ' })
    
    if showwikitext then
        w = table.concat({ w, sep, '<code>', p.swt( xpw ), '</code> → ' })
    end
    
    w = table.concat( { w, xpw }, sep )
    return w
end
 
function p.s(frame) return p.f(frame, false, '') end
function p.p(frame) return p.f(frame, false, '\n\n') end

function p.unexpand(w)
    local w1 = string.gsub( w, '[{}|=]', {
        ['{'] = '{{(}}',
        ['}'] = '{{)}}',
        ['|'] = '{{!}}',
        ['='] = '{{=}}',
    }):gsub( 'lbrace', '{{(}}' ):gsub( 'rbrace', '{{)}}' )
    return w1
end
  
function p.swt(w)
    local w1 = string.gsub( w, '[&<>%[%] \n\']', {
        ['&'] = '&amp;',
        ['<'] = '&lt;',
        ['>'] = '&gt;',
        ['['] = '&#91;',
        [']'] = '&#93;',
        ["'"] = '&#39;',
        [' '] = '&nbsp;',
        ['\n'] = '<br/>',
    })
    return w1
end

return p