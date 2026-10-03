// @keep-use-strict: live runs this strict (see plugins/preserve-use-strict.ts)
/**
 * ProfileChips — Custom user profile masthead tags
 *
 * Config: [[MediaWiki:ProfileChips.json]]
 * Require: UserProfileV2 extension
 * Author: Utaite Wiki
 */
( function () {
    'use strict';

    var profileUser = mw.config.get( 'wgRelevantUserName' );
    if ( !profileUser ) return;

    var ATTRIBUTES_SEL = '.profile-header-attributes',
	    TAG_CLASS      = 'profile-chip',
	    BADGE_SEL      = '.profile-user-group',
	    LINK_RE        = /^\[\[(.+?)\|(.+?)\]\]$/,
	    MAX_RETRIES    = 20,
	    RETRY_DELAY    = 250;

    mw.loader.using( 'mediawiki.util' ).then( function () {
        $.getJSON( mw.util.wikiScript(), {
            action: 'raw',
            title:  'MediaWiki:ProfileChips.json',
            ctype:  'application/json'
        } )
        .done( function ( cfg ) {
            var tags = cfg && cfg.users && cfg.users[ (profileUser as any) ];
            if ( !tags || !tags.length ) return;
            (whenReady as any)( function ( $ct: any ) {
                render( $ct, tags, cfg.hideTags !== false );
            } );
        } )
        .fail( function () {
            mw.log.warn( '[ProfileChips]: failed to fetch MediaWiki:ProfileChips.json' );
        } );
    } );

    function whenReady( fn: any, attempt: any ) {
        attempt = attempt || 0;
        var $el = $( ATTRIBUTES_SEL );
        if ( $el.length ) {
            fn( $el );
            return;
        }
        if ( attempt < MAX_RETRIES ) {
            setTimeout( function () { whenReady( fn, attempt + 1 ); }, RETRY_DELAY );
        } else {
            mw.log.warn( '[ProfileChips]: container "' + ATTRIBUTES_SEL + '" not found after ' + MAX_RETRIES + ' retries.' );
        }
    }

    function render( $container: any, tags: any, hide: any ) {
        if ( hide ) $container.find( BADGE_SEL ).remove();

        var $fragment = $( document.createDocumentFragment() );

        tags.forEach( function ( tag: any ) {
            var $span = $( '<span>' ).addClass( TAG_CLASS ),
                m     = LINK_RE.exec( tag );

            if ( m ) {
                $span.addClass( tagClass( m[ 2 ] ) ).append(
                    $( '<a>', { href: mw.util.getUrl( m[ 1 ] ), text: m[ 2 ] } )
                        .css( { color: 'inherit', textDecoration: 'none' } )
                );
            } else {
                $span.addClass( tagClass( tag ) ).text( tag );
            }

            $fragment.append( $span );
        } );

        $container.append( $fragment );
        mw.hook( 'ProfileChips.ready' ).fire( $container );
    }

    function tagClass( text: any ) {
	    return TAG_CLASS + '-' + text.toLowerCase()
	        .replace( /[^a-z0-9\s]/g, '' )
	        .replace( /\s+/g, '_' );
	}

}() );

export {};
