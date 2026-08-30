local p = {}

local statusConfig = {
    active = {
        class = 'status-active',
        label = 'Active',
        icon = '●'
    },
    graduated = {
        class = 'status-graduated',
        label = 'Graduated',
        icon = '★'
    },
    inactive = {
        class = 'status-inactive',
        label = 'Inactive',
        icon = '○'
    },
    hiatus = {
        class = 'status-hiatus',
        label = 'Hiatus',
        icon = '◐'
    },
    terminated = {
        class = 'status-terminated',
        label = 'Terminated',
        icon = '✕'
    }
}

function p.getStatusClass(frame)
    local status = string.lower(frame.args[1] or '')
    local config = statusConfig[status]
    return config and config.class or ''
end

function p.getStatusIcon(frame)
    local status = string.lower(frame.args[1] or '')
    local config = statusConfig[status]
    return config and config.icon or ''
end

return p