(function() {
    'use strict';
    
    // Only run on Blog namespace pages
    if (mw.config.get('wgNamespaceNumber') !== 500) { // 500 is NS_BLOG
        return;
    }
    
    /**
     * Enhance the vote box functionality
     */
    function enhanceVoteBox() {
        // Find the vote box and vote action elements
        const voteBox = document.querySelector('.vote-box');
        const voteAction = document.querySelector('#Answer');
        
        if (!voteBox || !voteAction) {
            return; // Exit if elements not found
        }
        
        // Check if user has already voted
        const voteLink = voteAction.querySelector('a');
        const hasVoted = voteLink && voteLink.classList.contains('vote-unvote-link');
        
        // Add voted class if user has already voted
        if (hasVoted) {
            voteBox.classList.add('voted');
        }
        
        // Make the entire vote box clickable
        voteBox.addEventListener('click', function(e) {
            // Prevent default if clicking on the vote box itself
            if (e.target === voteBox || e.target.parentNode === voteBox) {
                e.preventDefault();
                
                // Find and click the actual vote/unvote link
                const voteLink = document.querySelector('.vote-action a');
                if (voteLink) {
                    voteLink.click();
                }
            }
        });
        
        // Observe changes to detect when vote state changes
        // This handles the AJAX response when voting
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' || mutation.type === 'childList') {
                    // Re-check vote state
                    const voteLink = document.querySelector('.vote-action a');
                    if (voteLink) {
                        const nowVoted = voteLink.classList.contains('vote-unvote-link');
                        voteBox.classList.toggle('voted', nowVoted);
                    }
                }
            });
        });
        
        // Observe both the vote box and vote action for changes
        observer.observe(voteBox, { attributes: true, childList: true, subtree: true });
        observer.observe(voteAction, { attributes: true, childList: true, subtree: true });
        
        // Add enhanced UI class to indicate our JS is working
        voteBox.classList.add('enhanced-vote-box');
        
        // Simplify the UI by hiding the original vote link
        voteAction.style.position = 'absolute';
        voteAction.style.left = '-9999px';
        voteAction.style.top = '-9999px';
    }
    
    // Run once the document is ready
    $(document).ready(enhanceVoteBox);
})();