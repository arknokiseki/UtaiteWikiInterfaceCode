local p = {}

function p.countComments(frame)
    local pageTitle = frame.args[1]
    if not pageTitle or pageTitle:match('^%s*$') then
        return 0
    end

    local titleObj = mw.title.new(pageTitle)
    if not titleObj or not titleObj.exists then
        return 0
    end

    local pageId = titleObj.id
    if not pageId then
        return 0
    end

    local dbr = mw.dbal.readOnly()

    local resComments = dbr:select{
        tables = 'cs_comments',
        vars = 'cst_c_comment_page_id',
        conds = { cst_c_assoc_page_id = pageId },
        fname = 'Module:CommentStreamsUtil::countComments'
    }

    local commentIds = {}
    for row in resComments do
        table.insert(commentIds, tonumber(row.cst_c_comment_page_id))
    end

    local commentCount = #commentIds

    if commentCount == 0 then
        return 0
    end

    local replyCount = 0
    local commentIdsString = table.concat(commentIds, ',')
    if commentIdsString ~= '' then
        local resReplies = dbr:select{
            tables = 'cs_replies',
            vars = 'COUNT(*) as count',
            conds = 'cst_r_comment_page_id IN (' .. commentIdsString .. ')',
            fname = 'Module:CommentStreamsUtil::countComments'
        }
        
        local replyRow = resReplies:fetchRow()
        if replyRow and replyRow.count then
           replyCount = tonumber(replyRow.count) or 0
        end
    end

    return commentCount + replyCount
end

return p