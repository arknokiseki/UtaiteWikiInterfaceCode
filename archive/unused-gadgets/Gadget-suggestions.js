/**
 * Template Autocomplete for MediaWiki's CodeMirror Source Editor
 *
 * @description Provides a suggestion dropdown for template names when a user types "{{<name>"
 * @author ark
 * @version 1.0.10
 */
( function ( mw, $ ) {
    'use strict';
    // console.log("suggester v1.0.10c");

    mw.loader.using( 'mediawiki.api' ).then( function () {
        if ( mw.config.get( 'wgAction' ) !== 'edit' && mw.config.get( 'wgAction' ) !== 'submit' ) {
            return;
        }

        console.log( '[TemplateSuggester] Script loaded. Waiting for editor to appear...' );

        const Suggester = {
            api: new mw.Api(),
            cache: {},
            $ui: null,
            $textbox: $( '#wpTextbox1' ),
            $editor: null,
            active: false,
            startPos: null,
            endPos: null,
            selectedIndex: -1,
            debounceTimeout: null,
    
            init: function () {
                this.$editor = $( '.CodeMirror-code[contenteditable="true"]' );
                $( 'body' ).data( 'suggester-initialized', true );
                this.createUI();
                
                this.$editor.on( 'keyup.suggester', ( e ) => {
                    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(e.key)) return;
                    clearTimeout( this.debounceTimeout );
                    this.debounceTimeout = setTimeout( () => this.onEditorChange(), 250 );
                } );
                
                this.$editor.on( 'keydown.suggester', ( e ) => {
                    if ( this.active ) this.handleKey( e );
                } );
    
                console.log( '[TemplateSuggester] Initialized successfully. Listening on CodeMirror surface.' );
            },
    
            createUI: function () {
                const styles = `#cm-template-suggester{position:absolute;z-index:2000;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);max-height:250px;min-width:250px;overflow-y:auto;padding:4px;font-family:sans-serif;font-size:13px}#cm-template-suggester ul{list-style:none;margin:0;padding:0}#cm-template-suggester li{padding:6px 12px;cursor:pointer;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.skin-theme-clientpref-day #cm-template-suggester,body:not([class*="skin-theme-clientpref"]) #cm-template-suggester{background:#fff;border:1px solid #d0d7de;color:#24292f}.skin-theme-clientpref-day #cm-template-suggester li:hover,body:not([class*="skin-theme-clientpref"]) #cm-template-suggester li:hover{background:#f6f8fa}.skin-theme-clientpref-day #cm-template-suggester li.selected,body:not([class*="skin-theme-clientpref"]) #cm-template-suggester li.selected{background:#0969da;color:#fff}.skin-theme-clientpref-night #cm-template-suggester{background:#1c2128;border:1px solid #484f58;color:#c9d1d9}.skin-theme-clientpref-night #cm-template-suggester li:hover{background:#30363d}.skin-theme-clientpref-night #cm-template-suggester li.selected{background:#1f6feb;color:#fff}`;
                mw.util.addCSS( styles );
                this.$ui = $( '<div>' ).attr( 'id', 'cm-template-suggester' ).append( '<ul>' ).hide().appendTo( '.wikiEditor-ui-view' );
                this.$ui.on( 'mousedown', 'li', ( e ) => { e.preventDefault(); this.insertSuggestion( $( e.currentTarget ).data( 'templateName' ) ); } );
            },
            
            onEditorChange: function () {
                const caretPos = this.$textbox.textSelection( 'getCaretPosition' );
                const text = this.$textbox.textSelection( 'getContents' );
                const textBeforeCursor = text.substring( 0, caretPos );
                const match = textBeforeCursor.match( /{{\s*([^{}[\]|#\n]{3,})$/i );
                
                if ( match ) {
                    const query = match[ 1 ];
                    this.startPos = caretPos - query.length;
                    this.endPos = caretPos;
                    this.fetchSuggestions( query );
                } else {
                    this.hide();
                }
            },
    
            handleKey: function( e ) {
                let handled = false;
                const items = this.$ui.find( 'li' );
                if ( items.length === 0 ) return;
    
                switch ( e.key ) {
                    case 'ArrowDown': this.selectedIndex = ( this.selectedIndex + 1 ) % items.length; handled = true; break;
                    case 'ArrowUp': this.selectedIndex = ( this.selectedIndex - 1 + items.length ) % items.length; handled = true; break;
                    case 'Enter': case 'Tab': if ( this.selectedIndex > -1 ) this.insertSuggestion( $( items[ this.selectedIndex ] ).data( 'templateName' ) ); handled = true; break;
                    case 'Escape': this.hide(); handled = true; break;
                }
    
                if ( handled ) { e.preventDefault(); e.stopPropagation(); this.updateSelection(); }
            },
            
            fetchSuggestions: function( query ) {
                const lowerCaseQuery = query.toLowerCase();
                if ( this.cache[ lowerCaseQuery ] ) { this.showSuggestions( this.cache[ lowerCaseQuery ] ); return; }
                this.api.get( { action: 'opensearch', search: 'Template:' + query, namespace: 10, limit: 10 } )
                    .done( ( data ) => {
                        const suggestions = ( data[ 1 ] || [] ).map( t => t.replace( /^Template:/, '' ) );
                        this.cache[ lowerCaseQuery ] = suggestions;
                        this.showSuggestions( suggestions );
                    } );
            },
            
            showSuggestions: function( suggestions ) {
                if ( suggestions.length === 0 ) { this.hide(); return; }
                this.active = true;
                this.selectedIndex = 0;
                this.$ui.find( 'ul' ).empty().append( suggestions.map( name => $( '<li>' ).text( name ).data( 'templateName', name ) ) );
                this.$ui.css( { top: 5, right: 5, left: 'auto', bottom: 'auto' } ).show();
                this.updateSelection();
            },
    
            insertSuggestion: function( templateName ) {
                const originalText = this.$textbox.textSelection( 'getContents' );
                const textBeforeQuery = originalText.substring(0, this.startPos);
                const openingBracesPos = textBeforeQuery.lastIndexOf('{{');

                if (openingBracesPos === -1) return;

                const prefix = originalText.substring( 0, openingBracesPos );
                const suffix = originalText.substring( this.endPos );

                const newText = prefix + '{{' + templateName + '}}' + suffix;
                const newCaretPos = ( prefix + '{{' + templateName + '}}' ).length;

                this.$textbox.textSelection( 'setContents', newText );
                this.$textbox.textSelection( 'setSelection', { start: newCaretPos, end: newCaretPos } );
                
                this.hide();
            },
    
            updateSelection: function() {
                this.$ui.find( 'li' ).removeClass( 'selected' ).eq( this.selectedIndex ).addClass( 'selected' );
            },
    
            hide: function() {
                if ( !this.active ) return;
                this.active = false;
                this.$ui.hide().find( 'ul' ).empty();
            }
        };
    
        // --- POLLING INITIALIZER ---
        let attempts = 0;
        const maxAttempts = 50; // Try for 5 seconds
        const poller = setInterval(function() {
            if ( $( '.CodeMirror-code[contenteditable="true"]' ).length ) {
                clearInterval( poller );
                Suggester.init();
            } else {
                attempts++;
                if ( attempts > maxAttempts ) {
                    clearInterval( poller );
                    console.error( '[TemplateSuggester] Timed out waiting for editor surface.' );
                }
            }
        }, 100);

    } );
}( mediaWiki, jQuery ) );