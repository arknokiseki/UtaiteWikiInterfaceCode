local UrlEncoding = require( 'Module:UrlEncoding' )
local encode = UrlEncoding._encode

local link_to_gerrit = function ( target, text )
	if text == nil then
		text = target
	end

	return '[[:gerrit:' .. target .. '|' .. text .. ']]'
end

local link_to_gerrit_number = function ( number )
	return link_to_gerrit( number, 'Gerrit change ' .. number )
end

local link_to_gerrit_search = function ( search, text )
	if text == nil then
		text = 'Search Gerrit for ' .. search
	end

	return link_to_gerrit( 'q/' .. search, text )
end

local link_to_gerrit_id = function ( id )
	return link_to_gerrit_search( id, 'Gerrit #' .. string.sub( id, 0, 7 ) )
end

local link_to_gerrit_constraints = function ( constraints, searchstr, text )
	local searchlist = {}
	local linktextlist = {}

	if searchstr ~= nil and searchstr ~= '' then
		table.insert( searchlist, searchstr )
		table.insert( linktextlist, 'which mention ' .. searchstr )
	end

	if constraints.owner ~= nil and constraints.owner ~= '' then
		table.insert( searchlist, 'owner:' .. encode( constraints.owner ) )
		table.insert( linktextlist, 'with owner ' .. constraints.owner )
	end

	if constraints.project ~= nil and constraints.project ~= '' then
		table.insert( searchlist, 'project:' .. encode( constraints.project ) )
		table.insert( linktextlist, 'in project ' .. constraints.project )
	end

	if constraints.status ~= nil and constraints.status ~= '' then
		table.insert( searchlist, 'status:' .. encode( constraints.status ) )
		table.insert( linktextlist, constraints.status )
	end

	if constraints.ownerin ~= nil and constraints.ownerin ~= '' then
		table.insert( searchlist, 'ownerin:' .. encode( constraints.ownerin ) )
		table.insert( linktextlist, 'owner in group ' .. constraints.ownerin )
	end

	if constraints.message ~= nil and constraints.message ~= '' then
		table.insert( searchlist, 'message:' .. encode( constraints.message ) )
		table.insert( linktextlist, 'message contains ' .. constraints.message )
	end

	if text == nil then
		text = mw.text.listToText( linktextlist )
	end

	return link_to_gerrit_search( table.concat( searchlist, '+' ), text )
end

-- Test:
--
--     mw.log(p._link_to_paths( 'mediawiki/core', 'includes/libs/rdbms,includes/db'))
--
-- Output:
--
--     https://gerrit.wikimedia.org/r/q/project:mediawiki/core+(path:^includes/libs/rdbms.*+OR+path:^includes/db.*)+is:merged
--
local link_to_paths = function ( repo, paths )
	local base = 'https://gerrit.wikimedia.org/r/q/'
	local query = 'project:' .. repo
	local pathQuery = {}
	paths = mw.text.gsplit( paths, ',', true )
	for path in paths do
		table.insert(pathQuery, 'path:^' .. path .. '.*')
	end
	query = query .. ' (' .. table.concat(pathQuery, ' OR ') .. ')'
	query = query .. ' is:merged'
	local url = base .. encode( query )
	return url
end

return {
	_link_to_gerrit = link_to_gerrit,
	_link_to_gerrit_number = link_to_gerrit_number,
	_link_to_gerrit_search = link_to_gerrit_search,
	_link_to_gerrit_constraints = link_to_gerrit_constraints,
	_link_to_paths = link_to_paths,

	link_to_paths = function ( frame )
		return link_to_paths( frame.args.repo, frame.args.paths )
	end,
	link_automatic = function ( frame )
		local suspect, changenum_match, changeid_match, retval
		suspect = frame.args[1]

		if suspect ~= nil then
			changenum_match = string.match( suspect, '%d+' )
			changeid_match = string.match( suspect, 'I%x+' )
		end

		if changeid_match ~= nil then
			return link_to_gerrit_id( changeid_match )
		elseif changenum_match ~= nil then
			return link_to_gerrit_number( changenum_match )
		elseif frame.args.owner ~= nil or frame.args.project ~= nil or frame.args.status ~= nil or frame.args.ownerin ~= nil or frame.args.message ~= nil then
			return link_to_gerrit_constraints( frame.args, suspect, frame.args.text )
		else
			return link_to_gerrit_search( encode( suspect ) )
		end
	end
}