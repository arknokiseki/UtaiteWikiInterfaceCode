(function(mw, $) {
  mw.loader.using(["mediawiki.api"]).then(function() {
    $(function() {
      var USER_BLOG_NAMESPACE = 3e3;
      var FALLBACK_AVATAR = "https://static.wikitide.net/utaitewiki/e/e6/Site-logo.png";

      function getUserAvatar(username: any) {
		  return new mw.Api().get({
		    action: "query",
		    format: "json",
		    list: "queryuserprofilev2",
		    user_name: username.replace(/_/g, " ")
		  }).then(function(data) {
		    var profile = null;
		    if (data && data.query) {
		      if (Array.isArray(data.query) && data.query[0]) {
		        profile = data.query[0];
		      } else if (data.query.queryuserprofilev2 && data.query.queryuserprofilev2[0]) {
		        profile = data.query.queryuserprofilev2[0];
		      }
		    }
		    if (profile && profile["profile-avatar"]) {
		      var avatarUrl = profile["profile-avatar"];
		      if (avatarUrl.indexOf("//") === 0) {
		        avatarUrl = "https:" + avatarUrl;
		      }
		      return avatarUrl;
		    }
		    return FALLBACK_AVATAR;
		  }).catch(function() {
		    return FALLBACK_AVATAR;
		  });
	  }

      function calculateTimeAgo(isoTimestamp: any) {
        var now = (/* @__PURE__ */ new Date()).getTime();
        var past = new Date(isoTimestamp).getTime();
        var seconds = Math.floor((now - past) / 1e3);
        var interval = seconds / 31536e3;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592e3;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
      }

      function initializeCreateButton(container: any, blogOwnerUsername: any) {
        var currentUserName = mw.config.get("wgUserName");
        if (currentUserName === blogOwnerUsername.replace(/_/g, " ")) {
          var createButton = document.createElement("a");
          createButton.className = "wds-button";
          createButton.textContent = "Create New Post";
          createButton.style.marginBottom = "20px";
          createButton.style.display = "inline-block";
          createButton.href = "#";
          createButton.addEventListener("click", function(e) {
            e.preventDefault();
            var postTitle = window.prompt("Enter the title for your new blog post:", "");
            if (postTitle && postTitle.trim() !== "") {
              var newPageName = "User_blog:" + blogOwnerUsername + "/" + postTitle.trim();
              var newPostUrl = mw.util.getUrl(newPageName, { action: "edit" });
              window.location.href = newPostUrl;
            }
          });
          if (container.firstChild) {
            container.insertBefore(createButton, container.firstChild);
          } else {
            container.appendChild(createButton);
          }
        }
      }

      function initializePostPage() {
        var fullPageName = mw.config.get("wgPageName");
        var pageNameWithoutNamespace = fullPageName.slice(fullPageName.indexOf(":") + 1);
        var username = pageNameWithoutNamespace.split("/")[0];
        var userPageLink = mw.util.getUrl("User:" + username);
        var userBlogLink = mw.util.getUrl("User_blog:" + username);
        var usernameText = username.replace(/_/g, " ");
        var blogHeaderHTML = '<div class="custom-blog-subtitle">' +
          '<a href="' + userPageLink + '">' +
            '<div class="custom-blog-avatar">' +
              '<img src="' + FALLBACK_AVATAR + '" class="blog-avatar-loading" data-username="' + usernameText + '" />' +
            '</div>' +
          '</a>' +
          '<div class="custom-blog-details">' +
            '<a href="' + userPageLink + '">' + usernameText + '</a>' +
            '<span class="custom-blog-bullet">&bull;</span>' +
            '<span class="custom-blog-timestamp">loading...</span>' +
            '<span class="custom-blog-bullet">&bull;</span>' +
            '<a href="' + userBlogLink + '">User blog:' + usernameText + '</a>' +
          '</div>' +
        '</div>';
        var targetElement = document.querySelector(".citizen-page-heading");
        if (targetElement) {
          targetElement.insertAdjacentHTML("afterend", blogHeaderHTML);
          getUserAvatar(username).then(function(avatarUrl) {
            var avatarImg = document.querySelector(".blog-avatar-loading");
            if (avatarImg) {
              (avatarImg as any).src = avatarUrl;
              avatarImg.classList.remove("blog-avatar-loading");
            }
          });
        }
        new mw.Api().get({
          action: "query",
          prop: "revisions",
          titles: fullPageName,
          rvlimit: 1,
          rvprop: "timestamp",
          format: "json"
        }).then(function(data) {
          var pages = (data.query) ? data.query.pages : null;
          if (!pages) return;
          var pageId = Object.keys(pages)[0];
          if (pageId !== "-1" && pages[pageId].revisions && pages[pageId].revisions.length > 0) {
            var timestamp = pages[pageId].revisions[0].timestamp;
            var timeAgo = calculateTimeAgo(timestamp);
            var timestampElement = document.querySelector(".custom-blog-timestamp");
            if (timestampElement) {
              timestampElement.textContent = timeAgo;
            }
          }
        });
      }

      function initializeListingPage() {
        var pageActions = document.querySelector(".page-actions");
        if (pageActions) {
          (pageActions as any).style.display = "none";
        }
        var toc = document.getElementById("citizen-toc");
        if (toc) {
          toc.remove();
        }
        var contentArea = document.getElementById("mw-content-text");
        if (!contentArea) return;
        var fullPageName = mw.config.get("wgPageName");
        var username = fullPageName.slice(fullPageName.indexOf(":") + 1);
        var usernameText = username.replace(/_/g, " ");
        var userPageLink = mw.util.getUrl("User:" + username);

        contentArea.innerHTML = '<div class="blog-listing-container">' +
          '<div class="blog-listing-header">' +
            '<a href="' + userPageLink + '">' +
              '<div class="custom-blog-avatar blog-listing-avatar">' +
                '<img src="' + FALLBACK_AVATAR + '" class="blog-avatar-loading" data-username="' + usernameText + '" />' +
              '</div>' +
            '</a>' +
            '<h2>' + usernameText + '\'s Blog Posts</h2>' +
          '</div>' +
          '<div class="blog-listing-loader">Loading posts...</div>' +
        '</div>';

        getUserAvatar(username).then(function(avatarUrl) {
          var avatarImg = document.querySelector(".blog-avatar-loading");
          if (avatarImg) {
            (avatarImg as any).src = avatarUrl;
            avatarImg.classList.remove("blog-avatar-loading");
          }
        });

        var listingContainer = document.querySelector(".blog-listing-container");
        initializeCreateButton(listingContainer, username);

        // First query: get the list of blog post pages
        new mw.Api().get({
          action: "query",
          list: "allpages",
          apnamespace: USER_BLOG_NAMESPACE,
          apprefix: username + "/",
          aplimit: 50,
          format: "json"
        }).then(function(data: any): any {
          var pages = (data.query) ? data.query.allpages : null;
          var loader = document.querySelector(".blog-listing-loader");
          if (loader) {
            loader.remove();
          }

          if (!pages || pages.length === 0) {
            listingContainer!.insertAdjacentHTML("beforeend",
              "<p>This user hasn't written any blog posts yet.</p>");
            return;
          }

          // Second query: batch-fetch revision timestamps and extracts via titles param
          var titles = pages.map(function(p: any) { return p.title; }).join("|");

          return new mw.Api().get({
            action: "query",
            titles: titles,
            prop: "revisions|extracts",
            rvprop: "timestamp",
            exchars: 200,
            exintro: true,
            explaintext: true,
            format: "json"
          });
        }).then(function(data: any) {
          if (!data) return;
          var pagesObj = ((data as any).query) ? (data as any).query.pages : null;

          if (!pagesObj) {
            listingContainer!.insertAdjacentHTML("beforeend",
              "<p>This user hasn't written any blog posts yet.</p>");
            return;
          }

          // Convert to array and sort newest-first by latest revision timestamp
          var posts = Object.values(pagesObj).sort(function(a, b) {
            var tsA = ((a as any).revisions && (a as any).revisions[0]) ? (a as any).revisions[0].timestamp : "";
            var tsB = ((b as any).revisions && (b as any).revisions[0]) ? (b as any).revisions[0].timestamp : "";
            return tsB.localeCompare(tsA);
          });

          if (posts.length === 0) {
            listingContainer!.insertAdjacentHTML("beforeend",
              "<p>This user hasn't written any blog posts yet.</p>");
            return;
          }

          var postsHTML = "";
          for (var i = 0; i < posts.length; i++) {
            var post = posts[i];
            var postTitle = (post as any).title.slice((post as any).title.indexOf("/") + 1).replace(/_/g, " ");
            var postUrl = mw.util.getUrl((post as any).title);

            // Last edited timestamp
            var editedText = "";
            if ((post as any).revisions && (post as any).revisions[0]) {
              editedText = "Last edited " + calculateTimeAgo((post as any).revisions[0].timestamp);
            }

            // Excerpt from extracts prop
            var excerpt = (post as any).extract || "";

            postsHTML += '<div class="blog-card">' +
              '<div class="blog-card-header">' +
                '<div class="blog-card-meta">' + editedText + '</div>' +
              '</div>' +
              '<h3 class="blog-card-title"><a href="' + postUrl + '">' + postTitle + '</a></h3>' +
              (excerpt ? '<div class="blog-card-excerpt">' + excerpt + '</div>' : '') +
              '<div class="blog-card-footer">' +
                '<a href="' + postUrl + '" class="read-more-button">Read Full Post</a>' +
              '</div>' +
            '</div>';
          }

          listingContainer!.insertAdjacentHTML("beforeend", postsHTML);
        }).catch(function() {
          var loader = document.querySelector(".blog-listing-loader");
          if (loader) {
            loader.remove();
          }
          listingContainer!.insertAdjacentHTML("beforeend",
            "<p>Sorry, there was an error trying to load the blog posts.</p>");
        });
      }

      var wgNamespaceNumber = mw.config.get("wgNamespaceNumber");
      var wgAction = mw.config.get("wgAction");
      if (wgNamespaceNumber === USER_BLOG_NAMESPACE && wgAction === "view") {
        var pageTitle = mw.config.get("wgTitle");
        if (pageTitle.split("/").length > 1) {
          initializePostPage();
        } else {
          initializeListingPage();
        }
      }
    });
  });
})(mediaWiki, jQuery);

export {};
