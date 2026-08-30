-- <nowiki>
--------------------------------------------------------------------------------
--                              Module:Hatnote                                --
--                                                                            --
-- This module produces hatnote links and links to related articles. It       --
-- implements the {{hatnote}} and {{format link}} meta-templates and includes --
-- helper functions for other Lua hatnote modules.                            --
--------------------------------------------------------------------------------

local libraryUtil = require('libraryUtil')
local checkType = libraryUtil.checkType
local mArguments = require('Module:Arguments')
local yesno = require('Module:Yesno')
local mTableTools = require('Module:TableTools')
local i18n = require('Module:I18n').loadMessages('Hatnote')
local hatnote = {}

--------------------------------------------------------------------------------
-- Helper functions
--------------------------------------------------------------------------------

local function getArgs(frame)
    -- Fetches the arguments from the parent frame. Whitespace is trimmed and
    -- blanks are removed.
    return mArguments.getArgs(frame, {parentOnly = true})
end

local function removeInitialColon(s)
    -- Removes the initial colon from a string, if present.
    return s:match('^:?(.*)')
end

function hatnote.findNamespaceId(link, removeColon)
    -- Finds the namespace id (namespace number) of a link or a pagename. This
    -- function will not work if the link is enclosed in double brackets. Colons
    -- are trimmed from the start of the link by default. To skip colon
    -- trimming, set the removeColon parameter to false.
    checkType('findNamespaceId', 1, link, 'string')
    checkType('findNamespaceId', 2, removeColon, 'boolean', true)
    if removeColon ~= false then
        link = removeInitialColon(link)
    end
    local namespace = link:match('^(.-):')
    if namespace then
        local nsTable = mw.site.namespaces[namespace]
        if nsTable then
            return nsTable.id
        end
    end
    return 0
end

