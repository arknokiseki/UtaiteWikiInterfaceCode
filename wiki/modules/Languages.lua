-- <nowiki>
--------------------------------------------------------------------------------
-- Lua templating and link generation for language subpages.
--
-- @module languages
-- @alias l
-- @release stable
-- @require [[w:c:dev:Global Lua Modules/Arguments|Module:Arguments]]
-- @require [[w:c:dev:Global Lua Modules/I18n|Module:I18n]]
-- @require [[w:c:dev:Module:Fallbacklist|Module:Fallbacklist]]
-- @require [[w:c:dev:Module:Common/i18n|Module:Common/i18n]]
-- @author [[User:Nanaki|Nanaki]] - original version
-- @author [[User:KockaAdmiralac|KockaAdmiralac]]
-- @author [[User:MACH-59330|MACH-59330]]
-- @see [[project:Internationalization]]
--------------------------------------------------------------------------------
local l = {}
local getArgs = require('Module:Arguments').getArgs
local fallbacks = mw.loadData('Module:Fallbacklist')
local i18n = require('Module:I18n').loadMessages('Common')
local contentLang = mw.getContentLanguage():getCode()
local title = mw.title.getCurrentTitle()
l.langMessage = 'lang'

local function intOrI18n(msg, ...)
	local frame = mw.getCurrentFrame()
	if not frame then
		return nil
	end

	local hasArgs = false
	local args = {}
	for i = 1, select('#', ...) do
		hasArgs = true
		local val = select(i, ...)
		val = val == nil and '' or tostring(val)
		args[i] = val
	end

	local text = frame:preprocess('{{int:' .. msg .. (hasArgs and '|' .. table.concat(args, '|')) .. '}}')
	if text == '<' .. msg .. '>' or text == '⧼' .. msg .. '⧽' then
		text = frame:preprocess(i18n:msg{
			key = msg,
			args = args,
		})
	end
	return text
end

local function escRx(text, spaces)
    text = text:gsub('[\\().+*?^$-/=!:]', '\\%0')

    if spaces then
        text = text:gsub(' ', '_')
    end

    return text
end

local function makeRedLink(page, text, query)
    page = mw.ustring.gsub(tostring(page), '^:*', '')

    local frame = mw.getCurrentFrame()
    local title = frame
        and frame:preprocess('{{int:red-link-title|{{ucfirst:' .. page .. '}}}}')
        or ''

    query = query or {}
    query.action = 'edit'
    query.redlink = 1

    return mw.html.create('span')
        :addClass('redlink')
        :attr('title', title)
        :wikitext('[' .. tostring(mw.uri.fullUrl(page, query)) .. ' ' .. text .. ']')
end

local function makeBlueLink(page, text)
    page = mw.ustring.gsub(tostring(page), '^:*', '')

    return mw.html.create('')
        :wikitext('[[:' .. page .. '|' .. text .. ']]')
end

local function getAttr(t, name)
    for i, attr in ipairs(t.attributes) do
        if attr.name == name then
            return attr.val
        end
    end
end

--------------------------------------------------------------------------------
-- @type Links
--------------------------------------------------------------------------------
-- @property {table} Links.list
--------------------------------------------------------------------------------
-- @property {table} Links.keys
--------------------------------------------------------------------------------
-- @function prepLinks
-- @param {string} root
-- @param {table} list
-- @param {table} order
-- @param[opt] {string} editintro
-- @return {Links}
--------------------------------------------------------------------------------
local function prepLinks(root, list, order, editintro)
    local links = {
        list = {},
        keys = {}
    }

    editintro = editintro or 'Template:I18ndoc/editintro'

    for _, k in ipairs(order) do
        local lang = mw.language.fetchLanguageName(k)

        if lang ~= '' then
            local obj = {
                lang = k
            }

            if list[k] then
                if type(list[k]) == 'string' then
                    obj.link = makeBlueLink(list[k], lang)
                    obj.page = list[k]
                elseif k == contentLang then
                    obj.link = makeBlueLink(root, lang)
                    obj.page = root
                else
                    obj.link = makeBlueLink(root .. '/' .. k, lang)
                    obj.page = root .. '/' .. k
                end
            else
                local options = {
                    editintro = editintro,
                    preload = 'Template:I18ndoc',
                    summary = 'Automatic generation of i18n documentation'
                }

                obj.link = makeRedLink(root .. '/' .. k, lang, options)
                obj.page = root .. '/' .. k
                obj.new = true
            end

            table.insert(links.list, obj)

            links.keys[k] = obj
        end
    end

    return links
