local cfg = {} -- Don’t touch this line.

-- Subpage blacklist: these subpages will not be categorized (except for the
-- error category, which is always added if there is an error).
-- For example “Template:Foo/doc” matches the `doc = true` rule, so it will have
-- no categories. “Template:Foo” and “Template:Foo/documentation” match no rules,
-- so they *will* have categories. All rules should be in the
--   ['<subpage name>'] = true,
-- format.
cfg['subpage_blacklist'] = {
	['doc'] = true,
	['sandbox'] = true,
	['sandbox2'] = true,
	['testcases'] = true,
}

-- Allow wishes: whether wishes for conversion to Lua are allowed.
-- If true, calls with zero parameters are valid, and considered to be wishes:
-- The box’s text is “This template should use Lua”, and cfg['wish_category'] is
-- added. If false, such calls are invalid, an error message appears, and
-- cfg['error_category'] is added.
cfg['allow_wishes'] = false

-- Default category: this category is added if the module call contains errors
-- (e.g. no module listed). A category name without namespace, or nil
-- to disable categorization (not recommended).
cfg['error_category'] = 'Lua templates with errors'

-- Wish category: this category is added if no module is listed, and wishes are
-- allowed. (Not used if wishes are not allowed.) A category name without
-- namespace, or nil to disable categorization.
cfg['wish_category'] = 'Lua-candidates'

-- Default category: this category is added if none of the below module_categories
-- matches the first module listed. A category name without namespace, or nil
-- to disable categorization.
cfg['default_category'] = 'Lua-based templates'

-- Module categories: one of these categories is added if the first listed module
-- is the listed module (e.g. {{Lua|Module:String}} adds
-- [[Category:Lua String-based templates]].) Format:
--   ['<module name>'] = '<category name>'
-- where neither <module name> nor <category name> contains namespace. An empty
-- table (i.e. no module-based categorization) will suffice on smaller wikis.
cfg['module_categories'] = {
	['String'] = 'Lua String-based templates',
}

return cfg -- Don’t touch this line.