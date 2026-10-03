/**
 * Script to replace user avatar icon with actual avatar image from SocialProfile.
 */
(function() {
    'use strict';

    /**
     * The main function that performs the avatar replacement.
     * @param {HTMLElement} avatarIcon - The icon element to be replaced.
     */
	function replaceUserAvatar(avatarIcon) {
	    if (avatarIcon.getAttribute('data-avatar-processed')) {
	        return;
	    }
	    avatarIcon.setAttribute('data-avatar-processed', 'true');
	
	    const userName = mw.config.get('wgUserName');
	    const userId = mw.config.get('wgUserId');
	
	    if (!userName || userId === 0) {
	        return;
	    }
	
	    const dbName = mw.config.get('wgDBname');
	    if (!dbName) {
	        console.error('Could not determine wgDBname from mw.config.');
	        return;
	    }
	
	    // Build the base (without extension) and a list of extension candidates
	    const cacheBuster = Date.now();
	    const baseUrl = `//static.wikitide.net/${dbName}/avatars/${dbName}_${userId}_l`;
	
	    // Generate case variations for each extension
	    const getExtCandidates = () => {
	        const bases = ['png', 'jpg', 'jpeg', 'webp'];
	        const set = new Set();
	        for (const ext of bases) {
	            const lower = ext.toLowerCase();
	            set.add(lower);                  // png
	            set.add(lower.toUpperCase());    // PNG
	            set.add(lower.charAt(0).toUpperCase() + lower.slice(1)); // Png/Jpg/Jpeg/Webp
	            if (lower === 'webp') set.add('WebP'); // explicitly include WebP
	        }
	        return Array.from(set);
	    };
	    const extCandidates = getExtCandidates();
	
	    // Create the image element once; try sources sequentially
	    const avatarImg = document.createElement('img');
	    avatarImg.height = 25;
	    avatarImg.className = 'mw-socialprofile-avatar citizen-ui-icon';
	    avatarImg.alt = `${userName}'s avatar`;
	    avatarImg.title = `${userName}'s avatar`;
	
	    let i = 0;
	
	    function tryNext() {
	        if (i >= extCandidates.length) {
	            console.error('Avatar image failed to load for any known extension:', baseUrl);
	            avatarIcon.setAttribute('data-avatar-processed', 'failed');
	            return;
	        }
	        const ext = extCandidates[i++];
	        avatarImg.src = `${baseUrl}.${ext}?r=${cacheBuster}`;
	    }
	
	    avatarImg.onload = function() {
	        if (avatarIcon.parentNode) {
	            avatarIcon.parentNode.replaceChild(avatarImg, avatarIcon);
	        }
	    };
	
	    avatarImg.onerror = function() {
	        tryNext(); // try the next extension
	    };
	
	    // Kick off the first attempt
	    tryNext();
	}

    /**
     * Set up a MutationObserver to watch for the avatar icon.
     */
    function initObserver() {
        const targetNode = document.body;
        const config = { childList: true, subtree: true };
        const selector = '.citizen-ui-icon.mw-ui-icon-wikimedia-userAvatar';

        const observer = new MutationObserver(function() {
            const iconElement = document.querySelector(selector);
            if (iconElement && !iconElement.getAttribute('data-avatar-processed')) {
                replaceUserAvatar(iconElement);
            }
        });

        const initialIcon = document.querySelector(selector);
        if (initialIcon) {
            replaceUserAvatar(initialIcon);
        }

        observer.observe(targetNode, config);
    }

    mw.loader.using(['mediawiki.util', 'mediawiki.user']).then(initObserver);

})();