end

--------------------------------------------------------------------------------
-- @function l.userLang
-- @return {Lang}
--------------------------------------------------------------------------------
function l.userLang()
    local frame = mw.getCurrentFrame()
    local lang

    if frame == nil then
        mw.log('userLang(): can\'t get user\'s language without frame object, returning content language for now (' .. mw.language.fetchLanguageName(contentLang) .. ')')

        return mw.getContentLanguage()
    end

    local code = frame:preprocess('{{int:' .. l.langMessage .. '}}')

    if mw.language.fetchLanguageName(code) == '' then
        mw.log('userLang(): unrecognised language code, returning content language (' .. mw.language.fetchLanguageName(contentLang) .. ')')

        return mw.getContentLanguage()
    end

    return mw.language.new(code)
end

--------------------------------------------------------------------------------
-- @function l.pageLink
-- @param {Links} links
-- @param {table} args1
-- @param {table} args2
-- @return {table}
--------------------------------------------------------------------------------
function l.pageLink(links, args1, args2)
    local keys = links.keys
    local frame = mw.getCurrentFrame()
    local link = {}

    local pageLang = #mw.language.fetchLanguageName(title.subpageText) ~= 0
        and title.subpageText
        or contentLang
    local userLang = frame
        and l.userLang():getCode()
        or 'szl'

    if pageLang == contentLang then
        link = keys[userLang]

        for i, l in ipairs(fallbacks[userLang] or {}) do
            if not link and keys[l] and not keys[l].new then
                link = keys[l]

                break
            end
        end
    end

    link = (link and not link.new)
        and link
        or keys[pageLang]

    if link.new then
        local langs = {}

        for l, _ in pairs(keys) do
            table.insert(langs, l)
        end

        table.sort(langs)

        link = keys[langs[1]]
    end

    do
        local lastPart = (link.page or ''):match('[^/]+$') or ''

        link.lang = mw.language.fetchLanguageName(lastPart) ~= ''
            and lastPart
            or contentLang
    end

    return link
end

--------------------------------------------------------------------------------
-- @function l.editData
-- @param {Links} links
-- @param {table} args1
-- @param {table} args2
-- @return {table}
--------------------------------------------------------------------------------
function l.editData(links, args1, args2)
    local frame = mw.getCurrentFrame()
    local userLang = frame:preprocess('{{int:' .. l.langMessage .. '}}')
    local pageLang = #mw.language.fetchLanguageName(title.subpageText) ~= 0
        and title.subpageText
        or l.pageLink(links, args1, args2).lang

    return tostring(mw.html.create('span')
        :attr('class', 'lang-select-data wds-is-hidden')
        -- Start LangSelect.js attributes.
        :attr('data-lang', pageLang)
        :attr('data-lang-name', mw.language.fetchLanguageName(pageLang))
        :attr('data-userlang-name', mw.language.fetchLanguageName(userLang))
        :attr('data-userlang-exists', tostring((links.keys[userLang] and not links.keys[userLang].new) or false))
        -- End LangSelect.js attributes.
    )
end

l.formats = {}

