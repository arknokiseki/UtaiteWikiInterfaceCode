// Poll Comment Delete Fix
// Specifically targets the Extension:Poll comment deletion bug

(function() {
    'use strict';
    
    // Only run on Poll namespace pages
    if (mw.config.get('wgCanonicalNamespace') !== 'Poll') {
        return;
    }
    
    // Function to get a fresh CSRF token
    function getCSRFToken(callback) {
        var api = new mw.Api();
        api.get({
            action: 'query',
            meta: 'tokens',
            type: 'csrf',
            format: 'json'
        }).done(function(data) {
            if (data.query && data.query.tokens && data.query.tokens.csrftoken) {
                callback(data.query.tokens.csrftoken);
            } else {
                console.error('Failed to get CSRF token');
                callback(null);
            }
        }).fail(function() {
            console.error('API request for token failed');
            callback(null);
        });
    }
    
    // Function to attempt comment deletion with multiple methods
    function deleteComment(commentId, token) {
        var api = new mw.Api();
        
        // Method 1: Try the standard way but with different parameter names
        var attempts = [
            // Original format that's failing
            {
                action: 'commentdelete',
                commentID: commentId,
                token: token,
                format: 'json'
            },
            // Try with lowercase 'id'
            {
                action: 'commentdelete',
                commentid: commentId,
                token: token,
                format: 'json'
            },
            // Try with just 'id'
            {
                action: 'commentdelete',
                id: commentId,
                token: token,
                format: 'json'
            },
            // Try with 'cid' (comment id)
            {
                action: 'commentdelete',
                cid: commentId,
                token: token,
                format: 'json'
            }
        ];
        
        function tryMethod(index) {
            if (index >= attempts.length) {
                // All methods failed, try the form-based approach
                tryFormBasedDeletion(commentId, token);
                return;
            }
            
            var params = attempts[index];
            console.log('Trying method ' + (index + 1) + ':', params);
            
            api.post(params).done(function(data) {
                if (data.error) {
                    console.log('Method ' + (index + 1) + ' failed:', data.error);
                    tryMethod(index + 1);
                } else {
                    console.log('Success with method ' + (index + 1));
                    alert('Comment deleted successfully!');
                    // Remove the comment from DOM
                    var commentElement = document.getElementById('comment-' + commentId);
                    if (commentElement) {
                        commentElement.remove();
                    }
                    // Optionally reload page
                    // location.reload();
                }
            }).fail(function(error) {
                console.log('Method ' + (index + 1) + ' request failed:', error);
                tryMethod(index + 1);
            });
        }
        
        tryMethod(0);
    }
    
    // Alternative: Try form-based deletion (simulate the original form submission)
    function tryFormBasedDeletion(commentId, token) {
        console.log('Trying form-based deletion for comment', commentId);
        
        // Create a hidden form to submit the deletion
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = mw.util.wikiScript('api');
        form.style.display = 'none';
        
        var fields = {
            'action': 'commentdelete',
            'commentID': commentId,
            'token': token,
            'format': 'json'
        };
        
        for (var field in fields) {
            if (fields.hasOwnProperty(field)) {
                var input = document.createElement('input');
                input.type = 'hidden';
                input.name = field;
                input.value = fields[field];
                form.appendChild(input);
            }
        }
        
        document.body.appendChild(form);
        
        // Submit form and handle response
        var iframe = document.createElement('iframe');
        iframe.name = 'deleteFrame';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        form.target = 'deleteFrame';
        form.submit();
        
        // Check result after a delay
        setTimeout(function() {
            try {
                var response = iframe.contentDocument.body.textContent;
                var data = JSON.parse(response);
                if (data.error) {
                    console.error('Form-based deletion failed:', data.error);
                    alert('Unable to delete comment. Error: ' + data.error.info);
                } else {
                    alert('Comment deleted successfully!');
                    var commentElement = document.getElementById('comment-' + commentId);
                    if (commentElement) {
                        commentElement.remove();
                    }
                }
            } catch (e) {
                console.error('Failed to parse deletion response:', e);
                alert('Comment deletion status unclear. Please refresh the page to check.');
            }
            
            // Clean up
            document.body.removeChild(form);
            document.body.removeChild(iframe);
        }, 2000);
    }
    
    // Function to handle delete button clicks
    function handleDeleteClick(event) {
        event.preventDefault();
        
        var commentId = this.getAttribute('data-comment-id');
        if (!commentId) {
            alert('Could not determine comment ID');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this comment?')) {
            return;
        }
        
        // Show loading state
        var originalText = this.textContent;
        this.textContent = 'Deleting...';
        this.style.pointerEvents = 'none';
        
        var self = this;
        
        getCSRFToken(function(token) {
            if (!token) {
                alert('Failed to get authentication token');
                self.textContent = originalText;
                self.style.pointerEvents = '';
                return;
            }
            
            deleteComment(commentId, token);
            
            // Reset button state after a delay
            setTimeout(function() {
                self.textContent = originalText;
                self.style.pointerEvents = '';
            }, 3000);
        });
    }
    
    // Function to override existing delete functionality
    function initializeDeleteFix() {
        var deleteLinks = document.querySelectorAll('a.comment-delete-link');
        
        for (var i = 0; i < deleteLinks.length; i++) {
            var link = deleteLinks[i];
            
            // Remove any existing event listeners by cloning the element
            var newLink = link.cloneNode(true);
            link.parentNode.replaceChild(newLink, link);
            
            // Add our improved event listener
            newLink.addEventListener('click', handleDeleteClick);
        }
        
        console.log('Poll comment delete fix initialized for', deleteLinks.length, 'delete links');
    }
    
    // Alternative fallback: Hide comment locally if API fails completely
    function hideCommentLocally(commentId) {
        var commentElement = document.getElementById('comment-' + commentId);
        if (commentElement) {
            commentElement.style.opacity = '0.5';
            commentElement.style.textDecoration = 'line-through';
            
            var commentText = commentElement.querySelector('.c-comment');
            if (commentText) {
                commentText.innerHTML = '<em>[Comment deleted locally - may still be visible to others]</em>';
            }
            
            // Store in sessionStorage for this session
            try {
                var hiddenComments = JSON.parse(sessionStorage.getItem('hiddenComments') || '[]');
                if (hiddenComments.indexOf(commentId) === -1) {
                    hiddenComments.push(commentId);
                    sessionStorage.setItem('hiddenComments', JSON.stringify(hiddenComments));
                }
            } catch (e) {
                console.warn('Could not store hidden comment info:', e);
            }
        }
    }
    
    // Restore hidden comments on page load
    function restoreHiddenComments() {
        try {
            var hiddenComments = JSON.parse(sessionStorage.getItem('hiddenComments') || '[]');
            for (var i = 0; i < hiddenComments.length; i++) {
                hideCommentLocally(hiddenComments[i]);
            }
        } catch (e) {
            console.warn('Could not restore hidden comments:', e);
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeDeleteFix();
            restoreHiddenComments();
        });
    } else {
        initializeDeleteFix();
        restoreHiddenComments();
    }
    
    // Reinitialize after any dynamic content updates
    if (window.mw && mw.hook) {
        mw.hook('wikipage.content').add(function() {
            setTimeout(initializeDeleteFix, 100);
        });
    }
    
})();

// Debug function for manual testing
window.debugPollCommentDelete = function(commentId) {
    console.log('Manual debug delete for comment', commentId);
    
    var api = new mw.Api();
    api.get({
        action: 'query',
        meta: 'tokens',
        type: 'csrf'
    }).done(function(data) {
        var token = data.query.tokens.csrftoken;
        console.log('Got token:', token);
        
        // Try the original failing request
        api.post({
            action: 'commentdelete',
            commentID: commentId,
            token: token,
            format: 'json'
        }).done(function(result) {
            console.log('Delete result:', result);
        }).fail(function(error) {
            console.log('Delete error:', error);
        });
    });
};