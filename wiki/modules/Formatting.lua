local p = {}
local lib = require('Module:Feature')
local search = lib.inArray
local nw = mw.text.nowiki

function p.main(frame)
	local args = require('Module:Arguments').getArgs(frame, {
		parentFirst = true,
		removeBlanks = false
	})
	
	-- helper function to parse params
	function FP(arr, val, def, noBlk)
		local param = nil
		for _, v in ipairs(arr) do
			if param == nil and args[v]~=nil then
				param = val and args[v] or v
			end
			if not noBlk then
				args[v]=nil
			end
		end
		return param or def
	end

	-- Define variables
	local main = args[1]; assert(main, 'A value must be given'); main = {main, main}
	local label = FP({'label', 2}, true, '', true); label = {label, label}
		
	local mode = FP({'link', 'l', 'external-link', 'el', 'template', 't'}) or 'plain'
	local ret  = FP({'_Ybr_', '_Yn_', '_Y_'}) or 'none'
	local spc  = FP({'block'}) or 'inline'
	local lprs = FP({'let_parse'}) ~= nil
	local code = FP({'NC'}) == nil
	local var  = FP({'variable', 'v'}) ~= nil
	local esc  = FP({'nowiki', 'nw'}) and nw or (function(a)return a end)
	local infobox = FP({'_infobox'}) ~= nil or main[1]:find('Infobox')
	local content -- for actual render storage
	local final = mw.html.create()
	local out  = final:tag('span')
		:addClass(table.concat({
			'custom-formatting-code',
			code and '' or 'custom-formatting-plain',
			spc=='block' and ('code-block' .. lib.ternary(infobox,'-table','')) or ''
		}, ' '))
	
	-- Define defaults
	local _d = {
		['pipe'] = '|',
		['open'] = ({
			['link'] = '[[', ['l'] = '[[',
			['external-link'] = '[', ['el'] = '[',
			['template'] = '{{', ['t'] = '{{',
			['plain'] = ''
		})[mode],
		['close'] = ({
			['link'] = ']]', ['l'] = ']]',
			['external-link'] = ']', ['el'] = ']',
			['template'] = '}}', ['t'] = '}}',
			['plain'] = ''
		})[mode],
		['join'] = ((
				FP({'no_joint'}) or
				((mode=='t' or mode=='template') and infobox)
			) and '')
			or ({
				['_Ybr_'] = ' yields:<br>',
				['_Yn_'] = ' yields:\n',
				['_Y_'] = ' yields: ',
				['none'] = ''
			})[ret],
		ref = FP({'ref', 'r'}) and {'<ref>', '</ref>'} or {'',''},
		bold = FP({'bold', 'b'}) and {'<b>', '</b>'} or {'',''},
		italic = FP({'italic', 'i'}) and {'<i>', '</i>'} or {'',''},
		under = FP({'underline', 'u'}) and {'<u>', '</u>'} or {'',''},
	}
	_d.prefix = table.concat({ FP({'prefix'},true,''), _d.ref[1], _d.bold[1], _d.italic[1], _d.under[1] }):gsub('{_SP_}', ' '):gsub('{_NL_}', '\n')
	_d.suffix = table.concat({ _d.under[2], _d.italic[2], _d.bold[2], _d.ref[2], FP({'suffix'},true,''), }):gsub('{_SP_}', ' '):gsub('{_NL_}', '\n')

	-- Variable formatting
	if var then main[2] = '(('..main[2]..'))' end
	if FP({'variable-label', 'vl'})~=nil and lib.isNotEmpty(label[2]) then label[2] = '(('..label[2]..'))' end
	
	--create result as plain text
	if mode == 'plain' then
		out:wikitext(
			nw(_d.prefix),
			esc(main[2]),
			nw(_d.suffix)
		)
		if ret ~= 'none' or not code then
			content = frame:preprocess(table.concat({
				_d.prefix,
				main[1],
				_d.suffix
			}))
		end
		
	--create result as wiki link
	elseif search({'link', 'l'}, mode) then
		out:wikitext(
			nw(_d.prefix),
			nw(_d['open']),
			esc(main[2]),
				lib.isEmpty(label[2]) and '' or
				(nw(_d.pipe) .. esc(label[2])),
			nw(_d['close']),
			nw(_d.suffix)
		)
		if ret ~= 'none' or not code then
			content = frame:preprocess(table.concat({
				_d.prefix,
				main[1],
				(
					label[1]=='' and ''
					or (_d.pipe .. label[1])
				),
				_d.suffix
			}))
		end

	--create result as external link
	elseif search({'external-link', 'el'}, mode) then
		out:wikitext(
			nw(_d.prefix),
			nw(_d['open']),
			nw(main[2]),
				lib.isEmpty(label[2]) and '' or
				(' ' .. esc(label[2])),
			nw(_d['close']),
			nw(_d.suffix)
		)
		if ret ~= 'none' or not code then
			content = frame:preprocess(table.concat({
				_d.prefix,
				main[1],
				(
					label[1]=='' and ''
					or (' ' .. label[1])
				),
				_d.suffix
			}))
		end
	elseif search({'template', 't'}, mode) then
		local yieldargs = {}
		local pre = main[1]
		local t_prefix = lib.split(pre, ':')[1]
		if not lib.inArray({'User', 'U', 'Project', 'Genshin Impact Wiki'}, t_prefix) then
			pre = 'Template:' .. pre
		end
		out:wikitext(
			nw(_d.prefix),
			nw(_d['open']),
			'[[', pre, '|', main[2]:gsub(' ','&nbsp;'), ']]'
		)
		
		--template call with params
		if p.checkParams(args) then
			local param = 1
			while (args['V'..param] or args['v'..param] or args['P' .. param] or args['p' .. param] or args[param+1]) do
				local _p = FP({'V'..param, 'v'..param, 'P' .. param, 'p' .. param, param+1}, nil, nil, true)
				local _v = FP({'V'..param, 'v'..param, 'P' .. param, 'p' .. param, param+1}, true)
				local sett = {
					p      = _p,
					v      = _v,
					cmmt   = FP({_p..'_comment'}, true),
					prefix = FP({_p..'_pref'}, true) or (spc=='block' and '<br>') or '',
					suffix = FP({_p..'_suff'}, true) or '',
					parse  = lprs or search({'V', 'P'}, (tostring(_p):sub(1,1))),
					var    = var or search({'V', 'v'}, (tostring(_p):sub(1,1))),
					param  = p.parseParam(_v, _p)
				}
				out:wikitext(sett.prefix)
				if sett.cmmt then
					out:wikitext('<br>((!-- ', nw(sett.cmmt), ' --))<br>')
				end
				out:wikitext(nw(_d.pipe))
				--named param only
				if type(sett.param.name) == 'string' and sett.param.name ~= sett.p then
					out
						:tag('b'):wikitext(nw(sett.param.name)):done()
						:wikitext(string.rep('&nbsp;',sett.param.spacing),'= ')
				end
				out:wikitext(
					sett.var and '((' or '',
					p.NewLineAllow(sett.param.value, sett.parse),
					sett.var and '))' or ''
				)
				out:wikitext(sett.suffix)
				
				-- store param value
				yieldargs[sett.param.name] = mw.text.unstrip(sett.param.value)
				
				
				--increase count for the next 'while' loop
				param = param + 1
			end
			
			for n,v in pairs(args) do
				if (n ~= 1) then
					out:wikitext(
						(spc=='block' and '<br>') or '',
						nw(_d.pipe),'<b>',nw(n),'</b> = ',
						p.NewLineAllow(v, lprs)
					)
					yieldargs[n] = mw.text.unstrip(v)
				end
			end
		end
		out:wikitext((spc=='block' and '<br>') or '', nw(_d['close']), nw(_d.suffix))

		-- auto template result for examples
		if ret~='none' or not code then
			content = _d.prefix .. frame:expandTemplate{title = main[1], args = yieldargs} .. _d.suffix
		end
	end
	
	if content and (ret ~= 'none' or not code) then
		if content:find('<ref') then
			local c_p,c_r,c_s = string.match(content, '^(.-)<ref>(.-)</ref>(.-)$')
			content = c_p .. frame:extensionTag{ name = 'ref', content = c_r } .. c_s
		end
		if ret ~= 'none' then
			if infobox then
				final = mw.html.create()
					:wikitext(content)
					:node(final)
			else
				final:wikitext(
					(spc=='block' and '<br>' or ' '),
					_d.join,
					content
				)
			end
		elseif not code then
			out:addClass('custom-formatting-nested')
			final:tag('span'):addClass('custom-formatting-resulting'):wikitext(content)
		end
	end
	
	-- Parse keywords
	final = tostring(final):gsub('{_SP_}', ' '):gsub('{_NL_}', '\n')
	final = p.variableFormat(final)
	
	return final