--------------------------------------------------------------------------------
-- @function l.formats.default
-- @param {Links} links
-- @param {table} args1
-- @param {table} args2
-- @param {string} root
-- @return {table}
--------------------------------------------------------------------------------
function l.formats.default(links, args1, args2, uselangs)
    local frame = mw.getCurrentFrame()

    local div = mw.html.create('div')
        :addClass(args1.class)

    if frame and l.userLang():isRTL() then
        div:attr('dir', 'rtl')
    end

    div
        :tag('strong')
            :wikitext(frame and frame:preprocess('[[w:c:dev:Languages|{{int:interlang-section-header-desktop}}]]') or 'Languages:')
            :done()
        :wikitext(' ')

    local separator = frame
        and frame:preprocess('{{int:pipe-separator}}')
        or '|'
    local highlight = mw.ustring.lower(args1.highlight or '')

    for i, v in ipairs(links.list) do
        if i > 1 then
            div:wikitext(' ' .. separator .. ' ')
        end

        local link = v.link

        link.tagName = 'span'
        link:attr('data-lang', v.lang)

        if highlight == v.lang then
            link:addClass('highlight')
        end

        div:node(link)
    end

    local selected = mw.ustring.lower(args1.select or '')

    if selected ~= '' then
        local flag = false

        if links.keys[selected] and not links.keys[selected].new then
            links.keys[selected].link:addClass('selected')
            flag = true
        else
            for i, v in ipairs(fallbacks[selected] or {}) do
                if links.keys[v] and not links.keys[v].new then
                    links.keys[v].link:addClass('selected')
                    flag = true

                    break
                end
            end
        end

        if not flag then
            links.keys.en.link:addClass('selected')
        end
    end

    if not uselangs then
        div = tostring(div) .. l.editData(links, args1, args2)
    end

    return div
end

--------------------------------------------------------------------------------
-- @function l.formats.uselangs
-- @param {Links} links
-- @param {table} args1
-- @param {table} args2
-- @param {string} root
-- @return {table}
--------------------------------------------------------------------------------
function l.formats.uselangs(links, args1, args2, root)
    local div = l.formats.default(links, args1, args2, root, true)

    for i, v in ipairs(div.nodes) do
        local node = div.nodes[i]

        if node.tagName ~= nil and getAttr(node, 'data-lang') then
            local lang = getAttr(node, 'data-lang')
            local langName = mw.language.fetchLanguageName(lang)

            if langName ~= '' then
                node.nodes = {}
                node:wikitext('[' .. tostring(mw.uri.fullUrl(root, {uselang = lang})) .. ' ' .. langName .. ']')
            end
        end
    end

    div = tostring(div) .. l.editData(links, args1, args2)

    return div
end

--------------------------------------------------------------------------------
-- @function l.formats.list
-- @param {Links} links
-- @param {table} args1
-- @param {table} args2
-- @return {table}
--------------------------------------------------------------------------------
function l.formats.list(links, args1, args2)
    local frame = mw.getCurrentFrame()

    local ul = mw.html.create('ul')
        :addClass(args1.class)

    if frame and l.userLang():isRTL() then
        ul:attr('dir', 'rtl')
    end

    local highlight = mw.ustring.lower(args1.highlight or '')

    for i, v in ipairs(links.list) do
        local link = v.link

        link.tagName = 'li'
        link:attr('data-lang', v.lang)

        if highlight == v.lang then
            link:addClass('highlight')
        end

        ul:node(link):newline()
    end

    local selected = mw.ustring.lower(args1.select or '')

    if selected ~= '' then
        local flag = false

        if links.keys[selected] and not links.keys[selected].new then
            links.keys[selected].link:addClass('selected')
            flag = true
        else
            for i, v in ipairs(fallbacks[selected] or {}) do
                if links.keys[v] and not links.keys[v].new then
                    links.keys[v].link:addClass('selected')
                    flag = true

                    break
                end
            end
        end

        if not flag then
            links.keys.en.link:addClass('selected')
        end
    end

    return ul
end

