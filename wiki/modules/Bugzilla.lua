local UrlEncoding = require( 'Module:UrlEncoding' )
local encode = UrlEncoding._encode

local link_to_component = function ( component, subcomponent, linktext )
	-- concatenate a potential 'subcomponent' after a dash
	if subcomponent ~= nil and subcomponent ~= '' then
		-- remove whitespace from beginning and end of string
		subcomponent = mw.text.trim( subcomponent )
		-- replace remaining whitespace with a dash
		subcomponent = string.gsub(subcomponent, "%s+", "-")
		component = component .. '-' .. subcomponent
	end

	if linktext == nil or linktext == '' then
		linktext = 'Bugs in project ' .. component
	end

	-- convert to lower case to avoid 404s, but preserve original casing for link text 
	project = component:lower()

	return '[https://phabricator.wikimedia.org/tag/' .. encode( project ) .. ' ' .. linktext .. ']'
end

local link_to_bug = function ( bugnum, linktext )
	local linkstr = '[[:bugzilla:' .. bugnum .. '|'
	
	if linktext ~= nil then
		linkstr = linkstr .. linktext
	else
		linkstr = linkstr .. 'Bug ' .. bugnum
	end
	
	linkstr = linkstr .. ']]'
	return linkstr
end

return {
	_link_to_component = link_to_component,
	_link_to_bug = link_to_bug,

	link_to_component = function ( frame )
		local product, component, text

		if frame.args[1] ~= nil then
			product = frame.args[1]
			if frame.args[2] ~= nil then
				component = frame.args[2]
				if frame.args[3] ~= nil then
					text = frame.args[3]
				end
			end
		else
			if frame.args.product ~= nil then
				product = frame.args.product
				if frame.args.component ~= nil then
					component = frame.args.component
				end
			end

			if frame.args.text ~= nil then
				text = frame.args.text
			end
		end

		return link_to_component( product, component, text )
	end,

	link_to_bug = function ( frame )
		local bugnum = '1'
		local linktext = nil
		local ltstart = 1

		if frame.args.bug ~= nil then
			bugnum = frame.args.bug
		elseif frame.args[1] ~= nil then
			bugnum = frame.args[1]
			ltstart = 2
		else
			bugnum = '1'
		end

		if frame.args.linktext ~= nil then
			linktext = frame.args.linktext
		elseif frame.args[ltstart] ~= nil then
			linktext = frame.args[ltstart]
		end

		return link_to_bug( bugnum, linktext )
	end
}