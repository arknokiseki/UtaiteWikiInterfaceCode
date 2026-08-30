-- Simple infobox Lua module whose interface is inspired by https://mzh.moegirl.org.cn/Template:Infobox3
-- The code is independently written.

local p = {};

local getArgs = require('Module:Arguments').getArgs;

local ACandy = require('Module:ACandy');
local a = ACandy.a;
local raw = ACandy.Raw;

function makeInfoboxImage(args)
	local filename = args['image'] or "";
	if filename == "" then
		return "";
	end
	
	local caption = args['caption'];
	
	return a.tr {
		a.td {
			class = "infobox-image-container",
			colspan = 2,
			a.div {
				class = "infobox-image",
				string.format("[[File:%s|%s]]", filename, args['image-size'] or "180px")
			},
			caption and a.div {
				class = "infobox-image-caption",
				colspan = 2,
				raw(caption)
			} or ""
		}
	};
end

function trim(s)
	if s == nil then
		return s
	end
	return s:match( "^%s*(.-)%s*$" )
end

function makeInfoboxContent(args)
	local result = a.div {
		class = "infobox-content"
	}
	
	local tabGroup = "infobox" .. tostring(#args);
	local currentTab = nil;
	
	for _, arg in ipairs(args) do
		local i, _ = string.find(arg, "::");

		local key, value;
		if i then
		    key = string.sub(arg, 1, i - 1);
		    value = string.sub(arg, i + 2);
		else
		    key = nil
		    value = arg
		end
		
		-- Do not perform html escaping on value so that the user can
		-- supply arbitrary html if needed
		key = trim(key);
		value = trim(value);
		if value ~= "" then
			value = raw(value);
		end
		
		local row = nil;
		
		if key == "-header" then
			row = a.tr {
				class = "infobox-header",
				style = args['header-style'] or "",
				a.td {
					class = "infobox-header-data",
					colspan = 2,
					value
				}
			};
		elseif key == "-tabs" then
			local tab_names = mw.text.split(tostring(value), "::", true);
			local buttons = {};
			for index, tab_name in ipairs(tab_names) do
				table.insert(buttons, a.div {
					class = "tab-button" .. (index == 1 and " tab-button-selected" or ""),
					["data-option"] = index,
					tab_name
				});
			end
			row = a.tr {
				class = "infobox-tabs",
				a.td {
					class = "tab-button-container",
					colspan = 2,
					["data-group"] = tabGroup,
					buttons
				}
			};
		elseif key == "-tab-start" then
			currentTab = tostring(value);
		elseif key == "-tab-end" then
			currentTab = nil;
		elseif key ~= nil and key ~= "" then
			row = a.tr {
				a.td {
					class = "infobox-label",
					style = args['label-style'] or "",
					raw(key)
				},
				a.td {
					class = "infobox-data",
					style = args['data-style'] or "",
					value
				}
			};
		elseif key == "" and value ~= "" then
			-- Originally " :: value"
			row = a.tr {
				a.td {
					class = "infobox-data",
					style = args['data-style'] or "",
					colspan = 2,
					value
				}
			};
		end
		
		if row then
			row.class = "infobox-row " .. (row.class or "");
			if currentTab then
				row.class = row.class .. " tab-panel"
				if currentTab ~= "1" then
					row.class = row.class .. " tab-panel-hidden";
				end
				row.attributes['data-group'] = tabGroup;
				row.attributes['data-option'] = currentTab;
			end
			result.children:insert(row);
		end
	end
	
	return result;
end

function p.main(frame)
	local args = getArgs(frame, { removeBlanks = false });
	local infoboxTitle = a.tr {
		a.td {
			class = "infobox-title",
			style = args['title-style'] or "",
			colspan = 2,
			raw(args['title'] or "&nbsp;")
		}
	};
	local infoboxImage = makeInfoboxImage(args);
	local infoboxContent = makeInfoboxContent(args);
	return a.table {
		class = "wikitable lua-infobox citizen-table-nowrap " .. (args['class'] or ""),
		style = args['style'] or "",
		infoboxTitle,
		infoboxImage,
		infoboxContent,
		frame:extensionTag( 'templatestyles', '', { src = ':Module:LuaInfobox/styles.css' } )
	}
end

return p;