--------------------------------------------------------------------------------
-- @function l.formats.transclude
-- @param {Links} links
-- @param {table} args1
-- @param {table} args2
-- @return {table}
--------------------------------------------------------------------------------
function l.formats.transclude(links, args1, args2)
    local frame = mw.getCurrentFrame()

    local lang = frame
        and l.userLang():getCode()
        or 'szl'
    local link = l.pageLink(links, args1, args2)

    local res = mw.html.create('')

    local notice = mw.ustring.lower(args1.notice or '')

    if notice == 'top' or notice == 'both' then
        res
            :tag('div')
                :addClass('transclude-notice transclude-notice-top')
                :wikitext(intOrI18n('custom-languages-notice', link.page, tostring(mw.uri.fullUrl(link.page, 'action=edit')), '') or 'Here goes the notice')

        if frame and l.userLang():isRTL() then
            res:attr('dir', 'rtl')
        end

        res:done():newline()
    end

    if frame then
        if not pcall(function ()
            res:wikitext(frame:expandTemplate{
                title = mw.ustring.gsub(link.page, '^:*', ':')
            })
        end) then
            return args1.missing or '[[:' .. link.page .. ']]'
        end

    else
        res:wikitext('Here goes the transcluded page: ' .. mw.ustring.gsub(link.page, '^:*', ':'))
    end

    if notice == 'bottom' or notice == 'both' then
        res
            :newline()
            :tag('div')
                :addClass('transclude-notice transclude-notice-bottom')
                :wikitext(intOrI18n('custom-languages-notice', link.page, tostring(mw.uri.fullUrl(link.page, 'action=edit')), '*') or 'Here goes the notice')

        if frame and l.userLang():isRTL() then
            res:attr('dir', 'rtl')
        end
    end

    return res
end

--------------------------------------------------------------------------------
-- @function l.formats.interwiki
-- @param {Links} links
-- @param {table} args1
-- @param {table} args2
-- @param {string} prefixedRoot
-- @return {table}
--------------------------------------------------------------------------------
function l.formats.interwiki(links, args1, args2, prefixedRoot)
    local str = ''
    local frame = mw.getCurrentFrame()

    for k, v in ipairs(links.list) do
        if not v.new and v.lang ~= contentLang then
            str = str .. '[[' .. v.lang .. ':' .. prefixedRoot .. '/' .. v.lang .. ']]'
        end
    end

    str = str .. l.editData(links, args1, args2)

    return frame
        and frame:preprocess(str)
        or mw.text.nowiki(str)
end

--------------------------------------------------------------------------------
-- @function l.subpages
-- @param {string} page
-- @param[opt] {string} namespace
-- @return {table}
--------------------------------------------------------------------------------
function l.subpages(page, namespace)
    local frame = mw.getCurrentFrame()

    if frame == nil then
        return {'en', 'fr', 'pl', 'es', 'de', 'bad-code'}
    end

    local existing = mw.ustring.lower(frame:preprocess('{{#dpl:namespace=' .. (namespace or '') .. '|titleregexp=^' .. escRx(page, true) .. '\\/[a-z-]+$|replaceintitle=/^' .. escRx(page, false) .. '\\//,|redirects=include|skipthispage=no|format=¦,%TITLE%¦|noresultsheader=¦¦}}'))

    existing = select(3, mw.ustring.find(existing, '^%s*%|([%|a-z-]*)%|%s*$'))

    if existing then
        return mw.text.split(existing, '%s*|%s*')
    end
end