function hatnote.quote(title)
	--Wraps titles in quotation marks. If the title starts/ends with a quotation
	--mark, kerns that side as with {{-'}}
	local quotationMarks = {
		["'"]=true, ['"']=true, ['“']=true, ["‘"]=true, ['”']=true, ["’"]=true
	}
	local quoteLeft, quoteRight = -- Test if start/end are quotation marks
		quotationMarks[string.sub(title,  1,  1)],
		quotationMarks[string.sub(title, -1, -1)]
	if quoteLeft or quoteRight then
		title = mw.html.create("span"):wikitext(title)
	end
	if quoteLeft  then title:css("padding-left",  "0.15em") end
	if quoteRight then title:css("padding-right", "0.15em") end
	return '"' .. tostring(title) .. '"'
end

function hatnote.formatPages(...)
    -- Formats a list of pages using formatLink and returns it as an array. Nil
    -- values are not allowed.
    local pages = {...}
    local ret = {}
    for i, page in ipairs(pages) do
        ret[i] = hatnote._formatLink(page)
    end
    return ret
end

function hatnote.formatPageTables(...)
    -- Takes a list of page/display tables and returns it as a list of
    -- formatted links. Nil values are not allowed.
    local pages = {...}
    local links = {}
    for i, t in ipairs(pages) do
        checkType('formatPageTables', i, t, 'table')
        local link = t[1]
        local display = t[2]
        links[i] = hatnote._formatLink(link, display)
    end
    return links
end

function hatnote.makeWikitextError(msg, helpLink, addTrackingCategory, title)
    -- Formats an error message to be returned to wikitext. If
    -- addTrackingCategory is not false after being returned from
    -- [[Module:Yesno]], and if we are not on a talk page, a tracking category
    -- is added.
    checkType('makeWikitextError', 1, msg, 'string')
    checkType('makeWikitextError', 2, helpLink, 'string', true)
    title = title or mw.title.getCurrentTitle()
    -- Make the help link text.
    local helpText
    if helpLink then
        helpText = ' ([[' .. helpLink .. '|' .. i18n:msg('help') .. ']])'
    else
        helpText = ''
    end
    -- Make the category text.
    local category
    if not title.isTalkPage and yesno(addTrackingCategory) ~= false then
        category = i18n:msg('cat-errors')
        category = string.format(
            '[[%s:%s]]',
            mw.site.namespaces[14].name,
            category
        )
    else
        category = ''
    end
    return string.format(
        i18n:msg('error'),
        msg,
        helpText,
        category
    )
end

function hatnote.disambiguate(page, disambiguator)
    -- Formats a page title with a disambiguation parenthetical,
    -- i.e. "Example" → "Example (disambiguation)".
    checkType('disambiguate', 1, page, 'string')
    checkType('disambiguate', 2, disambiguator, 'string', true)
    disambiguator = disambiguator or i18n:msg('disambiguation')
    return string.format(i18n:msg('brackets'), page, disambiguator)
end

--------------------------------------------------------------------------------
-- Format link
--
-- Makes a wikilink from the given link and display values. Links are escaped
-- with colons if necessary, and links to sections are detected and displayed
-- with " § " as a separator rather than the standard MediaWiki "#". Used in
-- the {{format link}} template.
--------------------------------------------------------------------------------

function hatnote.formatLink(frame)
    local args = getArgs(frame)
    local link = args[1]
    local display = args[2]
    if not link then
        return hatnote.makeWikitextError(
            i18n:msg('error-link'),
            'w:c:dev:Template:Format link#Errors',-- there is no actual docs for this. not even on wikipedia
            args.category
        )
    end
    return hatnote._formatLink(link, display)
end

function hatnote._formatLink(link, display)
    checkType('_formatLink', 1, link, 'string')
    checkType('_formatLink', 2, display, 'string', true)

    -- Remove the initial colon for links where it was specified manually.
    link = removeInitialColon(link)

    -- Find whether a faux display value has been added with the {{!}} magic
    -- word.
    if not display then
        local prePipe, postPipe = link:match('^(.-)|(.*)$')
        link = prePipe or link
        display = postPipe
    end

    -- Find the display value.
    if not display then
        local page, section = link:match('^(.-)#(.*)$')
        if page then
            display = page .. ' §&nbsp;' .. section
        end
    end

    -- Assemble the link.
    if display then
        return string.format(
            '[[:%s|%s]]',
            string.gsub(link, '|(.*)$', ''), --display overwrites manual piping
            display
        )
    else
        return string.format('[[:%s]]', link)
    end
end

--------------------------------------------------------------------------------
-- Hatnote
--
-- Produces standard hatnote text. Implements the {{hatnote}} template.
--------------------------------------------------------------------------------

function hatnote.hatnote(frame)
    local args = getArgs(frame)
    local s = args[1]
    local options = {}
    if not s then
        return hatnote.makeWikitextError(
            i18n:msg('error-text'),
            'w:c:dev:Template:Hatnote#Errors',
            args.category
        )
    end
    options.extraclasses = args.extraclasses
    options.selfref = args.selfref
    return hatnote._hatnote(s, options)
end

function hatnote._hatnote(s, options)
    checkType('_hatnote', 1, s, 'string')
    checkType('_hatnote', 2, options, 'table', true)
    options = options or {}
    local classes = {'notice', 'hatnote'}
    local extraclasses = options.extraclasses
    local selfref = options.selfref
    if type(extraclasses) == 'string' then
        classes[#classes + 1] = extraclasses
    end
    if selfref then
        classes[#classes + 1] = 'selfref'
    end
    return string.format(
        '<div role="note" class="%s">%s</div>',
        table.concat(classes, ' '),
        s
    )
end

--------------------------------------------------------------------------------
--                           Module:Hatnote list                              --
--                                                                            --
-- This module produces and formats lists for use in hatnotes. In particular, --
-- it implements the for-see list, i.e. lists of "For X, see Y" statements,   --
-- as used in {{about}}, and its variants. Also introduced are andList &      --
-- orList helpers for formatting lists with those conjunctions.               --
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- List stringification helper functions
--
-- These functions are used for stringifying lists, usually page lists inside
-- the "Y" portion of "For X, see Y" for-see items.
--------------------------------------------------------------------------------

--default options table used across the list stringification functions
local stringifyListDefaultOptions = {
    conjunction = i18n:msg('conjunction'),
    separator = i18n:msg('separator'),
    altSeparator = i18n:msg('altSeparator'),
    space = i18n:msg('space'),
    formatted = false
}

-- Stringifies a list generically; probably shouldn't be used directly
function stringifyList(list, options)
    -- Type-checks, defaults, and a shortcut
    checkType("stringifyList", 1, list, "table")
    if #list == 0 then return nil end
    checkType("stringifyList", 2, options, "table", true)
    options = options or {}
    for k, v in pairs(stringifyListDefaultOptions) do
        if options[k] == nil then options[k] = v end
    end
    local s = options.space
    -- Format the list if requested
    if options.formatted then list = hatnote.formatPages(unpack(list)) end
    -- Set the separator; if any item contains it, use the alternate separator
    local separator = options.separator
    --searches display text only
    function searchDisp(t, f)
        return string.find(string.sub(t, (string.find(t, '|') or 0) + 1), f)
    end
    for k, v in pairs(list) do
        if searchDisp(v, separator) then
            separator = options.altSeparator
            break
        end
    end
    -- Set the conjunction, apply Oxford comma, and force a comma if #1 has "§"
    local oxfordLangs = {
        -- list of languages that does respect oxford commas
        ['en'] = true,
        ['en-us'] = true,
        ['en-gb'] = true,
    }

    local conjunction = s .. options.conjunction .. s
    if #list == 2 and searchDisp(list[1], "§") or #list > 2 then
        conjunction = (oxfordLangs[i18n.defaultLang] and separator or '') .. conjunction
    end
    -- Return the formatted string
    return mw.text.listToText(list, separator .. s, conjunction)
end

--DRY function
function conjList (conj, list, fmt)
    return stringifyList(list, {conjunction = conj, formatted = fmt})
end

-- Stringifies lists with "and" or "or"
function hatnote.andList (...) return conjList(i18n:msg('conj-and'), ...) end
function hatnote.orList (...) return conjList(i18n:msg('conj-or'), ...) end

--------------------------------------------------------------------------------
-- For see
--
-- Makes a "For X, see [[Y]]." list from raw parameters. Intended for the
-- {{about}} templates and their variants.
--------------------------------------------------------------------------------

--default options table used across the forSee family of functions
local forSeeDefaultOptions = {
    andKeyword = i18n:msg('conj-and'),
    title = mw.title.getCurrentTitle().text,
    otherText = i18n:msg('other-uses'),
    forSeeForm = i18n:msg('for')
}

--Collapses duplicate punctuation
function punctuationCollapse (text)
    local replacements = {
        ["%.%.$"] = ".",
        ["%?%.$"] = "?",
        ["%!%.$"] = "!",
        ["%.%]%]%.$"] = ".]]",
        ["%?%]%]%.$"] = "?]]",
        ["%!%]%]%.$"] = "!]]"
    }
    for k, v in pairs(replacements) do text = string.gsub(text, k, v) end
    return text
end

-- Structures arguments into a table for stringification, & options
function hatnote.forSeeArgsToTable (args, from, options)
    -- Type-checks and defaults
    checkType("forSeeArgsToTable", 1, args, 'table')
    checkType("forSeeArgsToTable", 2, from, 'number', true)
    from = from or 1
    checkType("forSeeArgsToTable", 3, options, 'table', true)
    options = options or {}
    for k, v in pairs(forSeeDefaultOptions) do
        if options[k] == nil then options[k] = v end
    end
    -- maxArg's gotten manually because getArgs() and table.maxn aren't friends
    local maxArg = 0
    for k, v in pairs(args) do
        if type(k) == 'number' and k > maxArg then maxArg = k end
    end
    -- Structure the data out from the parameter list:
    -- * forTable is the wrapper table, with forRow rows
    -- * Rows are tables of a "use" string & a "pages" table of pagename strings
    -- * Blanks are left empty for defaulting elsewhere, but can terminate list
    local forTable = {}
    local i = from
    local terminated = false
    -- Loop to generate rows
    repeat
        -- New empty row
        local forRow = {}
        -- On blank use, assume list's ended & break at end of this loop
        forRow.use = args[i]
        if not args[i] then terminated = true end
        -- New empty list of pages
        forRow.pages = {}
        -- Insert first pages item if present
        table.insert(forRow.pages, args[i + 1])
        -- If the param after next is "and", do inner loop to collect params
        -- until the "and"'s stop. Blanks are ignored: "1|and||and|3" → {1, 3}
        while args[i + 2] == options.andKeyword do
            if args[i + 3] then
                table.insert(forRow.pages, args[i + 3])
            end
            -- Increment to next "and"
            i = i + 2
        end
        -- Increment to next use
        i = i + 2
        -- Append the row
        table.insert(forTable, forRow)
    until terminated or i > maxArg

    return forTable
end

-- Stringifies a table as formatted by forSeeArgsToTable
function hatnote.forSeeTableToString (forSeeTable, options)
    -- Type-checks and defaults
    checkType("forSeeTableToString", 1, forSeeTable, "table")
    checkType("forSeeTableToString", 2, options, "table", true)
    options = options or {}
    for k, v in pairs(forSeeDefaultOptions) do
        if options[k] == nil then options[k] = v end
    end
    -- Stringify each for-see item into a list
    local strList = {}
    for k, v in pairs(forSeeTable) do
        local useStr = v.use or options.otherText
        local pagesStr = hatnote.andList(v.pages, true) or
            hatnote._formatLink(hatnote.disambiguate(options.title))
        local forSeeStr = string.format(options.forSeeForm, useStr, pagesStr)
        forSeeStr = punctuationCollapse(forSeeStr)
        table.insert(strList, forSeeStr)
    end
    -- Return the concatenated list
    return table.concat(strList, i18n:msg('space'))
end

-- Produces a "For X, see [[Y]]" string from arguments. Expects index gaps
-- but not blank/whitespace values. Ignores named args and args < "from".
function hatnote._forSee (args, from, options)
    local forSeeTable = hatnote.forSeeArgsToTable(args, from, options)
    return hatnote.forSeeTableToString(forSeeTable, options)
end

-- As _forSee, but uses the frame.
function hatnote.forSee (frame, from, options)
    return hatnote._forSee(mArguments.getArgs(frame), from, options)
end

--------------------------------------------------------------------------------
-- Produces a labelled pages-list hatnote.
-- The main frame (template definition) takes 1 or 2 arguments, for a singular
-- and (optionally) plural label respectively:
-- * {{#invoke:Hatnote|labelledList|Singular label|Plural label}}
-- The resulting template takes pagename & label parameters normally.
--------------------------------------------------------------------------------
-- Defaults global to this module
local LPLHdefaults = {
    label = i18n:msg('see-also'), --Final fallback for label argument
    labelForm = i18n:msg('colon'),
    prefixes = {'label', 'label ', 'l'},
    template = 'Module:Hatnote'
}

-- Helper function that pre-combines display parameters into page arguments.
-- Also compresses sparse arrays, as a desirable side-effect.
function hatnote.preprocessDisplays (args, prefixes)
    -- Prefixes specify which parameters, in order, to check for display options
    -- They each have numbers auto-appended, e.g. 'label1', 'label 1', & 'l1'
    prefixes = prefixes or LPLHdefaults.prefixes
    local pages = {}
    for k, v in pairs(args) do
        if type(k) == 'number' then
            local display
            for i = 1, #prefixes do
                display = args[prefixes[i] .. k]
                if display then break end
            end
            local page = display and
                string.format('%s|%s', string.gsub(v, '|.*$', ''), display) or v
            pages[#pages + 1] = page
        end
    end
    return pages
end

function hatnote.labelledList (frame)
    local labels = {frame.args[1] or LPLHdefaults.label}
    labels[2] = frame.args[2] or labels[1]
    local template = frame:getParent():getTitle()
    local args = mArguments.getArgs(frame, {parentOnly = true})
    local pages = hatnote.preprocessDisplays(args)
    local options = {
        extraclasses = frame.args.extraclasses,
        category = args.category,
        selfref = frame.args.selfref or args.selfref,
        template = template
    }
    return hatnote._labelledList(pages, labels, options)
end

function hatnote._labelledList (pages, labels, options)
    labels = labels or {}
    if #pages == 0 then
        return hatnote.makeWikitextError(
            i18n:msg('error-pagename', 2),
            (options.template or LPLHdefaults.template) .. '#Errors',
            options.category
        )
    end
    label = (#pages == 1 and labels[1] or labels[2]) or LPLHdefaults.label
    local text = string.format(
        options.labelForm or LPLHdefaults.labelForm,
        label,
        hatnote.andList(pages, true)
    )
    local hnOptions = {
        extraclasses = options.extraclasses,
        selfref = options.selfref
    }
    return hatnote._hatnote(text, hnOptions)
end


--------------------------------------------------------------------------------
-- About
--
-- These functions implement the {{about}} hatnote template.
--------------------------------------------------------------------------------
function hatnote.about (frame)
    -- A passthrough that gets args from the frame and all
    args = mArguments.getArgs(frame)
    return hatnote._about(args)
end


function hatnote._about (args, options)
    -- Produces "about" hatnote.

    -- Type checks and defaults
    checkType('_about', 1, args, 'table', true)
    args = args or {}
    checkType('_about', 2, options, 'table', true)
    options = options or {}
    local defaultOptions = {
        aboutForm = i18n:msg('about', mw.title.getCurrentTitle().namespace),
        defaultPageType = i18n:msg('page'),
        namespace = mw.title.getCurrentTitle().namespace,
        otherText = nil, --included for complete list
        pageTypesByNamespace = {
            [0] =  i18n:msg('pagetype-0'),
            [14] = i18n:msg('pagetype-14')
        },
        sectionString = i18n:msg('section')
    }
    for k, v in pairs(defaultOptions) do
        if options[k] == nil then options[k] = v end
    end

    -- Set initial "about" string
    local pageType = (args.section and options.sectionString) or
        options.pageTypesByNamespace[options.namespace] or
        options.defaultPageType
    local about = ''
    if args[1] then
        about = string.format(options.aboutForm, pageType, args[1])
    end

    --Allow passing through certain options
    local fsOptions = {
        otherText = options.otherText
    }

    -- Set for-see list
    local forSee = i18n:msg('space') .. hatnote._forSee(args, 2, fsOptions)

    -- Concatenate and return
    return hatnote._hatnote(about .. forSee, {extraclasses = 'context-link about dablink'})
end

--------------------------------------------------------------------------------
-- Details
--
-- These functions implement the {{details}} hatnote template.
--------------------------------------------------------------------------------
function hatnote.details (frame)
    local args = mArguments.getArgs(frame, {parentOnly = true})
    local topic, category = args.topic, args.category
    local options = {
        selfref = args.selfref,
        extraclasses = 'context-link details dablink'
    }
    args = mTableTools.compressSparseArray(args)
    if #args == 0 then
        return hatnote.makeWikitextError(
            i18n:msg('error-pagename'),
            'w:c:dev:Template:Details#Errors',-- another undocumented thing
            category
        )
    end
    return hatnote._details(args, topic, options)
end

function hatnote._details (list, topic, options)
    list = hatnote.andList(list, true)
    topic = topic or i18n:msg('topic')
    local text = string.format(i18n:msg('details'), topic, list)
    return hatnote._hatnote(text, options)
end

--------------------------------------------------------------------------------
-- For
--
-- These functions implement the {{for}} hatnote template.
--------------------------------------------------------------------------------
function hatnote.For (frame)
    return hatnote._For(mArguments.getArgs(frame))
end

--Implements {{For}} but takes a manual arguments table
function hatnote._For (args)
    local use = args[1]
    local category = ''
    if (not use or use == i18n:msg('other-uses')) and
        (not args.category or yesno(args.category)) then
        category = '[[Category:' .. i18n:msg('cat-unusual-parameters') .. ']]'
    end
    local pages = {}
    function two (a, b) return a, b, 1 end --lets us run ipairs from 2
    for k, v in two(ipairs(args)) do table.insert(pages, v) end
    return hatnote._hatnote(
        hatnote.forSeeTableToString({{use = use, pages = pages}}),
        {selfref = args.selfref}
    ) .. category
end

--------------------------------------------------------------------------------
-- Further
--
-- These functions implement the {{further}} hatnote template.
--------------------------------------------------------------------------------
function hatnote.further(frame)
    local args = mArguments.getArgs(frame, {parentOnly = true})
    local pages = mTableTools.compressSparseArray(args)
    if #pages < 1 then
        return hatnote.makeWikitextError(
            i18n:msg('error-pagename', 2),
            'w:c:dev:Template:Further#Errors',-- undocumented thing #3
            args.category
        )
    end
    local options = {
        selfref = args.selfref,
        extraclasses = 'context-link further dablink'
    }
    return hatnote._further(pages, options)
end

function hatnote._further(pages, options)
    local text = i18n:msg('further2') .. hatnote.andList(pages, true)
    return hatnote._hatnote(text, options)
end

--------------------------------------------------------------------------------
-- Main
--
-- These functions implement the {{main}} hatnote template.
--------------------------------------------------------------------------------
function hatnote.main(frame)
    local args = mArguments.getArgs(frame, {parentOnly = true})
    local pages = {}
    for k, v in pairs(args) do
        if type(k) == 'number' then
            local display = args['label ' .. k] or args['l' .. k]
            local page = display and
                string.format('%s|%s', string.gsub(v, '|.*$', ''), display) or v
            pages[#pages + 1] = page
        end
    end
    if #pages == 0 and mw.title.getCurrentTitle().namespace == 0 then
        return hatnote.makeWikitextError(
            i18n:msg('error-pagename', 2),
            'w:c:dev:Template:Main#Errors',-- undocumented thing #4
            args.category
        )
    end
    local options = {
        selfref = args.selfref
    }
    return hatnote._main(pages, options)
end

function hatnote._main(args, options)
    -- Get the list of pages. If no first page was specified we use the current
    -- page name.
    local currentTitle = mw.title.getCurrentTitle()
    if #args == 0 then args = {currentTitle.text} end
    local firstPage = string.gsub(args[1], '|.*$', '')
    -- Make the formatted link text
    list = hatnote.andList(args, true)
    -- Build the text.
    local isPlural = #args > 1
    -- Find the pagetype.
    local pageType = hatnote.findNamespaceId(firstPage) == 0 and i18n:msg('article', isPlural and 2 or 1) or i18n:msg('page', isPlural and 2 or 1)
    local mainForm
    local curNs = currentTitle.namespace
    if (curNs == 14) or (curNs == 15) then --category/talk namespaces
        mainForm = isPlural and i18n:msg('main-category', 2)
         or
         i18n:msg('main-category', 1)
    else
        mainForm = isPlural and i18n:msg('main', 2) or i18n:msg('main', 1)
    end
    local text = string.format(mainForm, pageType, list)
    options = options or {}
    local hnOptions = {
        selfref = options.selfref,
        extraclasses = 'context-link main dablink'
    }
    return hatnote._hatnote(text, hnOptions)
end

--------------------------------------------------------------------------------
-- See also
--
-- These functions implement the {{see also}} hatnote template.
--------------------------------------------------------------------------------
function hatnote.seeAlso(frame)
    local args = mArguments.getArgs(frame, {parentOnly = true})
    local pages = {}
    for k, v in pairs(args) do
        if type(k) == 'number' then
            local display = args['label ' .. k] or args['l' .. k]
            local page = display and
                string.format('%s|%s', string.gsub(v, '|.*$', ''), display) or v
            pages[#pages + 1] = page
        end
    end
    if not pages[1] then
        return hatnote.makeWikitextError(
            i18n:msg('error-pagename', 2),
            'w:c:dev:Template:See also#Errors',-- undocumented thing #5
            args.category
        )
    end
    local options = {
        selfref = args.selfref
    }
    return hatnote._seeAlso(pages, options)
end

function hatnote._seeAlso(args, options)
    checkType('_seeAlso', 1, args, 'table')
    checkType('_seeAlso', 2, options, 'table', true)
    options = options or {}
    local list = hatnote.andList(args, true)
    local text = string.format(i18n:msg('see-also2'), list)
    -- Pass options through.
    local hnOptions = {
        selfref = options.selfref,
        extraclasses = 'context-link seealso dablink'
    }
    return hatnote._hatnote(text, hnOptions)
end

hatnote['for'] = hatnote.For

return hatnote