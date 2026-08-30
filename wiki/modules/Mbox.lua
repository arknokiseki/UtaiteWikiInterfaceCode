-- <nowiki>
local Mbox = {}
local getArgs = require('Module:Arguments').getArgs
local i18n = require('Module:I18n').loadMessages('Mbox')

function Mbox.main(frame)
    local args = getArgs(frame)

    -- styles
    local styles = {}
    styles['border-left-color'] = i18n:parameter('bordercolor', args)
    styles['background-color'] = i18n:parameter('bgcolor', args)

     -- images
    local imagenoformat = i18n:parameter('image-noformat', args)
    local image = i18n:parameter('image', args) or ''
    local imageadjust = ''
    if args.imageadjust then
        imageadjust = '|' .. args.imageadjust
    end
    local imagewidth = i18n:parameter('imagewidth', args) or '80px'
    local imagelink = '|link='
    local imagelinkarg = i18n:parameter('imagelink', args)
    if imagelinkarg then
        imagelink = imagelink .. imagelinkarg
    end

    local imagewikitext
    if imagenoformat then
        imagewikitext = imagenoformat
    else
        imagewikitext = '[[File:' .. image .. '|' .. imagewidth  .. imageadjust .. imagelink .. ']]'
    end

    -- id for closure
    local id = i18n:parameter('id', args) or 'mbox'
    local typeclass = i18n:parameter('type', args)

    local container = mw.html.create('div')
        :addClass('mbox')
        :addClass(typeclass and ('mbox-type-' .. typeclass))
        :addClass(i18n:parameter('class', args))
        :css(styles)
        :cssText(i18n:parameter('style', args))

    local content = container:tag('div')
        :addClass('mbox__content')
    local collapsed = i18n:parameter('collapsed', args)

    if imagenoformat or image ~= '' then
        local image = content:tag('div')
            :addClass('mbox__content__image')
            :addClass('mw-collapsible')
            :attr('id', 'mw-customcollapsible-' .. id)
            :wikitext(imagewikitext)
            if collapsed then
                image:addClass('mw-collapsed')
            end
    end

    local contentwrapper = content:tag('div')
        :addClass('mbox__content__wrapper')
    local header = i18n:parameter('header', args)

    if header then
        contentwrapper:tag('div')
            :addClass('mbox__content__header')
            :wikitext(header)
    end

    local textarg = i18n:parameter('text', args)
    if textarg then
        local text = contentwrapper:tag('div')
            :addClass('mbox__content__text')
            :addClass('mw-collapsible')
            :attr('id', 'mw-customcollapsible-' .. id)
            :wikitext(textarg)
            if collapsed then
                text:addClass('mw-collapsed')
            end

        local comment = i18n:parameter('comment', args)
        if comment then
            text:tag('div')
                :addClass('mbox__content__text__comment')
                :wikitext(comment)
        end
    end

    contentwrapper:tag('span')
        :addClass('mbox__close')
        :addClass('mw-customtoggle-' .. id)
        :attr('title', i18n:msg('dismiss'))

    local asidearg = i18n:parameter('aside', args)
    if asidearg then
        local aside = content:tag('div')
            :addClass('mbox__content__aside')
            :addClass('mw-collapsible')
            :attr('id', 'mw-customcollapsible-' .. id)
            :wikitext(asidearg)
            if collapsed then
                aside:addClass('mw-collapsed')
            end
    end

    return container
end

return Mbox