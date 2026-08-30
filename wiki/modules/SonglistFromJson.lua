--[[
  Module:SonglistFromJson
  Reads <Artist>/Songs/songs.json and renders wikitext table rows for {{SonglistTable}}.

  The module returns wikitext  |-  rows so they slot directly into the
  {| ... |} wikitext table in {{SonglistTable}}.  Template calls such as
  {{yt|id}}, {{feat|Name}}, {{Deleted media|site=yt}} are embedded as
  plain wikitext strings and expanded by the parser at transclude time.

  Usage:
    {{#invoke:SonglistFromJson|render}}                          -- infers from current title
    {{#invoke:SonglistFromJson|render|json=Ado/Songs/songs.json}}
--]]

local p = {}

-- ── Helpers ───────────────────────────────────────────────────────────────────

--- HTML-escape plain-text values (title, IDs, dates).
--- Do NOT call on wikitext strings (notes, template calls).
local function esc( s )
    if not s then return '' end
    s = tostring( s )
    s = s:gsub( '&',  '&amp;'  )
    s = s:gsub( '<',  '&lt;'   )
    s = s:gsub( '>',  '&gt;'   )
    s = s:gsub( '"',  '&quot;' )
    return s
end

--- Strip characters that would break a wikitext template call from a value
--- that will be placed directly inside {{ }}.
local function safeId( s )
    if not s or s == '' then return '' end
    return tostring( s ):gsub( '[|{}%[%]]', '' )
end

--- Join a site-key list into the |site= argument of {{Deleted media}} /
--- {{Privated media}}.
---
--- The values go straight into a template call that is then preprocessed, so an
--- entry like  yt}}{{Some other template}}{{Deleted media|site=x  would close
--- the call and expand whatever it liked (F2). The CRUD form can only produce
--- yt / nnd / bb, but a spreadsheet cell or a raw JSON edit can produce
--- anything, so sanitise here rather than trusting the writer.
---
--- safeId strips the template metacharacters; the comma is the separator itself,
--- so it goes too, and empties are dropped so a stray '' cannot leave a dangling
--- |site=,, in the call.
local function safeSiteList( list )
    local out = {}
    for _, site in ipairs( list or {} ) do
        local s = safeId( tostring( site ) ):gsub( ',', '' )
        s = s:match( '^%s*(.-)%s*$' )
        if s ~= '' then table.insert( out, s ) end
    end
    return table.concat( out, ',' )
end

--- Sanitise a single artist value for safe use inside {{feat|...}}.
--- Normalises legacy {{!}}, strips { } to block template injection,
--- and removes bare | that sit outside [[ ]] / [ ] bracket spans.
local function sanitiseArtist( s )
    s = tostring( s )
    s = s:gsub( '{{!}}', '|' )
    s = s:gsub( '[{}]', '' )
    local safe = {}
    local pos, len = 1, #s
    while pos <= len do
        local b, e = s:find( '%[%[.-%]%]', pos )
        if not b then b, e = s:find( '%b[]', pos ) end
        if b then
            if b > pos then
                table.insert( safe, ( s:sub( pos, b - 1 ):gsub( '|', '' ) ) )
            end
            table.insert( safe, s:sub( b, e ) )
            pos = e + 1
        else
            table.insert( safe, ( s:sub( pos ):gsub( '|', '' ) ) )
            pos = len + 1
        end
    end
    return table.concat( safe )
end

-- ── Column builders (return wikitext strings) ─────────────────────────────────

--- Title cell content.
--- The base title is wrapped in .slcrud-title-text so the CRUD gadget can
--- extract it cleanly even when translation / version are also present.
local function titleContent( song )
    local base  = esc( song.title or '(untitled)' )
    local ver   = song.version
    local trans = song.title_translation
    local note  = song.title_note

    local s = '<span class="slcrud-title-text">' .. base .. '</span>'

    if ver and ver ~= '' then
        s = s .. '&#160;<small>-' .. esc( ver ) .. ' ver.-</small>'
    end
    if trans and trans ~= '' then
        s = s .. '<br/><small>(' .. esc( trans ) .. ')</small>'
    end
    if note and note ~= '' then
        s = s .. '<br/><small>' .. esc( note ) .. '</small>'
    end

    return s
end

--- Streaming services cell content.
--- YouTube and NicoNico always render (disabled icon when missing).
--- Bilibili renders only when a BB ID is present.
--- frame is required so each {{template}} call is expanded individually,
--- keeping the wikitext table row syntax (|- / |) intact for the parser.
local function streamingContent( frame, song )
    local yt  = safeId( song.youtube_id )
    local nnd = safeId( song.niconico_id )
    local bb  = safeId( song.bilibili_id )

    local parts = {}

    if yt ~= '' then
        table.insert( parts, frame:preprocess( '{{yt|' .. yt .. '}}' ) )
    else
        table.insert( parts, frame:preprocess( '{{yt|no link available|forcedisabled=true}}' ) )
    end

    if nnd ~= '' then
        table.insert( parts, frame:preprocess( '{{nnd|' .. nnd .. '}}' ) )
    else
        table.insert( parts, frame:preprocess( '{{UWI|icon=nicovideo|class=uw-lg}}' ) )
    end

    if bb ~= '' then
        table.insert( parts, frame:preprocess( '{{bb|' .. bb .. '}}' ) )
    end

    return table.concat( parts, '' )
end

--- Featured artists cell content.
--- Sanitisation is delegated to sanitiseArtist(); see its doc comment for details.
--- frame:preprocess is used so {{feat|[[Page|Display]]}} → rendered HTML span
--- rather than being returned as unexpanded wikitext.
local function featContent( frame, song )
    local fa = song.featured_artists
    if not fa or #fa == 0 then return '&ndash;' end

    local parts = {}
    for _, artist in ipairs( fa ) do
        local s = sanitiseArtist( tostring( artist ) )
        if s ~= '' then
            table.insert( parts, frame:preprocess( '{{feat|' .. s .. '}}' ) )
        end
    end

    return #parts > 0 and table.concat( parts, '' ) or '&ndash;'
end

--- Additional information cell content.
--- Order: Orikyoku → Self-cover → Notes → Status templates.
--- Notes are NOT escaped — they may contain wikitext (links, templates).
local function infoContent( frame, song )
    local parts = {}

    if song.is_original then
        table.insert( parts, frame:preprocess( '{{Orikyoku}}' ) )
    end

    if song.is_self_cover then
        table.insert( parts, frame:preprocess( '{{Self cover}}' ) )
    end

    for _, note in ipairs( song.notes or {} ) do
        local n = tostring( note )
        if n ~= '' then
            -- Notes may themselves contain template calls; preprocess them too.
            table.insert( parts, '(' .. frame:preprocess( n ) .. ')' )
        end
    end

    -- Prefer the arrays (added by the CRUD gadget); fall back to flat status string.
    local deletedSites  = song.deleted_sites  or {}
    local privatedSites = song.privated_sites or {}

    local deletedArg  = safeSiteList( deletedSites )
    local privatedArg = safeSiteList( privatedSites )

    if deletedArg ~= '' then
        table.insert( parts, frame:preprocess( '{{Deleted media|site=' .. deletedArg .. '}}' ) )
    elseif #deletedSites > 0 or song.status == 'deleted' then
        -- Entries that sanitised away to nothing still mean "this was deleted",
        -- so fall back to the bare template rather than dropping the marker.
        table.insert( parts, frame:preprocess( '{{Deleted media}}' ) )
    end

    if privatedArg ~= '' then
        table.insert( parts, frame:preprocess( '{{Privated media|site=' .. privatedArg .. '}}' ) )
    elseif #privatedSites > 0 or song.status == 'private' then
        table.insert( parts, frame:preprocess( '{{Privated media}}' ) )
    end

    if     song.status == 'community_only' then table.insert( parts, "'''(Community only)'''" )
    elseif song.status == 'unlisted'       then table.insert( parts, "'''(Unlisted)'''"       )
    elseif song.status == 'defunct'        then table.insert( parts, "'''(Defunct link)'''"   )
    end

    return #parts > 0 and table.concat( parts, '<br/>' ) or 'N/A'
end

--- Build one mobile list item (<li>) for a song.
--- Output format (mirrors the desktop table columns):
---   Title line : "Title" [yt][nnd][bb] (Translation) -Version ver.- Note
---   Meta line  : [feat badges…]  (date)  [info badges…]
local function buildMobileItem( frame, song, i )
    -- ── Title line ──────────────────────────────────────────────────
    local titleParts = {}

    table.insert( titleParts, '"' .. esc( song.title or '(untitled)' ) .. '"' )

    -- The icons go in their own span, not in the title. They render ~19x19px,
    -- and every one of the 364 links on a 227-song page was below the 44px tap
    -- minimum; they cannot be given a real hit area while they are inline in
    -- the middle of wrapping title text.
    local linkParts = {}
    local yt  = safeId( song.youtube_id )
    local nnd = safeId( song.niconico_id )
    local bb  = safeId( song.bilibili_id )
    if yt  ~= '' then table.insert( linkParts, frame:preprocess( '{{yt|'  .. yt  .. '}}' ) ) end
    if nnd ~= '' then table.insert( linkParts, frame:preprocess( '{{nnd|' .. nnd .. '}}' ) ) end
    if bb  ~= '' then table.insert( linkParts, frame:preprocess( '{{bb|'  .. bb  .. '}}' ) ) end

    if song.title_translation and song.title_translation ~= '' then
        table.insert( titleParts, '<small>(' .. esc( song.title_translation ) .. ')</small>' )
    end
    if song.version and song.version ~= '' then
        table.insert( titleParts, '<small>-' .. esc( song.version ) .. ' ver.-</small>' )
    end
    if song.title_note and song.title_note ~= '' then
        table.insert( titleParts, '<small>' .. esc( song.title_note ) .. '</small>' )
    end

    -- ── Meta line ───────────────────────────────────────────────────
    local metaParts = {}

    local fa = song.featured_artists
    if fa and #fa > 0 then
        local featParts = {}
        for _, artist in ipairs( fa ) do
            local s = sanitiseArtist( tostring( artist ) )
            if s ~= '' then
                table.insert( featParts, frame:preprocess( '{{feat|' .. s .. '}}' ) )
            end
        end
        if #featParts > 0 then
            table.insert( metaParts, table.concat( featParts, '' ) )
        end
    end

    local raw = song.upload_date
    local isUnknown = not raw or raw == '' or raw == 'N/A' or raw == '-'
                   or raw:lower() == 'unknown'
    table.insert( metaParts, '(' .. ( isUnknown and 'N/A' or esc( raw ) ) .. ')' )

    local infoHtml = infoContent( frame, song )
    if infoHtml ~= 'N/A' then
        table.insert( metaParts, infoHtml )
    end

    local text = '<span class="songlist-ml-main">'
        .. '<span class="songlist-ml-title">' .. table.concat( titleParts, ' ' ) .. '</span>'
        .. '<span class="songlist-ml-meta">'  .. table.concat( metaParts,  ' ' ) .. '</span>'
        .. '</span>'

    local links = ''
    if #linkParts > 0 then
        links = '<span class="songlist-ml-links">' .. table.concat( linkParts, '' ) .. '</span>'
    end

    return '<li>' .. text .. links .. '</li>'
end

--- Sort key for a song's upload_date.
---
--- Must return the same string as SonglistSchema.dateSortKey() in the gadgets.
--- The two render paths read the same JSON, so any disagreement here shows up
--- as desktop and mobile listing the same artist in two different orders.
---
--- Unknown dates go to the very bottom. Known ones yield the first YYYY-MM-DD
--- in the string, so 'nnd-2012-10-10, yt-2021-12-13' sorts by 2012-10-10
--- instead of by the letter 'n' -- which put it behind every numeric date.
---
--- The %f frontier guards are what stop the malformed '20215-10-13' (a typo'd
--- year in the corpus) matching at offset 1 and sorting as year 215. A string
--- with no clean date in it falls through to a raw compare.
local UNKNOWN_DATES = {
    [''] = true, ['n/a'] = true, ['n.d.'] = true, ['-'] = true, ['unknown'] = true
}

local function dateSortKey( song )
    local raw = song and song.upload_date
    if type( raw ) ~= 'string' then
        if raw == nil then return '9999-12-31' end
        raw = tostring( raw )
    end
    raw = raw:match( '^%s*(.-)%s*$' )
    if UNKNOWN_DATES[ raw:lower() ] then return '9999-12-31' end
    return raw:match( '%f[%d](%d%d%d%d%-%d%d%-%d%d)%f[%D]' ) or raw
end

--- Rank inside one date group. Absent means the song was never deliberately
--- placed, so it sorts after every song that was, then by title.
local function orderKey( song )
    local v = song and song.order
    if type( v ) == 'number' and v == v and v >= 1 then return v end
    return math.huge
end

--- The year a song is filed under on mobile.
---
--- Derived from dateSortKey, never from song.upload_date. dateSortKey falls
--- through to a raw compare when it finds no clean date, which is why the
--- typo'd '20201-05-04' sorts at the END of 2020 rather than as year 201.
--- Labelling from the raw string would print a header its own neighbours
--- contradict.
local function yearLabel( song )
    local key = dateSortKey( song )
    if key == '9999-12-31' then return 'Unknown' end
    return key:match( '^(%d%d%d%d)' ) or key
end

--- Turn a label into an id fragment the nav can link to.
---
--- The 'songlist-y' prefix is load-bearing: an id starting with a digit is not
--- a valid CSS selector target. The strip keeps the fragment addressable when
--- the label came from dateSortKey's raw fallthrough ('201.03.13').
local function yearAnchor( label )
    return 'songlist-y' .. ( tostring( label ):gsub( '[^%w%-]', '' ) )
end

--- Cut the ALREADY-SORTED song list into consecutive runs of equal label.
---
--- Grouping is by run, never by re-bucketing: this walks the list in the order
--- songLess left it and starts a new group when the label changes. It never
--- sorts, so it cannot reorder -- 'mobile still agrees with desktop' is
--- structural here rather than something a test has to catch.
---
--- Only the first run of a label is given an anchor, so no data set can emit
--- a duplicate id. Real data never repeats a label (0 of 877 corpus pages).
local function groupByYear( songs )
    local groups, seen, current = {}, {}, nil
    for i, song in ipairs( songs ) do
        local label = yearLabel( song )
        if not current or current.label ~= label then
            current = { label = label, start = i, songs = {} }
            if not seen[ label ] then
                seen[ label ]  = true
                current.anchor = yearAnchor( label )
            end
            table.insert( groups, current )
        end
        table.insert( current.songs, song )
    end
    return groups
end

--- The jump index. Wikitext links, because #invoke output is parsed as
--- wikitext -- the same reason render() can return '|-' table rows.
---
--- safeId strips the metacharacters that would let an editor-supplied
--- upload_date close the link early and inject a template call (F2).
local function buildYearNav( groups )
    local chips = {}
    for _, g in ipairs( groups ) do
        if g.anchor then
            table.insert( chips,
                '[[#' .. g.anchor .. '|' .. esc( safeId( g.label ) ) .. ']]' )
        end
    end
    if #chips < 2 then return '' end
    return '<div class="songlist-ml-yrnav">' .. table.concat( chips, ' ' ) .. '</div>'
end

--- THE comparator. Kept identical to SonglistSchema.compareEntries() and to
--- finalize_output.get_sort_key().
---
--- The title tiebreak is load-bearing, not cosmetic: table.sort is NOT stable,
--- so without a total order two songs sharing a date came out in whatever
--- order quicksort happened to leave them -- while the desktop gadget showed
--- them in file order. 6,152 songs across 530 of 876 pages sit in that
--- position, and they were rendering differently on mobile and desktop.
local function songLess( a, b )
    local da, db = dateSortKey( a ), dateSortKey( b )
    if da ~= db then return da < db end

    local oa, ob = orderKey( a ), orderKey( b )
    if oa ~= ob then return oa < ob end

    return tostring( a.title or '' ) < tostring( b.title or '' )
end

--- Build one complete wikitext table row for a song.
--- Each cell is on its own line using the  | attr | content  syntax.
--- All content builder functions return pre-rendered HTML via frame:preprocess
--- (or frame:preprocess-based helpers), so the row string returned by #invoke
--- is already fully rendered — no further template expansion occurs on it.
local function buildRow( frame, song, i )
    local no  = tostring( i )          -- always use date-sorted position
    local raw = song.upload_date

    -- One definition of "unknown", shared with the row sort above, so the
    -- date column cannot sort differently from the rows it labels.
    local sortKey    = dateSortKey( song )
    local isUnknown  = sortKey == '9999-12-31'
    local dateDisplay = isUnknown and 'N/A' or esc( raw )

    return table.concat( {
        '|-',
        '| class="dt-type-num" data-order="' .. i .. '" | ' .. no,
        '| '                           .. titleContent( song ),
        '| '                           .. streamingContent( frame, song ),
        '| '                           .. featContent( frame, song ),
        '| '                           .. infoContent( frame, song ),
        '| class="dt-type-date" data-order="' .. sortKey .. '" | ' .. dateDisplay,
    }, '\n' )
end

-- ── Entry point ───────────────────────────────────────────────────────────────

function p.render( frame )
    local pargs    = frame:getParent() and frame:getParent().args or {}
    local jsonPage = ( frame.args.json ~= '' and frame.args.json )
                  or ( pargs.json ~= ''      and pargs.json )
                  or nil

    if not jsonPage then
        local root = mw.title.getCurrentTitle().rootText
        jsonPage   = root .. '/Songs/songs.json'
    end

    local title = mw.title.new( jsonPage )
    if not title or not title.exists then
        return '|-\n| colspan="6" style="text-align:center;color:var(--secondary-text-color,#72777d);" | '
            .. 'No songs found. (JSON page not found: ' .. esc( jsonPage ) .. ')'
    end

    local content = title:getContent()
    if not content or content:match( '^%s*$' ) then
        return '|-\n| colspan="6" style="text-align:center;color:var(--secondary-text-color,#72777d);" | '
            .. 'Song list is empty.'
    end

    local ok, songs = pcall( mw.text.jsonDecode, content )
    if not ok or type( songs ) ~= 'table' then
        return '|-\n| colspan="6" style="text-align:center;color:#b32424;" | '
            .. 'JSON parse error in ' .. esc( jsonPage )
    end

    if #songs == 0 then
        return '|-\n| colspan="6" style="text-align:center;color:var(--secondary-text-color,#72777d);" | '
            .. 'No tracks available yet.'
    end

    -- Sort with the shared key so the No. column, the desktop gadget and the
    -- pipeline all agree on what row 1 is.
    table.sort( songs, songLess )

    local rows = {}
    for i, song in ipairs( songs ) do
        -- frame is passed down so individual template calls ({{yt|…}} etc.)
        -- are preprocessed inside each cell builder.  The |- / | row syntax
        -- is returned raw so it merges correctly into the {| |} in
        -- {{SonglistTable}} without being treated as plain text.
        table.insert( rows, buildRow( frame, song, i ) )
    end

    return table.concat( rows, '\n' )
end

--- Render the full song list as a mobile-friendly <ol>.
--- Same date-ascending sort order as render(); no DataTables, read-only.
function p.renderMobile( frame )
    local pargs    = frame:getParent() and frame:getParent().args or {}
    local jsonPage = ( frame.args.json ~= '' and frame.args.json )
                  or ( pargs.json ~= ''      and pargs.json )
                  or nil

    if not jsonPage then
        local root = mw.title.getCurrentTitle().rootText
        jsonPage   = root .. '/Songs/songs.json'
    end

    local title = mw.title.new( jsonPage )
    if not title or not title.exists then
        return '<p class="songlist-ml-empty">No songs found. (JSON page not found: '
            .. esc( jsonPage ) .. ')</p>'
    end

    local content = title:getContent()
    if not content or content:match( '^%s*$' ) then
        return '<p class="songlist-ml-empty">Song list is empty.</p>'
    end

    local ok, songs = pcall( mw.text.jsonDecode, content )
    if not ok or type( songs ) ~= 'table' then
        return '<p class="songlist-ml-empty" style="color:#b32424;">JSON parse error in '
            .. esc( jsonPage ) .. '</p>'
    end

    if #songs == 0 then
        return '<p class="songlist-ml-empty">No tracks available yet.</p>'
    end

    table.sort( songs, songLess )

    local groups = groupByYear( songs )
    local out    = {}

    local nav = buildYearNav( groups )
    if nav ~= '' then table.insert( out, nav ) end

    for _, g in ipairs( groups ) do
        local label = esc( safeId( g.label ) )
        table.insert( out, g.anchor
            and ( '<div class="songlist-ml-yr" id="' .. g.anchor .. '">' .. label .. '</div>' )
            or  ( '<div class="songlist-ml-yr">' .. label .. '</div>' ) )

        local items = {}
        for j, song in ipairs( g.songs ) do
            table.insert( items, buildMobileItem( frame, song, g.start + j - 1 ) )
        end

        -- start= keeps the numbering continuous across groups, so it still
        -- matches the desktop '#' column.
        table.insert( out, '<ol class="songlist-mobile-list" start="' .. g.start .. '">'
            .. table.concat( items, '\n' ) .. '</ol>' )
    end

    -- Back to the year chips. It lives INSIDE the wrap on purpose: on mobile
    -- the Songs section is collapsible, and a display:none ancestor hides a
    -- position:fixed descendant too -- so the button shows exactly while the
    -- list is open, with no JS deciding that. The anchor sits on the wrap
    -- rather than on the nav, because a single-year page emits no nav.
    -- Mobile needs this: Citizen's own back-to-top is unavailable there (the
    -- TOC one collapses to 0x0, the sticky-header one is hidden).
    table.insert( out, '<div class="songlist-ml-totop">[[#songlist-top|↑ Top]]</div>' )

    -- NOT wrapped in {{Playlist}} any more. That template contributes
    -- max-height:300px + overflow:auto, which put all 227 songs of a page into
    -- a 300px window -- 7 rows visible, nested inside the page's own scroll.
    -- The ~500 legacy {{Playlist}} pages keep it; only the 46 module pages
    -- change. Blocks are joined without newlines so the parser cannot open a
    -- stray <p> between them.
    return '<div class="songlist-ml-wrap" id="songlist-top">'
        .. table.concat( out, '' ) .. '</div>'
end

-- Test seams. Exercised by tests/test_lua_mobile_grouping.py through lupa;
-- nothing on the wiki calls these.
p._yearLabel       = yearLabel
p._yearAnchor      = yearAnchor
p._groupByYear     = groupByYear
p._buildYearNav    = buildYearNav
p._buildMobileItem = buildMobileItem

return p