end

function p.parseParam(param, pName)
	local tmp = param
	local name, value, spacing = '','',1
	
	-- the parameter's name is anything to the left of the first equals sign;
	-- the equals sign can be escaped, for wikis that don't have [[Template:=]]
	if tmp:find('=') then
		name, spacing, value = string.match(tmp,'^(.-)(%s*)=%s*(.-)$')
		if string.len(spacing) == 0 then spacing = 1 else spacing = string.len(spacing) end
	else
		name = type(pName)=='number'
			and (pName-1)
			or tonumber((pName:gsub('[^%d]+', '')))
		value = tmp
	end
	return {
		name = name,
		value = value,
		spacing = spacing
	}
end

function p.variableFormat(textin)
	while (textin:find('%(%(') and textin:find('%)%)')) do
		local textrp = string.match(textin,'%(%((.-)%)%)')
		textin = textin:gsub('%(%(.-%)%)',tostring(mw.html.create():tag("span"):addClass('variable'):wikitext(textrp)),1)
	end
	return textin
end

function p.checkParams(args)
	for n,v in pairs(args) do
		if (n ~= 1 and v~=nil) then
			return true
		end
	end
	return false
end

--helper function to allow new line format in template calls in block format, as directly allowing makes the <code> container break
function p.NewLineAllow(str, parse)
	local container = mw.html.create()
	local nw = mw.text.nowiki
	
	if str:find('[\n\r]') then
		str = str:gsub('[\n\r]', '¤¤¤'):gsub('¤¤¤$', '')
		local splitstr = mw.text.split(str, '¤¤¤', true )
		for i,v in ipairs(splitstr) do
			if not parse then v = nw(v) end
			container:wikitext(v)
			if i ~= #splitstr then
				container:wikitext('<br>')
			end
		end
		return tostring(container)
	else
		if not parse then str = nw(str) end
		return str
	end
end

return p