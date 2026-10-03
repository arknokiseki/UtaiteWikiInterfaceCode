(function(mw) {
  mw.loader.impl(function() {
    return ["ext.gadget.getuserprofile@1e8b828c", function($, jQuery, require, module) {
      /*!
      ********************************************************************************
      *
      * Avatar Fetcher (for [[mw:Extension:UserProfileV2|UserProfileV2]] Extension).
      * Authors: 
      * - makudoumee
      * 
      * This file has been synced with the shared repository on GitHub.
      * GitHub Repository: https://github.com/arknokiseki/UtaiteWikiInterfaceCode
      * Please do not edit this page directly.
      * 
      * Source code:
      * https://github.com/arknokiseki/UtaiteWikiInterfaceCode/blob/main/src/gadgets/utility/getuserprofile/getuserprofile.ts
      * 
      * [[Category:Scripts]]
      * 
      ********************************************************************************/
      (function(mw2, $2) {
        const BATCH_SIZE = 50;
        function fetchAvatars(userList, userMap) {
          const api = new mw2.Api();
          api.get({
            action: "query",
            format: "json",
            list: "queryuserprofilev2",
            us_users: userList.join("|")
          }).then(function(data) {
            if (!data.query || !data.query.queryuserprofilev2) return;
            requestAnimationFrame(function() {
              var _a;
              const results = ((_a = data.query) == null ? void 0 : _a.queryuserprofilev2) || [];
              results.forEach(function(userData) {
                const name = userData.name;
                const avatarUrl = userData["profile-avatar"];
                if (avatarUrl && userMap[name]) {
                  userMap[name].forEach(function($el) {
                    const $img = $el.find("img");
                    $img.attr("src", avatarUrl).removeClass("useravatar-loading");
                  });
                  delete userMap[name];
                }
              });
            });
          }).catch(function(err) {
            console.error("Avatar batch failed", err);
          });
        }
        function processAvatars($content) {
          const $containers = $content.find(".useravatar-container").not(".processed");
          if ($containers.length === 0) return;
          $containers.addClass("processed");
          const userMap = {};
          const uniqueUsers = [];
          $containers.each(function() {
            const $el = $2(this);
            const username = $el.data("username");
            if (!username) return;
            if (!userMap[username]) {
              userMap[username] = [];
              uniqueUsers.push(username);
            }
            userMap[username].push($el);
            const size = $el.data("size") || 138;
            const radius = $el.data("radius") || "50%";
            const $placeholder = $2("<img>", {
              src: "https://static.wikitide.net/utaitewiki/e/e6/Site-logo.png",
              class: "useravatar-img useravatar-loading",
              alt: username
            }).css({
              width: size + "px",
              height: size + "px",
              borderRadius: radius,
              display: "inline-block",
              verticalAlign: "middle"
            });
            $el.empty().append($placeholder);
          });
          for (let i = 0; i < uniqueUsers.length; i += BATCH_SIZE) {
            const batch = uniqueUsers.slice(i, i + BATCH_SIZE);
            fetchAvatars(batch, userMap);
          }
        }
        mw2.loader.using(["mediawiki.api"]).then(function() {
          mw2.hook("wikipage.content").add(processAvatars);
        });
      })(mediaWiki, jQuery);
    }, { "css": [] }, {}, {}, null];
  });
})(mediaWiki);