$(() => {
    'use strict';

    // Only run on the Special:CreateBlogPost page
    if (mw.config.get('wgCanonicalSpecialPageName') !== 'CreateBlogPost') {
        return;
    }

    /**
     * @class BlogPostCreator
     * Handles the creation of a custom blog post creation form.
     */
    class BlogPostCreator {
        /**
         * The constructor initializes the gadget.
         */
        constructor() {
            this.$content = $('#mw-content-text');
            this.originalContent = this.$content.html();
            this.api = new mw.Api();

            this.init();
        }

        /**
         * Main initialization method.
         */
        init() {
            this.replaceForm();
            this.setupEventHandlers();
            this.checkForErrorMessages();
            this.loadCategories();
        }

        /**
         * Replaces the default form with our custom version.
         */
        replaceForm() {
            this.$content.empty();
            const $form = $('<form>', {
                id: 'bp-create-form',
                method: 'post',
                action: mw.util.getUrl('Special:CreateBlogPost'),
                enctype: 'multipart/form-data'
            }).append(
                this.createTitleSection(),
                this.createContentSection(),
                this.createCategorySection(),
                this.createCopyrightNotice(),
                this.createButtons(),
                this.createHiddenFields()
            );
            this.$content.append($form);
        }
        
        /**
         * Checks the original page content for any server-side error messages.
         */
        checkForErrorMessages() {
            const errorPatterns = [
                'blog-create-error-need-title',
                'blog-create-error-need-content',
                'blog-create-error-page-exists',
                'errorpagetitle'
            ];

            // Use .some() for a cleaner check
            const hasError = errorPatterns.some(pattern => this.originalContent.includes(pattern));

            if (hasError) {
                const $tempDiv = $('<div>').html(this.originalContent);
                const $errorElement = $tempDiv.find('.errorbox, .error, .mw-message-box-error');
                let errorMessage;

                if ($errorElement.length) {
                    errorMessage = $errorElement.text().trim();
                } else {
                    const textContent = $tempDiv.text().replace(/\s+/g, ' ').trim();
                    const errorStart = textContent.indexOf('Error:');
                    if (errorStart !== -1) {
                        errorMessage = textContent.substring(errorStart).split('.')[0] + '.';
                    } else {
                        errorMessage = 'An error occurred while creating the blog post.';
                    }
                }
                
                $('#bp-create-form').prepend(
                    $('<div>', {
                        class: 'bp-error-message',
                        text: errorMessage
                    })
                );
            }
        }

        // --- Form Section Creation Methods ---

        createTitleSection() {
            return $('<div>', { class: 'bp-section' }).append(
                $('<label>', { class: 'bp-label', for: 'title', text: 'Title' }),
                $('<input>', {
                    class: 'bp-input',
                    type: 'text',
                    id: 'title',
                    name: 'title2',
                    placeholder: 'Enter a title for your blog post',
                    required: true
                })
            );
        }

        createContentSection() {
            return $('<div>', { class: 'bp-section' }).append(
                $('<label>', { class: 'bp-label', for: 'wpTextbox1', text: 'Content' }),
                $('<textarea>', {
                    class: 'bp-textarea',
                    id: 'wpTextbox1',
                    name: 'wpTextbox1',
                    placeholder: 'Write your blog post content here...',
                    rows: 15,
                    required: true
                })
            );
        }

        createCategorySection() {
            // Using template literals for cleaner multi-line text
            const helpText = `Categories help organize information on the site. To add multiple categories, separate them by commas.`;
            return $('<div>', { class: 'bp-section' }).append(
                $('<label>', { class: 'bp-label', for: 'pageCtg', text: 'Categories' }),
                $('<p>', { class: 'bp-help-text', text: helpText }),
                $('<div>', { class: 'bp-tag-cloud', id: 'bp-tag-cloud', text: 'Loading categories...' }),
                $('<textarea>', {
                    class: 'bp-textarea bp-category-input',
                    id: 'pageCtg',
                    name: 'pageCtg',
                    placeholder: 'Enter categories separated by commas',
                    rows: 2
                })
            );
        }

        createCopyrightNotice() {
            // Using template literals makes embedding HTML so much easier, right?
            const copyrightHTML = `
                Please note that all contributions are considered to be released under the 
                <a href="/wiki/Utaite_Wiki:Copyrights" target="_blank">Creative Commons Attribution-ShareAlike License</a>. 
                If you do not want your writing to be edited and redistributed, then do not submit it here. 
                You are also promising that you wrote this yourself. <strong>Do not submit copyrighted work without permission!</strong>
            `;
            return $('<div>', { class: 'bp-section bp-copyright' }).append($('<p>').html(copyrightHTML));
        }

        createButtons() {
            return $('<div>', { class: 'bp-section bp-buttons' }).append(
                $('<button>', {
                    class: 'bp-button bp-button-preview',
                    type: 'button',
                    id: 'bp-preview-button',
                    text: 'Preview'
                }),
                $('<button>', {
                    class: 'bp-button bp-button-submit',
                    type: 'submit',
                    id: 'bp-submit-button',
                    name: 'wpSave',
                    text: 'Create Blog Post'
                })
            );
        }

        createHiddenFields() {
            return $('<div>').append(
                $('<input>', { type: 'hidden', name: 'wpSection', value: '' }),
                $('<input>', {
                    type: 'hidden',
                    name: 'wpEditToken',
                    id: 'wpEditToken',
                    value: mw.user.tokens.get('csrfToken')
                })
                // The original code had a hidden 'alreadySubmitted' field,
                // but our new logic handles this check on the client-side, making it redundant.
            );
        }
        
        // --- Event Handlers ---

        setupEventHandlers() {
            // Arrow functions here mean we don't need .bind(this). 'this' is automatically correct!
            $('#bp-preview-button').on('click', (e) => this.handlePreview(e));
            $('#bp-create-form').on('submit', (e) => this.handleSubmit(e));
        }

        /**
         * Loads and renders the category tag cloud.
         */
        loadCategories() {
			const $tagCloud = $('#bp-tag-cloud');
			this.api.get({
				action: 'query',
				list: 'allcategories',
				aclimit: 50,
				acmin: 1,
				formatversion: 2
			}).then(data => {
				const categories = data.query.allcategories
					.filter(cat => !cat.category.startsWith('Articles by user'))
					.sort((a, b) => a.category.localeCompare(b.category));
				$tagCloud.empty();
				if (categories.length === 0) {
					$tagCloud.text('No categories available.');
					return;
				}
				for (const cat of categories) {
					const categoryName = cat.category;
					$('<span>', {
						class: 'bp-tag',
						'data-category': categoryName,
						text: categoryName
					}).on('click', () => this.addCategory(categoryName)).appendTo($tagCloud);
				}
			}).catch(error => {
				console.error('Failed to load categories:', error);
				$tagCloud.text('Failed to load categories.');
			});
		}

        /**
         * Adds a clicked category to the input field.
         * @param {string} category The category name to add.
         */
        addCategory(category) {
            const $input = $('#pageCtg');
            const currentValue = $input.val().trim();
            // Use a Set for easy duplicate checking
            const categories = new Set(currentValue ? currentValue.split(',').map(c => c.trim()) : []);

            if (!categories.has(category)) {
                categories.add(category);
                $input.val(Array.from(categories).join(', '));
            }
            
            // Visual feedback
            const $tag = $(`.bp-tag[data-category="${category}"]`).addClass('bp-tag-selected');
            setTimeout(() => $tag.removeClass('bp-tag-selected'), 1000);
        }

        /**
         * Handles the preview logic.
         * @param {Event} e The click event.
         */
        handlePreview(e) {
		    e.preventDefault();
		
		    const title = $('#title').val();
		    const content = $('#wpTextbox1').val();
		
		    if (!title || !content) {
		        mw.notify('Please enter both a title and content to preview.', { type: 'error' });
		        return;
		    }
		
		    let $previewArea = $('#bp-preview-area');
		    if ($previewArea.length === 0) {
		        $previewArea = $('<div>', {
		            id: 'bp-preview-area',
		            class: 'bp-preview-area'
		        }).insertBefore('#bp-create-form');
		    }
		    
		    $previewArea.show().html('<div class="bp-preview-loading">Loading preview...</div>');
		    
		    this.api.post({
		        action: 'parse',
		        title: `Blog:${title}`,
		        text: content,
		        prop: 'text',
		        formatversion: 2,
		        contentmodel: 'wikitext'
		    }).then(data => {
		        $previewArea.html(`
		            <div class="bp-preview-header">
		                <h2>Preview: ${$('<div>').text(title).html()}</h2>
		                <button class="bp-preview-close">×</button>
		            </div>
		            <div class="bp-preview-content">
		                ${data.parse.text}
		            </div>
		        `);
		
		        $('.bp-preview-close').on('click', () => $previewArea.hide());
		
		        $('html, body').animate({
		            scrollTop: $previewArea.offset().top - 20
		        }, 500);
		
		    }).catch(error => {
		        console.error('Error loading preview:', error);
		        $previewArea.html('<div class="bp-preview-error">Error loading preview</div>');
		    });
		}

        /**
         * Handles the form submission logic, including a client-side check for existing pages.
         * @param {Event} e The submit event.
         */
        handleSubmit(e) {
		    e.preventDefault();
		
		    const title = $('#title').val();
		    const content = $('#wpTextbox1').val();
		    const form = e.target;
		
		    if (!title || !content) {
		        mw.notify('Please enter both a title and content.', { type: 'error' });
		        return;
		    }
		    
		    $('<div>', { class: 'bp-loading-overlay' })
		        .html('<div class="bp-loading-spinner"></div><div class="bp-loading-text">Checking title...</div>')
		        .appendTo('body');
		        
		    this.api.get({
		        action: 'query',
		        titles: `Blog:${title}`,
		        formatversion: 2
		    }).then(data => { // 'try' block
		        if (!data.query.pages[0].missing) {
		            $('.bp-loading-overlay').remove();
		            mw.notify('A blog post with this title already exists. Please choose a different title.', {
		                type: 'error',
		                autoHide: false
		            });
		        } else {
		            $('.bp-loading-text').text('Creating blog post...');
		            form.submit();
		        }
		    }).catch(error => { // 'catch' block
		        $('.bp-loading-overlay').remove();
		        console.warn('Could not verify if title exists:', error);
		        if (confirm('Warning: Could not check if the title already exists. Submit anyway?')) {
		            form.submit();
		        }
		    });
		}
    }

    // Initialize the gadget
    new BlogPostCreator();
});