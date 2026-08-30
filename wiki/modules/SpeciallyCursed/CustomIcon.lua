local p = {}

function p.main(frame)
    local jsonTitle = mw.title.new('MediaWiki:CustomIcon.json')
    local jsonContent = jsonTitle and jsonTitle:getContent() or '{}'
    local success, icons = pcall(mw.text.jsonDecode, jsonContent)
    
    if not success or type(icons) ~= 'table' then
        icons = {}
    end

    local output = mw.html.create('div'):addClass('uw-customicon-wrapper')
    
    output:tag('div')
        :css({['display'] = 'flex', ['justify-content'] = 'space-between', ['align-items'] = 'center', ['margin-bottom'] = '1rem'})
        :tag('h2'):wikitext('Utaite Wiki Custom Icons'):done()
        :tag('button')
            :addClass('mw-ui-button mw-ui-progressive id-edit-icons-btn')
            :wikitext('Edit Icon Mappings')
            :done()

    local table = output:tag('table'):addClass('wikitable sortable'):css('width', '100%')
    local tr = table:tag('tr')
    tr:tag('th'):wikitext('Preview')
    tr:tag('th'):wikitext('Class Name')
    tr:tag('th'):wikitext('Target File')
    tr:tag('th'):wikitext('Wikitext Example')
    tr:tag('th'):wikitext('Actions')

    for className, fileName in pairs(icons) do
        local row = table:tag('tr')
        local fileUrl = tostring(mw.uri.fullUrl('File:' .. fileName))
        
        row:tag('td'):css('text-align', 'center')
           :wikitext(frame:preprocess('[[File:' .. fileName .. '|32px|link=]]'))
           
        row:tag('td'):tag('code'):wikitext(mw.text.encode(className))
        
        row:tag('td')
           :tag('a')
           :attr('href', fileUrl)
           :wikitext(mw.text.encode(fileName))
        
        local codeString = '<i class="uw-icon ' .. className .. '" style="color: #ff0000;"></i>'
        row:tag('td')
           :tag('code')
           :wikitext(mw.text.encode(codeString))
           
        local actions = row:tag('td')
        actions:tag('a')
               :addClass('mw-ui-button mw-ui-quiet')
               :attr('href', fileUrl)
               :attr('target', '_blank')
               :wikitext('<i class="fas fa-eye"></i> View File')
    end

    return tostring(output)
end

return p