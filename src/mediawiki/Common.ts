/**
 * Keep code in MediaWiki:Common.js to a minimum as it is unconditionally
 * loaded for all users on every wiki page. If possible create a gadget that is
 * enabled by default instead of adding it here (since gadgets are fully
 * optimized ResourceLoader modules with possibility to add dependencies etc.)
 *
 * Since Common.js isn't a gadget, there is no place to declare its
 * dependencies, so we have to lazy load them with mw.loader.using on demand and
 * then execute the rest in the callback. In most cases these dependencies will
 * be loaded (or loading) already and the callback will not be delayed. In case a
 * dependency hasn't arrived yet it'll make sure those are loaded before this.
 */

/* global mw, $ */
/* jshint strict:false, browser:true */
mw.loader.load("https://cdn.jsdelivr.net/gh/lihaohong6/MirahezeDevScripts@dist/dist/FilterTable/gadget-impl.js");
mw.loader.using( ['mediawiki.util', 'mediawiki.notify'] ).done( function () {
/* Begin of mw.loader.using callback */

/**
 * Redirect User:Name/skin.js and skin.css to the current skin's pages
 * (unless the 'skin' page really exists)
 * @source: http://www.mediawiki.org/wiki/Snippets/Redirect_skin.js
 * @rev: 2
 */
if ( mw.config.get( 'wgArticleId' ) === 0 && mw.config.get( 'wgNamespaceNumber' ) === 2 ) {
	var titleParts = mw.config.get( 'wgPageName' ).split( '/' );
	/* Make sure there was a part before and after the slash
	   and that the latter is 'skin.js' or 'skin.css' */
	if ( titleParts.length == 2 ) {
		var userSkinPage = titleParts.shift() + '/' + mw.config.get( 'skin' );
		if ( ( titleParts.slice( -1 ) as any ) == 'skin.js' ) {
			window.location.href = mw.util.getUrl( userSkinPage + '.js' );
		} else if ( ( titleParts.slice( -1 ) as any ) == 'skin.css' ) {
			window.location.href = mw.util.getUrl( userSkinPage + '.css' );
		}
	}
}

/**
 * Map addPortletLink to mw.util
 * @deprecated: Use mw.util.addPortletLink instead.
 */
mw.log.deprecate( window, ('addPortletLink' as any), (mw.util.addPortletLink as any), 'Use mw.util.addPortletLink instead' );

/**
 * Extract a URL parameter from the current URL
 * @deprecated: Use mw.util.getParamValue with proper escaping
 */
mw.log.deprecate( window, ('getURLParamValue' as any), (mw.util.getParamValue as any), 'Use mw.util.getParamValue instead' );

/**
 * Test if an element has a certain class
 * @deprecated:  Use $(element).hasClass() instead.
 */
( mw.log.deprecate as any )( window, 'hasClass', function ( element: any, className: any ) {
	return $( element ).hasClass( className );
}, 'Use jQuery.hasClass() instead' );

/**
 * @source www.mediawiki.org/wiki/Snippets/Load_JS_and_CSS_by_URL
 * @rev 6
 */
var extraCSS = mw.util.getParamValue( 'withCSS' ),
	extraJS = mw.util.getParamValue( 'withJS' );

if ( extraCSS ) {
	if ( extraCSS.match( /^MediaWiki:[^&<>=%#]*\.css$/ ) ) {
		mw.loader.load( '/w/index.php?title=' + extraCSS + '&action=raw&ctype=text/css', 'text/css' );
	} else {
		mw.notify( 'Only pages from the MediaWiki namespace are allowed.', { title: 'Invalid withCSS value' } );
	}
}

if ( extraJS ) {
	if ( extraJS.match( /^MediaWiki:[^&<>=%#]*\.js$/ ) ) {
		mw.loader.load( '/w/index.php?title=' + extraJS + '&action=raw&ctype=text/javascript' );
	} else {
		mw.notify( 'Only pages from the MediaWiki namespace are allowed.', { title: 'Invalid withJS value' } );
	}
}

/* Actions specific to the edit page */
if ( mw.config.get( 'wgAction' ) === 'edit' || mw.config.get( 'wgAction' ) === 'submit' ) {
	/**
	 * Fix edit summary prompt for undo
	 *
	 *  Fixes the fact that the undo function combined with the "no edit summary prompter"
	 *  complains about missing editsummary, if leaving the edit summary unchanged.
	 *  Added by [[User:Deskana]], code by [[User:Tra]].
	 *  See also [[phab:T10912]].
	 */
	$(function () {
		if (document.location.search.indexOf('undo=') !== -1 && document.getElementsByName('wpAutoSummary')[0]) {
			(document.getElementsByName('wpAutoSummary')[0] as any).value = '1';
		}
	});
}

/* ----------------------------------------------------- */
/* Custom ProfilePage Schema Injector                    */
/* Bypasses WikiSEO schema limitations safely            */
/* ----------------------------------------------------- */
if ( mw.config.get( 'wgNamespaceNumber' ) === 0 ) {
    $(function() {
        var $schemaData = $('#utaite-schema-data');
        
        if ( $schemaData.length ) {
            var schema: any = {
                "@context": "https://schema.org",
                "@type": "ProfilePage",
                "mainEntity": {
                    "@type": $schemaData.data('type') || "Person",
                    "name": $schemaData.data('name'),
                    "sameAs": []
                }
            };

            var addSocial = function(urlBase: any, dataKey: any) {
                var val = $schemaData.data(dataKey);
                if (val) {
                    schema.mainEntity.sameAs.push(urlBase + val);
                }
            };

            addSocial('https://www.youtube.com/@', 'ythandle');
            addSocial('https://twitter.com/', 'twitter');
            addSocial('https://www.instagram.com/', 'instagram');
            addSocial('https://bsky.app/profile/', 'bluesky');
            addSocial('https://www.tiktok.com/@', 'tiktok');
            addSocial('https://www.twitch.tv/', 'twitch');
            addSocial('https://soundcloud.com/', 'soundcloud');

            if (schema.mainEntity.sameAs.length === 0) {
                delete schema.mainEntity.sameAs;
            }

            var script = document.createElement('script');
            script.type = 'application/ld+json';
            script.text = JSON.stringify(schema);
            document.head.appendChild(script);
        }
    });
}

/* End of mw.loader.using callback */
} );
/* DO NOT ADD CODE BELOW THIS LINE */

export {};
