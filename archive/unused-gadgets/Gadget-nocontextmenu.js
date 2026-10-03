/**
 * No Context Menu Gadget
 * 
 * Disables the right-click context menu on elements with the 'no-context-menu' class.
 * This is useful for protecting images, text, or other content from easy copying.
 * 
 * Usage: Add the class 'no-context-menu' to any HTML element to disable right-click
 * Example: <div class="no-context-menu">Protected content</div>
 * 
 * @version 1.0.0
 */

mw.loader.using(['jquery']).done(function () {
    'use strict';
    
    function disableContextMenu() {
        $('.no-context-menu').on('contextmenu', function(e) {
            e.preventDefault();
            return false;
        });
        
        $(document).on('contextmenu', '.no-context-menu', function(e) {
            e.preventDefault();
            return false;
        });
        
        $('.no-context-menu').css({
            '-webkit-user-select': 'none',
            '-moz-user-select': 'none',
            '-ms-user-select': 'none',
            'user-select': 'none'
        });
    }
    
    $(document).ready(function() {
        disableContextMenu();
    });
    
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        disableContextMenu();
    }
});