--------------------------------------------------------------------------------
-- @function l.langs
-- @param {Frame} frame
-- @return {string}
--------------------------------------------------------------------------------
function l.langs(frame)
    -- Invoke-only parameters
    local args1 = getArgs(frame, {
        trim = true,
        removeBlanks = true,
        frameOnly = true,
        readOnly = true
    })

    -- Overwritable parameters
    local args2 = getArgs(frame, {
        trim = true,
        removeBlanks = true,
        parentFirst = true,
        readOnly = true
    })

    -- Get the root page name
    local root
    local rootTitle = args1.page
        and mw.title.new(args1.page)
        or mw.title.getCurrentTitle()

    if
        mw.ustring.find(rootTitle.subpageText, '[a-z-]+') and
        mw.language.fetchLanguageName(rootTitle.subpageText) ~= ''
    then
        root = rootTitle.baseText
    else
        root = rootTitle.text
    end

    local prefixedRoot = rootTitle.nsText

    prefixedRoot = mw.ustring.gsub(prefixedRoot .. ':' .. root, '^:*', '')

    -- Must-have languages
    local langs = {}

    for i, v in ipairs(args1 or {}) do
        v = mw.ustring.lower(mw.text.trim(v or ''))

        if v ~= '' then
            langs[v] = false
        end
    end

    langs[contentLang] = true

    -- Go over subpages of root
    local existing = l.subpages(root, rootTitle.nsText) or {}

    for i, v in ipairs(existing) do
        if v ~= '' then
            if v == contentLang then -- English has a separate subpage
                langs[contentLang] = mw.ustring.gsub(rootTitle.nsText .. ':' .. root, '^:', '') .. '/' .. contentLang
            else
                langs[v] = true
            end
        end
    end

    -- Look for parameters overriding language pages
    for k, v in pairs(args2) do
        if type(k) == 'string' and mw.language.fetchLanguageName(k) ~= '' then
            langs[k] = v
        end
    end

    -- Get a list of langs sorted by code
    local ordered = {}

    for k, v in pairs(langs) do
        if k ~= contentLang then
            ordered[#ordered + 1] = k
        end
    end

    table.sort(ordered)
    table.insert(ordered, 1, contentLang) -- with English being first

    -- Get list of links
    local links = prepLinks(prefixedRoot, langs, ordered, args1.editintro)

    -- Pass to format function
    local format = mw.ustring.lower(args1.format or 'interwiki')

    return l.formats[format](links, args1, args2, prefixedRoot)
end

--------------------------------------------------------------------------------
-- Preload function for i18n documentation
--
-- @function l.preload
-- @param {Frame} frame
-- @return {string}
--------------------------------------------------------------------------------
function l.preload(frame)
    -- Fetch page
    local page = frame.args[1]
    local namespace = frame.args[2]
    if namespace ~= '' then
        page = namespace .. ':' .. page
    end
    local txt = mw.title.new(page):getContent():gsub('<!%-(.-)%->', '')

    -- Generate untranslated doc
    local ret = '{{Untranslated}}\n'
    local tbl, i18n

    -- Temporary parsing of legacy i18n
    local LANGSELECT = '{{LangSelect}}'
    local LANGUAGES = '{{Languages}}'
    local txtInline = mw.text.trim((txt:gsub('\n', '')))

    if
        txtInline == LANGSELECT or
        txtInline == LANGSELECT .. LANGUAGES or
        txtInline == LANGUAGES .. LANGSELECT
    then
        ret = ret .. mw.title.new(page .. '/en'):getContent():gsub('<!%-(.-)%->', '')

    elseif not txt:find('{{{') then
        ret = ret .. frame:preprocess(txt)

    -- Parsing parameter defaults in base page
   else
        ret = ret .. '{{:' .. page

        for en in txt:gmatch('{{%b{}}}') do
            en = en:match('^{{{(.-)}}}$')
            tbl = mw.text.split(en, '|')
            i18n = {
                key = en:match('^([^|]+)') or '',
                val = en:match('^[^|]+|*(.*)$') or ''
            }

            if not ret:find('| ' .. (i18n.key:gsub('%-', '%%-')) .. ' = ') then
                ret = ret .. '\n| ' .. i18n.key .. ' = ' .. i18n.val
            end
        end

        ret = ret .. '\n}}'

    end

    return ret

end

return l