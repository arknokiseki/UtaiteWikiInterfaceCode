/**
 * MediaWiki Multimedia Viewer (MMV) Style Improvements
 */

(function() {
    'use strict';
    console.log("mmv helper script v1.0.1")
    var MMVOverlayEnhancer = {
        
        // Check if MMV is available
        isMMVAvailable: function() {
            return typeof mw !== 'undefined' && 
                   mw.mmv && 
                   mw.mmv.viewer;
        },
        
        // Create clickable overlay background
        createClickableOverlay: function() {
            // Use the existing overlay and make it clickable
            var overlay = document.querySelector('.mw-mmv-overlay');
            if (overlay) {
                overlay.style.cursor = 'pointer';
                overlay.addEventListener('click', function(e) {
                    // Only close if clicking directly on the overlay, not on content
                    if (e.target === overlay) {
                        MMVOverlayEnhancer.closeMMV();
                    }
                });
            }
            return overlay;
        },
        
        // Close MMV function
        closeMMV: function() {
            if (this.isMMVAvailable()) {
                mw.mmv.viewer.close();
            } else {
                // Fallback: try to find and click close button
                var closeButton = document.querySelector('.mw-mmv-close');
                if (closeButton) {
                    closeButton.click();
                }
            }
        },
        
        // Enhance overlay when MMV opens
        enhanceOverlay: function() {
            var overlay = document.querySelector('.mw-mmv-overlay');
            var wrapper = document.querySelector('.mw-mmv-wrapper');
            
            if (!overlay || !wrapper) {
                return;
            }
            
            // Make the overlay clickable to close
            this.createClickableOverlay();
            
            // Prevent clicks on the wrapper from closing
            wrapper.addEventListener('click', function(e) {
                e.stopPropagation();
            });
            
            // Add escape key handler
            var escapeHandler = function(e) {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    MMVOverlayEnhancer.closeMMV();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        },
        
        // Clean up when MMV closes
        cleanupOverlay: function() {
            // Reset overlay cursor
            var overlay = document.querySelector('.mw-mmv-overlay');
            if (overlay) {
                overlay.style.cursor = '';
            }
        },
        
        // Initialize the enhancer
        init: function() {
            var self = this;
            
            // Wait for MMV to be available
            mw.loader.using(['mmv.bootstrap'], function() {
                
                // Hook into MMV events if available
                if (self.isMMVAvailable()) {
                    mw.mmv.viewer.on('mmv-open', function() {
                        // Small delay to ensure DOM is ready
                        setTimeout(function() {
                            self.enhanceOverlay();
                        }, 100);
                    });
                    
                    mw.mmv.viewer.on('mmv-close', function() {
                        self.cleanupOverlay();
                    });
                } else {
                    // Fallback: Use mutation observer
                    self.setupMutationObserver();
                }
            });
        },
        
        // Fallback method using mutation observer
        setupMutationObserver: function() {
            var self = this;
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(function(node) {
                            if (node.nodeType === 1) { // Element node
                                if (node.classList && node.classList.contains('mw-mmv-overlay')) {
                                    setTimeout(function() {
                                        self.enhanceOverlay();
                                    }, 100);
                                }
                            }
                        });
                        
                        mutation.removedNodes.forEach(function(node) {
                            if (node.nodeType === 1) { // Element node
                                if (node.classList && node.classList.contains('mw-mmv-overlay')) {
                                    self.cleanupOverlay();
                                }
                            }
                        });
                    }
                });
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            MMVOverlayEnhancer.init();
        });
    } else {
        MMVOverlayEnhancer.init();
    }
    
    // Also initialize when mw is ready
    if (typeof mw !== 'undefined') {
        mw.hook('wikipage.content').add(function() {
            MMVOverlayEnhancer.init();
        });
    }
    
})();