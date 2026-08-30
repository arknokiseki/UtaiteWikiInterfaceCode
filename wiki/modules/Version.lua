local p = {}
local releases = {}

-- HEY YOU, UPDATE THESE
releases["1.43.1"] = "2025-04-10"
releases["1.42.6"] = "2025-04-10"
releases["1.39.12"] = "2025-04-10"

-- Is there a beta branch that isn't a proper release yet?
p.isthereabeta = true
-- OKAY YOU CAN STOP NOW

-- Iterate in reverse
-- from http://lua-users.org/wiki/IteratorsTutorial
function ripairs(t)
  local function ripairs_it(t,i)
    i=i-1
    local v=t[i]
    if v==nil then return v end
    return i,v
  end
  return ripairs_it, t, #t+1
end

p.releases = releases

-- get trimmed version like "1.XX"
function p.branch( version )
	return string.sub(version, 0,4)
end

-- git branch like REL1_XX
function p.git_branch( version )
	return "REL1_" .. string.sub(p.branch(version), 3)
end

-- is the given version an LTS release?
function p.islts( version )
	-- if we ever cut a 2.x release this will need to be rethought
	local x = tonumber(string.sub(p.branch( version ), 3))
	if x < 19 then return false end
	-- every 4th release starting with 1.19 is an LTS
	return ((x - 19) % 4) == 0
end

function p.get( frame )
	return p.version( frame.args[1], frame.args[2] )
end

-- main function
-- release: stable, legacy, legacylts, lts, alpha
-- format: version, branch, git, date
function p.version( release, format )
	local versions = {}
	for k,v in pairs(p.releases) do
		table.insert(versions,k)
	end
	table.sort(versions)
	--mw.logObject(versions)
	--mw.log(#versions)
	local version = "0.0.0"
	if release == "stable" then
		version = versions[#versions]
	elseif release == "legacy" then
		version = versions[#versions-1]
	elseif release == "lts" then
		for i,v in ipairs(versions) do
			-- this might not be right.
			if p.islts(v) then
				version = v
			end
		end
	elseif release == "legacylts" then
		-- the oldest LTS version is the legacy LTS version.
		-- (e.g. when there are both 1.23.x and 1.27.x releases, choose 1.23.x)
		for i,v in ripairs(versions) do
			if p.islts(v) then
				version = v
			end
		end
	elseif (release == "alpha" or release == "beta") then
		-- alpha and beta only works with "branch" output
		
		version_parts = mw.text.split(p.branch(versions[#versions]), ".", true)
		version_parts[2] = tonumber(version_parts[2])+1
		
		if (p.isthereabeta and release == "alpha") then
			version_parts[2] = tonumber(version_parts[2]) + 1
		end

		version = table.concat(version_parts, ".")
		
		if (not p.isthereabeta and release == "beta") then
			version = "—"
		end
	end

	local out = "WRONG"
	if format == "version" then
		out = version
	elseif format == "branch" then
		out = p.branch( version )
	elseif format == "git" then
		out = p.git_branch( version )
	elseif format == "date" then
		out = p.releases[version]
	end

	return out
end

return p