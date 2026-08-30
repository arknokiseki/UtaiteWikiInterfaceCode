-- This module contains the blacklist used by [[Module:Category handler]].
-- Pages that match Lua patterns in this list will not be categorised unless
-- categorisation is explicitly requested.

return {
    '/[aA]rchive' -- Don't categorise archives.
}