/* All JavaScript here will be loaded for users of the Citizen skin */

/* Font Awesome 6 (solid + regular + brands). Pinned: stays on v6, where the
   "Font Awesome 6 Free" family names used in our CSS still exist. */
mw.loader.load( 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css', 'text/css' );

/* Sakura: only fetch the script on pages that actually show the graduated template */
( function () {
	var sakuraLoaded = false;
	mw.hook( 'wikipage.content' ).add( function ( $content ) {
		if ( sakuraLoaded || !$content[ 0 ] ||
			!$content[ 0 ].querySelector( '.status-templates.graduated-template' ) ) {
			return;
		}
		sakuraLoaded = true;
		mw.loader.load( '/w/index.php?title=MediaWiki:Sakura.js&action=raw&ctype=text/javascript' );
	} );
}() );

/* ========== Splash Screen ========== */
( function () {
	var splash = (window as any).__splash;
	if ( !splash ) return;

	/* Dismiss when MediaWiki signals page content is ready */
	mw.hook( 'wikipage.content' ).add( function () {
		requestAnimationFrame( splash.dismiss );
	} );

	/* --- Re-show splash on internal navigation --- */
	if ( mw.config.get( 'wgNamespaceNumber' ) === -1 ) return;

	var pathPrefix = mw.config.get( 'wgArticlePath', '/wiki/$1' ).replace( '$1', '' );
	var specialNS = mw.config.get( 'wgFormattedNamespaces' )[ -1 ] || 'Special';

	function isSpecial( href: any ) {
		try {
			var u = new URL( href, location.origin );
			if ( u.origin !== location.origin ) return true;
			var path = decodeURIComponent( u.pathname );
			if ( path.startsWith( pathPrefix ) ) {
				var title = path.slice( pathPrefix.length );
				if ( title.startsWith( 'Special:' ) || title.startsWith( specialNS + ':' ) ) return true;
			}
			var t = u.searchParams.get( 'title' ) || '';
			if ( t.startsWith( 'Special:' ) || t.startsWith( specialNS + ':' ) ) return true;
		} catch ( e ) {
			return true;
		}
		return false;
	}

	function isSamePageHash( href: any ) {
		try {
			var url = new URL( href, location.origin );
			return url.pathname === location.pathname &&
				url.search === location.search &&
				!!url.hash;
		} catch ( e ) {
			return false;
		}
	}

	document.addEventListener( 'click', function ( e ) {
		if ( e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ) return;
		var a = (e.target! as any).closest( 'a[href]' );
		if ( !a ) return;
		var href = a.getAttribute( 'href' );
		if ( !href || href.charAt( 0 ) === '#' || href.startsWith( 'javascript:' ) ) return;
		if ( a.target === '_blank' || a.hasAttribute( 'download' ) ) return;
		try {
			if ( new URL( href, location.origin ).origin !== location.origin ) return;
		} catch ( ex ) {
			return;
		}
		if ( isSamePageHash( href ) ) return;
		if ( isSpecial( href ) ) return;

		/* Check defaultPrevented only after every click handler has run, so a
		   handler registered later (lightbox, QuickPurge, etc.) that cancels the
		   navigation doesn't leave the splash stuck until the 3s fallback. */
		setTimeout( function () {
			if ( !e.defaultPrevented ) splash.reset();
		}, 0 );
	} );
}() );

export {};
