local p = {}

local services = {
    ['amazon'] = { url = 'http://www.amazon.co.jp/dp/%s', name = 'Amazon', logo = true },
    ['amazonmusic'] = { url = 'https://music.amazon.com/albums/%s', name = 'Amazon Music', logo = true },
    ['amazonmusicjp'] = { url = 'https://music.amazon.co.jp/albums/%s', name = 'Amazon Music JP', logo = true },
    ['amiami'] = { url = 'https://www.amiami.jp/top/detail/detail?gcode=%s', name = 'amiami', logo = true },
    ['awa'] = { url = 'https://s.awa.fm/album/%s', name = 'AWA', logo = true },
    ['awa-track'] = { url = 'https://s.awa.fm/track/%s', name = 'AWA', logo = 'awa_logo.png' },
    ['yt'] = { url = 'https://www.youtube.com/watch?v=%s', name = 'YouTube', logo = true },
    ['youtubemusic'] = { url = 'https://music.youtube.com/playlist?list=%s', name = 'YouTube Music', logo = true },
    ['linemusic'] = { url = 'https://music.line.me/webapp/album/%s', name = 'Line Music', logo = true },
    ['rakutenmusic'] = { url = 'https://music.rakuten.co.jp/link/album/%s', name = 'Rakuten Music', logo = true },
    ['itunes'] = { url = 'https://itunes.apple.com/jp/album/%s', name = 'iTunes', logo = true },
    ['itunesjp'] = { url = 'https://music.apple.com/jp/album/%s', name = 'iTunes', logo = true },
    ['sony'] = { url = 'https://www.sonymusicshop.jp/m/item/itemShw.php?cd=%s', name = 'Sony Music Shop', logo = true },
    ['amatsuki'] = { url = 'https://amatsuki-officialgoods.com/products/%s', name = 'Amatsuki Official Goods Shop', logo = true },
    ['cielkocka'] = { url = 'https://www.cielkocka-webshop.jp/products/%s', name = 'Cielkocka Webshop', logo = true },
    ['stapola'] = { url = 'https://shop.starpola.com/products/%s', name = 'Starlight PolaRis Official Store', logo = true },
    ['sixfonia'] = { url = 'https://shop.sixfonia.com/products/%s', name = 'Sixfonia Official Store', logo = true },
    ['voising-store'] = { url = 'https://store.voising-official.com/s/ve/item/detail/%s', name = 'Voising Official Store', logo = true },
    -- ['ireisu'] = { url = 'https://shop.ireisu.com/products/%s', name = 'Irregular Dice Official Store', logo = true },
    ['chrono store'] = { url = 'https://shop.chronoreverse.com/products/%s', name = 'Chrono▷◀Reverse Official Store', logo = 'chrono store_logo.png' },
    ['booth'] = { url = 'https://%s.booth.pm/items/%s', name = "%s's Booth", logo = true }, 
    ['sofmap'] = { url = 'https://www.sofmap.com/product_detail.aspx?sku=%s', name = 'sofmap', logo = true },
    ['spotify'] = { url = 'https://open.spotify.com/intl-ja/album/%s', name = 'Spotify', logo = true },
    ['spotify-track'] = { url = 'https://open.spotify.com/intl-ja/track/%s', name = 'Spotify', logo = 'spotify_logo.png' },
    ['animate'] = { url = 'http://www.animate-onlineshop.jp/pd/%s/', name = 'Animate', logo = true },
    ['mora'] = { url = 'https://mora.jp/package/%s', name = 'mora', logo = true },
    ['animate-intl'] = { url = 'https://www.animate.shop/products/%s', name = 'Animate International', logo = true },
    ['ototoy'] = { url = 'https://ototoy.jp/_/default/p/%s', name = 'Ototoy', logo = true },
    ['cdjapan'] = { url = 'http://www.cdjapan.co.jp/product/%s', name = 'CDJapan', logo = true },
    ['nicochokuhan'] = { url = 'http://chokuhan.nicovideo.jp/products/detail/%s', name = 'Nicochokuhan', logo = true },
    ['d-stage'] = { url = 'http://d-stage.com/shop/detail.php?seq=%s', name = 'D-stage', logo = true },
    ['fasic'] = { url = 'http://shop.fasic.jp/?pid=%s', name = 'Fasic', logo = true },
    ['hmv'] = { url = 'http://www.hmv.co.jp/product/detail/%s', name = 'HMV', logo = true },
    ['melonbooks'] = { url = 'http://www.melonbooks.co.jp/detail/detail.php?product_id=%s', name = 'Melonbooks', logo = true },
    ['victor'] = { url = 'https://victor-store.jp/item/%s', name = 'Victor Online Store', logo = true },
    ['three'] = { url = 'http://www.lagoa.jp/shopdetail/%s', name = 'THREE!', logo = true },
    ['toranoana2'] = { url = 'http://www.toranoana.jp/mailorder/article/%s.html', name = 'Toranoana', logo = 'toranoana2_logo.png' },
    ['toranoana'] = { url = 'https://ec.toranoana.jp/tora_r/ec/item/%s', name = 'Toranoana', logo = true },
    ['universal'] = { url = 'https://store.universal-music.co.jp/product/%s', name = 'Universal', logo = true },
    ['tower'] = { url = 'http://tower.jp/item/%s', name = 'TOWER RECORDS', logo = true },
    ['tsutaya'] = { url = 'http://shop.tsutaya.co.jp/cd/product.html?janCd=%s', name = 'Tsutaya (end of service)', logo = true },
    ['gamers'] = { url = 'https://www.gamers.co.jp/pd/%s', name = 'Gamers', logo = true },
    ['gamers2'] = { url = 'http://www.gamers-onlineshop.jp/pd/%s', name = 'Gamers', logo = false },
    ['rakuten'] = { url = 'http://books.rakuten.co.jp/rb/%s', name = 'Rakuten', logo = true },
    ['actfamily'] = { url = 'http://actfamily.shop-pro.jp/?pid=%s', name = 'act family', logo = true },
    ['joysound'] = { url = 'http://mstore.utasuki.jp/utasuki/%s/goods/goods_detail.html', name = 'JOYSOUND SHOPPING MALL', logo = true },
    ['7net2'] = { url = 'http://www.7netshopping.jp/cd/detail/-/accd/%s', name = '7 net shopping', logo = '7net2_logo.png' },
    ['7net'] = { url = 'https://7net.omni7.jp/detail/%s', name = '7 net shopping', logo = true },
    ['recochoku'] = { url = 'http://recochoku.jp/album/%s', name = 'Recochoku', logo = true },
    ['akibaoo'] = { url = 'http://www.akibaoo.com/c/item/%s', name = 'Akibaoo', logo = true },
    ['due'] = { url = 'http://d-ue.jp/item/%s', name = 'd-ue', logo = true },
    ['vvstore'] = { url = 'https://vvstore.jp/products/detail/%s', name = 'Village Vanguard Online Store', logo = true },
    ['bunkyodo'] = { url = 'http://www.bunkyodojoy.com/shop/g/%s', name = 'Bunkyoudou Hobby & Animega', logo = true },
    ['dwango'] = { url = 'https://pc.dwango.jp/portals/album/%s', name = 'Dwango', logo = true },
}

function p.link(frame)
    local args = frame:getParent().args
    local serviceId = args[1] or ''
    local itemId = args[2] or ''
    local param3 = args[3]
    local param4 = args[4]

    local service = services[serviceId]

    if not service then
        return ''
    end

    local linkUrl = ''
    if serviceId == 'booth' then
        linkUrl = string.format(service.url, param3 or 'www', itemId)
    else
        linkUrl = string.format(service.url, itemId)
    end

    local linkName = service.name
    
    if serviceId == 'booth' then
        if param3 then
            linkName = string.format(service.name, param3)
        end
        if param4 and param4 ~= '' then
            linkName = linkName .. ' (' .. param4 .. ')'
        end
    else
        if param3 and param3 ~= '' then
            linkName = linkName .. ' (' .. param3 .. ')'
        end
    end

    local logoFile = 'world_logo.png'
    if service.logo == true then
        logoFile = serviceId .. '_logo.png'
    elseif type(service.logo) == 'string' then
        logoFile = service.logo
    end

    return string.format('[[File:%s|120px|link=%s|%s]]', logoFile, linkUrl, linkName)
end

return p