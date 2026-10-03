/*=======================================================================
brought from Wikia DEV wiki.
Original author: https://dev.fandom.com/wiki/User:TRJ-VoRoN
=======================================================================*/
((jQuery, mediaWiki) => {
    // Define variables to store dependencies
    const $ = jQuery || window.jQuery;
    const mw = mediaWiki || window.mediaWiki;
    
    // Create a global namespace for the slider as a class
    class SliderController {
        constructor() {
            'use strict';
            this.slideNow = 1;
            this.slideCount = 0;
            this.slideInterval = 0;
            this.translateWidth = 0;
            this.timerPause = false;
            this.ele = null;
            this.isVertical = false;
            this.initialized = false;
            this.sliderWidth = null;
            this.loadingComplete = false;
            this.timerId = null;
        }
        
        // Function to go to next slide
        nextSlide() {
            // Guard against invalid state
            if (!this.ele || !this.ele.sliderWrapper || this.slideCount <= 0) {
                return;
            }
            
            if (this.slideNow >= this.slideCount) {
                this.ele.sliderWrapper.css('transform', 'translate(0, 0)');
                this.slideNow = 1;
            } else {
                let prop, axis;
                
                if (this.isVertical) {
                    prop = 'height';
                    axis = '0, ';
                } else {
                    prop = 'width';
                    axis = '';
                }
                
                this.translateWidth = -this.ele.sliderView[prop]() * this.slideNow;
                
                const transform = `translate(${axis}${this.translateWidth}px)`;
                this.ele.sliderWrapper.css({
                    'transform': transform,
                    '-webkit-transform': transform,
                    '-ms-transform': transform,
                });
                
                this.slideNow++;
            }
            
            if (this.ele.navBtns && this.ele.navBtns.children().length > 0) {
                const nextBtn = this.ele.navBtns.children().eq(this.slideNow - 1);
                if (nextBtn.length > 0) {
                    this.selectSlide(nextBtn);
                }
            }
        }
        
        // Function to select a slide
        selectSlide(activeBtn) {
            // Guard against invalid state
            if (!this.ele || !this.ele.navBtn || !activeBtn || activeBtn.length === 0) {
                return;
            }
            
            $(window).trigger('scroll');
            
            // Remove all active classes
            this.ele.navBtn.removeClass('nbActiveLeft nbActiveRight nbActiveTop nbActiveBottom');
            
            // Add appropriate active class based on navigation position
            const navPosition = this.getNavigationPosition();
            activeBtn.addClass(`nbActive${navPosition}`);
        }
        
        // Get navigation position
        getNavigationPosition() {
            if (!this.ele || !this.ele.navBtns) return 'Left';
            
            if (this.ele.navBtns.hasClass('nmRight')) return 'Right';
            if (this.ele.navBtns.hasClass('nmTop')) return 'Top';
            if (this.ele.navBtns.hasClass('nmBottom')) return 'Bottom';
            return 'Left';
        }
        
        // Parse slider data from the DOM
        parseSliderData() {
            // Default settings
            let slides = 0;
            let heightSize = 'auto';
            let widthSize = '100%';
            let captionPosition = 'bottom';
            
            // Get SliderData content - try class attribute first, then text content
            let dataSource = '';
            if (this.ele.sliderData) {
                dataSource = (this.ele.sliderData.attr('class') || '').trim();
                
                // If class attribute doesn't contain valid data, try getting it from text content
                if (!dataSource) {
                    dataSource = this.ele.sliderData.text().trim() || '';
                }
            }
            
            const data = dataSource ? dataSource.split('|') : [];
            
            // Parse slider data configuration
            if (data.length >= 6) {
                // Format: SlideCount|Interval|Height|Orientation|Width|CaptionPosition
                slides = parseInt(data[0], 10);
                this.slideInterval = parseInt(data[1], 10);
                heightSize = data[2];
                this.isVertical = data[3].toLowerCase() === 'down';
                widthSize = data[4];
                captionPosition = data[5].toLowerCase();
            } else if (data.length >= 5) {
                // Format: SlideCount|Interval|Height|Orientation|Width
                slides = parseInt(data[0], 10);
                this.slideInterval = parseInt(data[1], 10);
                heightSize = data[2];
                this.isVertical = data[3].toLowerCase() === 'down';
                widthSize = data[4];
            } else if (data.length === 4) {
                // Format: SlideCount|Interval|Height|Orientation
                slides = parseInt(data[0], 10);
                this.slideInterval = parseInt(data[1], 10);
                heightSize = data[2];
                this.isVertical = data[3].toLowerCase() === 'down';
            } else if (data.length === 3) {
                // Format: SlideCount|Interval|Height
                slides = parseInt(data[0], 10);
                this.slideInterval = parseInt(data[1], 10);
                heightSize = data[2];
            }
            
            // Always ensure we have a valid slide count
            this.slideCount = !isNaN(slides) && slides > 0 ? slides : (this.ele.sld ? this.ele.sld.length : 0);
            
            // Set default interval if invalid
            if (this.slideInterval < 1000 || isNaN(this.slideInterval)) {
                this.slideInterval = 3000;
            }
            
            // Validate caption position
            const validPositions = ['top', 'bottom', 'overlay'];
            if (!validPositions.includes(captionPosition)) {
                captionPosition = 'bottom';
            }
            
            this.sliderWidth = widthSize;
            
            return {
                slides: this.slideCount,
                heightSize,
                widthSize,
                captionPosition: captionPosition.toLowerCase()
            };
        }
        
        // Add captions to slides based on data-desc attributes
        addCaptionsToSlides(captionPosition) {
            if (!this.ele || !this.ele.sld || this.ele.sld.length === 0) return;
            
            // Process each slide
            this.ele.sld.each((index, slideEl) => {
                const slide = $(slideEl);
                const caption = slide.attr('data-desc');
                
                // Skip if no caption provided
                if (!caption || caption.trim() === '') return;
                
                // Remove any existing caption
                slide.find('.slide-caption').remove();
                
                // Create caption element
                const captionElement = $('<div class="slide-caption"></div>').text(caption);
                
                // Base caption styles
                const baseStyles = {
                    'padding': '8px 12px',
                    'text-align': 'center',
                    'font-family': 'Arial, sans-serif',
                    'font-size': '14px',
                    'width': '100%',
                    'box-sizing': 'border-box',
                    'z-index': '100',
                    'position': 'relative'
                };
                
                // Position-specific styles
                if (captionPosition === 'overlay') {
                    captionElement.css(Object.assign({}, baseStyles, {
                        'position': 'absolute',
                        'bottom': '0',
                        'left': '0',
                        'background-color': 'rgba(0, 0, 0, 0.6)',
                        'color': 'white'
                    }));
                    
                    // Ensure slide has position relative for absolute positioning
                    if (slide.css('position') !== 'relative' && slide.css('position') !== 'absolute') {
                        slide.css('position', 'relative');
                    }
                } else if (captionPosition === 'top') {
                    captionElement.css(Object.assign({}, baseStyles, {
                        'background-color': '#f5f5f5',
                        'color': '#333',
                        'border-bottom': '1px solid #ddd'
                    }));
                    // Add to top
                    slide.prepend(captionElement);
                } else { // Default: bottom
                    captionElement.css(Object.assign({}, baseStyles, {
                        'background-color': '#f5f5f5',
                        'color': '#333',
                        'border-top': '1px solid #ddd'
                    }));
                    // Add to bottom
                    slide.append(captionElement);
                }
                
                // Add to slide if overlay (not yet added)
                if (captionPosition === 'overlay') {
                    slide.append(captionElement);
                }
            });
        }
        
        // Add links to slides based on data attributes
        addLinksToSlides() {
		    if (!this.ele || !this.ele.sld || this.ele.sld.length === 0) return;
		    
		    // Process each slide
		    this.ele.sld.each((index, slideEl) => {
		        const slide = $(slideEl);
		        
		        // Get link attributes
		        const slideLink = slide.attr('data-slider-link');
		        const slideWiki = slide.attr('data-slider-wiki'); // New attribute for wiki name
		        const slideWikiPlatform = slide.attr('data-slider-platform'); // New attribute for platform
		        const slideFandomWiki = slide.attr('data-slider-link-fandom-wiki'); // Keep for backward compatibility
		        const slideExternalLink = slide.attr('data-slider-link-external');
		        
		        // Skip if no link attributes provided
		        if ((!slideLink && !slideWiki && !slideFandomWiki && !slideExternalLink) || 
		            (slideLink === "" && slideWiki === "" && slideFandomWiki === "" && slideExternalLink === "")) {
		            return;
		        }
		        
		        // Determine the target URL based on the provided attributes
		        let targetUrl = '';
		        
		        if (slideExternalLink) {
		            // External link takes precedence
		            targetUrl = slideExternalLink;
		            // Add protocol if missing
		            if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
		                targetUrl = `https://${targetUrl}`;
		            }
		        } else if (slideLink) {
		            // Determine which wiki platform to use
		            if (slideWikiPlatform && slideWiki) {
		                // Use specified platform and wiki
		                if (slideWikiPlatform.toLowerCase() === 'miraheze') {
		                    targetUrl = `https://${slideWiki}.miraheze.org/wiki/${slideLink}`;
		                } else if (slideWikiPlatform.toLowerCase() === 'fandom') {
		                    targetUrl = `https://${slideWiki}.fandom.com/wiki/${slideLink}`;
		                } else {
		                    // For other platforms, use external link format
		                    targetUrl = `https://${slideWiki}/wiki/${slideLink}`;
		                }
		            } else if (slideWiki) {
		                // If only wiki is specified, default to Miraheze
		                targetUrl = `https://${slideWiki}.miraheze.org/wiki/${slideLink}`;
		            } else if (slideFandomWiki) {
		                // For backward compatibility
		                targetUrl = `https://${slideFandomWiki}.fandom.com/wiki/${slideLink}`;
		            } else {
		                // Default to utaite.miraheze.org as the priority
		                targetUrl = `https://utaite.miraheze.org/wiki/${slideLink}`;
		            }
		        } else if (slideWiki) {
		            // Just the wiki with no specific page
		            if (slideWikiPlatform && slideWikiPlatform.toLowerCase() === 'fandom') {
		                targetUrl = `https://${slideWiki}.fandom.com`;
		            } else {
		                // Default to miraheze
		                targetUrl = `https://${slideWiki}.miraheze.org`;
		            }
		        } else if (slideFandomWiki) {
		            // Just the Fandom wiki with no specific page (backward compatibility)
		            targetUrl = `https://${slideFandomWiki}.fandom.com`;
		        }
		        
		        // If a target URL was determined, make the slide clickable
		        if (targetUrl) {
		            // Add cursor style to indicate clickable
		            slide.css('cursor', 'pointer');
		            
		            // Make the entire slide clickable using event delegation
		            slide.on('click', e => {
		                // Don't trigger if clicking on navigation buttons
		                if ($(e.target).closest('.NavBtn, #NavBtns').length === 0) {
		                    window.location.href = targetUrl;
		                }
		            });
		        }
		    });
		}
        
        // Center images without stretching
        centerImagesWithoutStretching(containerHeight, captionPosition) {
            if (!this.ele || !this.ele.sld || this.ele.sld.length === 0) return;
            
            // Process each slide
            this.ele.sld.each((index, slideEl) => {
                const slide = $(slideEl);
                const img = slide.find('img').first();
                
                if (img.length === 0) return;
                
                // Calculate available height for image (accounting for caption if present)
                let captionHeight = 0;
                const caption = slide.find('.slide-caption');
                if (caption.length > 0 && (captionPosition === 'top' || captionPosition === 'bottom')) {
                    captionHeight = caption.outerHeight(true);
                }
                
                const availableHeight = containerHeight - captionHeight;
                
                // Set container styling
                slide.css({
                    'height': `${containerHeight}px`,
                    'overflow': 'hidden',
                    'position': 'relative',
                    'text-align': 'center',
                    'display': 'block'
                });
                
                // Create or get image container
                let imageContainer = slide.find('.image-container');
                if (imageContainer.length === 0) {
                    imageContainer = $('<div class="image-container"></div>');
                    
                    // Insert container at appropriate position
                    if (captionPosition === 'bottom' && caption.length > 0) {
                        caption.before(imageContainer);
                    } else if (captionPosition === 'top' && caption.length > 0) {
                        caption.after(imageContainer);
                    } else {
                        slide.append(imageContainer);
                    }
                }
                
                // Style the image container for centering
                imageContainer.css({
                    'height': `${availableHeight}px`,
                    'display': 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    'overflow': 'hidden'
                });
                
                // Move the image into the container if it's not already there
                if (!img.parent().hasClass('image-container')) {
                    imageContainer.append(img);
                }
                
                // Function to center image without stretching
                const centerImage = () => {
                    const imgNaturalWidth = img.prop('naturalWidth');
                    const imgNaturalHeight = img.prop('naturalHeight');
                    
                    // Skip if natural dimensions aren't available yet
                    if (!imgNaturalWidth || !imgNaturalHeight) return;
                    
                    const containerWidth = slide.width();
                    const aspectRatio = imgNaturalWidth / imgNaturalHeight;
                    
                    // Calculate dimensions to maintain aspect ratio without stretching
                    let imgWidth, imgHeight;
                    
                    if (imgNaturalHeight <= availableHeight) {
                        // If original image is smaller than available height, display at original size
                        imgHeight = imgNaturalHeight;
                        imgWidth = imgNaturalWidth;
                    } else {
                        // Fit image to available height while maintaining aspect ratio
                        imgHeight = availableHeight;
                        imgWidth = availableHeight * aspectRatio;
                    }
                    
                    // Limit width if needed
                    if (imgWidth > containerWidth) {
                        imgWidth = containerWidth;
                        imgHeight = containerWidth / aspectRatio;
                    }
                    
                    // Apply calculated dimensions
                    img.css({
                        'height': `${imgHeight}px`,
                        'width': `${imgWidth}px`,
                        'max-height': `${availableHeight}px`,
                        'max-width': `${containerWidth}px`,
                        'object-fit': 'contain'
                    });
                };
                
                // Try to center immediately and on load
                centerImage();
                img.on('load', centerImage);
            });
        }
        
        // Set slider dimensions based on configuration
        setSliderDimensions(widthSize, heightSize, captionPosition) {
            if (!this.ele || !this.ele.sliderView || !this.ele.sld || this.ele.sld.length === 0) return;
            
            // Apply width to slider container
            if (widthSize && widthSize !== '100%') {
                // Check if widthSize is a pixel value or percentage
                const isPixelWidth = /^\d+(?:px)?$/.test(widthSize);
                const isPercentWidth = /^\d+%$/.test(widthSize);
                
                if (isPixelWidth) {
                    // Convert to number if it's a pixel value with 'px'
                    const numericWidth = parseInt(widthSize.replace('px', ''), 10);
                    this.ele.sliderView.css('width', `${numericWidth}px`);
                } else if (isPercentWidth) {
                    this.ele.sliderView.css('width', widthSize);
                } else {
                    // Try to parse as a number
                    const parsedWidth = parseInt(widthSize, 10);
                    if (!isNaN(parsedWidth)) {
                        this.ele.sliderView.css('width', `${parsedWidth}px`);
                    } else {
                        // Default to 100% if invalid width
                        this.ele.sliderView.css('width', '100%');
                    }
                }
            } else {
                // Default to 100% width
                this.ele.sliderView.css('width', '100%');
            }
            
            // Add captions to slides
            this.addCaptionsToSlides(captionPosition);
            
            // Get the first image to determine height
            const firstSlide = this.ele.sld.first();
            const firstImg = firstSlide.find('img').first();
            
            if (firstImg.length === 0) return;
            
            // Calculate extra height needed for captions
            const calculateExtraHeight = () => {
                let extraHeight = 0;
                const firstCaption = firstSlide.find('.slide-caption');
                
                if (firstCaption.length > 0 && (captionPosition === 'top' || captionPosition === 'bottom')) {
                    extraHeight = firstCaption.outerHeight(true);
                }
                
                return extraHeight;
            };
            
            // If a fixed height is specified and not "auto", use it
            if (heightSize && heightSize !== 'auto' && /^\d+(?:px)?$/.test(heightSize)) {
                const parsedHeight = parseInt(heightSize.replace('px', ''), 10);
                
                // Adjust for caption if needed
                const extraHeight = calculateExtraHeight();
                const totalHeight = parsedHeight + extraHeight;
                
                this.ele.sliderView.css('height', `${totalHeight}px`);
                this.centerImagesWithoutStretching(totalHeight, captionPosition);
            } else {
                // Auto height based on first image
                const getFirstImageHeight = () => {
                    const imgNaturalHeight = firstImg.prop('naturalHeight');
                    
                    if (imgNaturalHeight) {
                        // Calculate extra height for caption
                        const extraHeight = calculateExtraHeight();
                        const totalHeight = imgNaturalHeight + extraHeight;
                        
                        this.ele.sliderView.css('height', `${totalHeight}px`);
                        this.centerImagesWithoutStretching(totalHeight, captionPosition);
                        return totalHeight;
                    } else {
                        // Default height if image hasn't loaded yet
                        const defaultHeight = 400;
                        const extraHeight = calculateExtraHeight();
                        const totalHeight = defaultHeight + extraHeight;
                        
                        this.ele.sliderView.css('height', `${totalHeight}px`);
                        return totalHeight;
                    }
                };
                
                // Initial setup
                getFirstImageHeight();
                
                // Update when image loads
                firstImg.on('load', () => {
                    const loadedHeight = firstImg.prop('naturalHeight');
                    if (loadedHeight) {
                        const extraHeight = calculateExtraHeight();
                        const totalHeight = loadedHeight + extraHeight;
                        
                        this.ele.sliderView.css('height', `${totalHeight}px`);
                        this.centerImagesWithoutStretching(totalHeight, captionPosition);
                    }
                });
            }
        }
        
        // Show loading spinner
        showLoadingSpinner() {
            if (!this.ele || !this.ele.sliderView) return;
            
            // Create loading spinner container
            const $spinnerContainer = $('<div class="slider-loading-container"></div>');
            $spinnerContainer.css({
                'position': 'absolute',
                'top': '0',
                'left': '0',
                'width': '100%',
                'height': '100%',
                'background-color': 'rgba(255, 255, 255, 0.7)',
                'display': 'flex',
                'justify-content': 'center',
                'align-items': 'center',
                'z-index': '1000'
            });
            
            // Create FontAwesome spinner icon
            const $spinner = $('<i class="fa-solid fa-spinner fa-spin"></i>');
            $spinner.css({
                'font-size': '3em',
                'color': '#333'
            });
            
            // Append spinner to container
            $spinnerContainer.append($spinner);
            
            // Add loading class to slider view for CSS targeting
            this.ele.sliderView.addClass('slider-loading');
            
            // Hide the slider content while loading
            if (this.ele.sliderWrapper) this.ele.sliderWrapper.css('opacity', '0');
            if (this.ele.navBtns) this.ele.navBtns.css('opacity', '0');
            
            // Prepend spinner to slider view
            this.ele.sliderView.prepend($spinnerContainer);
            
            // Store reference to spinner
            this.ele.spinnerContainer = $spinnerContainer;
        }
        
        // Hide loading spinner and show slider
        hideLoadingSpinner() {
            if (!this.ele || !this.ele.spinnerContainer) return;
            
            // Remove loading class
            this.ele.sliderView.removeClass('slider-loading');
            
            // Fade in slider content
            if (this.ele.sliderWrapper) this.ele.sliderWrapper.animate({ opacity: 1 }, 300);
            if (this.ele.navBtns) this.ele.navBtns.animate({ opacity: 1 }, 300);
            
            // Fade out and remove spinner
            this.ele.spinnerContainer.fadeOut(300, function() {
                $(this).remove();
            });
            
            this.loadingComplete = true;
        }
        
        // Check if all images are loaded
        checkImagesLoaded() {
            if (!this.ele || !this.ele.sld) return;
            
            const images = this.ele.sld.find('img');
            const totalImages = images.length;
            
            if (totalImages === 0) {
                // No images to load, hide spinner immediately
                this.hideLoadingSpinner();
                return;
            }
            
            let loadedImages = 0;
            const allImagesLoaded = () => {
                loadedImages++;
                if (loadedImages >= totalImages) {
                    // All images are loaded, hide spinner
                    this.hideLoadingSpinner();
                }
            };
            
            // Check each image
            images.each((i, img) => {
                const $img = $(img);
                
                if ($img.prop('complete')) {
                    // Image already loaded
                    allImagesLoaded();
                } else {
                    // Wait for image to load or error
                    $img.on('load', allImagesLoaded);
                    $img.on('error', allImagesLoaded);
                }
            });
            
            // Fallback: Hide spinner after timeout
            setTimeout(() => {
                if (!this.loadingComplete) {
                    this.hideLoadingSpinner();
                }
            }, 5000);
        }
        
        // Set up slider controls
        setupControls() {
            if (!this.ele) return;
            
            // Set up mouse events to pause the timer
            if (this.ele.sliderView) {
                this.ele.sliderView
                    .on('mouseenter', () => { this.timerPause = true; })
                    .on('mouseleave', () => { this.timerPause = false; });
            }
            
            // Set up click events for navigation buttons
            if (this.ele.navBtn) {
                this.ele.navBtn.on('click', e => {
                    const navBtn = $(e.currentTarget);
                    const navBtnId = navBtn.index();
                    this.slideNow = navBtnId + 1;
                    
                    let prop, css;
                    
                    if (this.isVertical) {
                        prop = 'height';
                        css = '0, ';
                    } else {
                        prop = 'width';
                        css = '';
                    }
                    
                    this.translateWidth = -this.ele.sliderView[prop]() * navBtnId;
                    
                    const transform = `translate(${css}${this.translateWidth}px)`;
                    this.ele.sliderWrapper.css({
                        'transform': transform,
                        '-webkit-transform': transform,
                        '-ms-transform': transform
                    });
                    
                    this.selectSlide(navBtn);
                });
            }
        }
        
        // Adjust navigation button positioning
        adjustNavButtons() {
            if (!this.ele || !this.ele.navBtns || !this.ele.navBtn || this.ele.navBtn.length === 0) return;
            
            const btnCount = this.ele.navBtn.length;
            
            // Handle bottom navigation
            if (this.ele.navBtns.hasClass('nmBottom')) {
                // Get the height of the navigation area
                const navHeight = this.ele.navBtns.outerHeight(true);
                
                // Add padding to the slider view for navigation buttons
                this.ele.sliderView.css({
                    'padding-bottom': `${navHeight + 10}px` // Add extra 10px for spacing
                });
                
                // Ensure navigation buttons are positioned properly
                this.ele.navBtns.css({
                    'position': 'absolute',
                    'bottom': '0',
                    'left': '0',
                    'width': '100%',
                    'z-index': '100'
                });
            }
            
            // Get navigation position
            let navPosition = null;
            let sliderSize = 0;
            let btnSize = 0;
            let transform = '';
            
            if (this.ele.navBtns.hasClass('nmLeft')) {
                navPosition = 'Left';
                sliderSize = this.ele.navBtns.outerHeight(true);
                btnSize = this.ele.navBtnsLi.outerHeight(true);
                transform = offset => `translateY(${offset}px)`;
            } else if (this.ele.navBtns.hasClass('nmRight')) {
                navPosition = 'Right';
                sliderSize = this.ele.navBtns.outerHeight(true);
                btnSize = this.ele.navBtnsLi.outerHeight(true);
                transform = offset => `translateY(${offset}px)`;
            } else if (this.ele.navBtns.hasClass('nmTop')) {
                navPosition = 'Top';
                sliderSize = this.ele.navBtns.outerWidth(true);
                btnSize = this.ele.navBtnsLi.outerWidth(true);
                transform = offset => `translateX(${offset}px)`;
            } else if (this.ele.navBtns.hasClass('nmBottom')) {
                navPosition = 'Bottom';
                sliderSize = this.ele.navBtns.outerWidth(true);
                btnSize = this.ele.navBtnsLi.outerWidth(true);
                transform = offset => `translateX(${offset}px)`;
            }
            
            if (!navPosition) return;
            
            let offset = 0;
            
            if (this.ele.navBtns.hasClass('nmP2')) {
                offset = (sliderSize - btnSize * btnCount) / 2;
            } else if (this.ele.navBtns.hasClass('nmP3')) {
                offset = (sliderSize - btnSize * btnCount);
            }
            
            if (offset !== 0) {
                this.ele.navBtnsLi.css('transform', transform(offset));
            }
        }
        
        // Start slider autoplay
        startSlideShowTimer() {
            // Clear any existing timer
            if (this.timerId) {
                clearTimeout(this.timerId);
            }
            
            // Set up recurring timer using arrow function to preserve 'this'
            const startTimer = () => {
                this.timerId = setTimeout(() => {
                    if (!this.timerPause) {
                        this.nextSlide();
                    }
                    startTimer(); // Re-call the timer setup function
                }, this.slideInterval);
            };
            
            startTimer();
        }
        
        // Initialize the slider
        init($content) {
            // Reset instance properties
            this.slideNow = 1;
            this.slideCount = 0;
            this.slideInterval = 0;
            this.translateWidth = 0;
            this.timerPause = false;
            this.isVertical = false;
            this.loadingComplete = false;
            
            // Skip if already initialized to prevent duplicate timers
            if (this.initialized) return;
            
            // Collect elements
            this.ele = {
                sld: $content.find('.Sld'),
                sliderData: $content.find('#SliderData'),
                navBtn: $content.find('.NavBtn'),
                navBtns: $content.find('#NavBtns'),
                navBtnsLi: $content.find('#NavBtns li'),
                sliderView: $content.find('#SliderView'),
                sliderWrapper: $content.find('#SliderWrapper')
            };
            
            // Verify we have the necessary elements before continuing
            if (!this.ele.sliderView.length || !this.ele.sliderWrapper.length || !this.ele.sld.length) {
                return;
            }
            
            // Add position relative to slider view for loading spinner positioning
            this.ele.sliderView.css('position', 'relative');
            
            // Show loading spinner
            this.showLoadingSpinner();
            
            // Parse slider configuration data
            const sliderConfig = this.parseSliderData();
            
            // Remove excess slides and buttons
            this.ele.sld.each((index, el) => {
                if (index + 1 > this.slideCount) {
                    $(el).remove();
                }
            });
            
            this.ele.navBtn.each((index, el) => {
                if (index + 1 > this.slideCount) {
                    $(el).remove();
                }
            });
            
            // Ensure there's at least one slide
            if (this.slideCount <= 0) {
                this.hideLoadingSpinner();
                return;
            }
            
            // Set CSS for vertical or horizontal slider
            if (this.isVertical) {
                this.ele.sliderWrapper.css({
                    'height': `${100 * this.slideCount}%`,
                    'width': '100%'
                });
                
                this.ele.sld.css({
                    'height': `${100 / this.slideCount}%`,
                    'width': '100%'
                });
                
                this.ele.navBtns.css({
                    'position': 'absolute',
                    'right': '10px',
                    'top': '50%',
                    'transform': 'translateY(-50%)',
                    'list-style': 'none',
                    'margin': '0',
                    'padding': '0',
                    'z-index': '10'
                });
                
                this.ele.navBtnsLi.css({
                    'margin': '5px 0'
                });
            } else {
                this.ele.sliderWrapper.css('width', `${100 * this.slideCount}%`);
                this.ele.sld.css('width', `${100 / this.slideCount}%`);
            }
            
            // Set slider dimensions and add captions
            this.setSliderDimensions(
                sliderConfig.widthSize, 
                sliderConfig.heightSize, 
                sliderConfig.captionPosition
            );
            
            // Add links to slides
            this.addLinksToSlides();
            
            // Adjust navigation buttons
            this.adjustNavButtons();
            
            // Set up slider controls
            this.setupControls();
            
            // Set initial active button
            if (this.ele.navBtn.length > 0) {
                this.selectSlide(this.ele.navBtn.first());
            }
            
            // Check if all images are loaded
            this.checkImagesLoaded();
            
            // Mark as initialized to prevent duplicate initializations
            this.initialized = true;
            
            // Start timer when loading is complete or after a delay
            if (this.loadingComplete) {
                this.startSlideShowTimer();
            } else {
                // Set up an event to start timer when loading completes
                $(document).on('sliderLoadingComplete', () => {
                    this.startSlideShowTimer();
                });
                
                // Fallback: Start timer after timeout
                setTimeout(() => {
                    if (!this.timerId) {
                        this.startSlideShowTimer();
                    }
                }, 5000);
            }
        }
    }
    
    // Create a singleton instance of the slider controller
    window.SliderControl = new SliderController();
    
    // Helper function to add CSS to document head
    const addGlobalStyle = (css) => {
        const head = document.getElementsByTagName('head')[0];
        if (!head) return;
        
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        head.appendChild(style);
    };
    
    // Add CSS for loading spinner and transitions
    addGlobalStyle(`
        .slider-loading #SliderWrapper, 
        .slider-loading #NavBtns { 
            visibility: hidden; 
        }
        
        #SliderWrapper {
            transition: transform 0.4s ease-in-out;
        }
        
        .NavBtn {
            transition: background-color 0.3s ease;
            cursor: pointer;
        }
        
        .slide-caption {
            transition: opacity 0.3s ease;
        }
        
        .image-container img {
            transition: all 0.3s ease-in-out;
        }
    `);
    
    // Define initialization function with error handling
    const initSlider = ($content) => {
	    // Check if we're on the Utaite Wiki page
	    const isUtaiteWikiPage = () => {
	        const currentPath = window.location.pathname;
	        // Check for "/wiki/Utaite_Wiki" or "/wiki/Utaite%20Wiki"
	        return currentPath.includes('/Utaite_Wiki') || 
	               currentPath.includes('/Utaite%20Wiki')||
	               currentPath.includes('slider');
	    };
	    
	    // Only initialize if we're on the Utaite Wiki page
	    if (!isUtaiteWikiPage()) {
	        console.log('Not on Utaite Wiki page, skipping slider initialization');
	        return;
	    }
	    
	    // Add a small delay to ensure DOM is fully parsed
	    setTimeout(() => {
	        try {
	            window.SliderControl.init($content);
	            console.log('SliderControl initialized on Utaite Wiki page');
	        } catch (error) {
	            console.error('Error initializing SliderControl:', error);
	        }
	    }, 100);
	};
    
    // Initialize on document ready
    $(document).ready(() => {
        initSlider($(document));
    });
    
    // Initialize on window load for images
    $(window).on('load', () => {
        initSlider($(document));
    });
    
    // Keep MediaWiki hook for compatibility
    if (mw && typeof mw.hook === 'function') {
        mw.hook('wikipage.content').add(($content) => {
            initSlider($content);
        });
    }
})(window.jQuery, window.mediaWiki);