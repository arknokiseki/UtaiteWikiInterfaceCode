local p = {}

function p.put(frame)
	return require('Module:BucketPut').put(frame)
end

function p.get(frame)
	return require('Module:BucketGet').get(frame)
end

return p