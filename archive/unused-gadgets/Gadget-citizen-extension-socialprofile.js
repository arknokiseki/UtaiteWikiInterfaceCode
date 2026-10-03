(function() {
    'use strict';
    
    // Check page — only allow on Special:UpdateProfile, /personal, /custom
	var pageName = mw.config.get('wgPageName') || '';
	var allowed = [
		'Special:UpdateProfile',
		'Special:UpdateProfile/personal',
		'Special:UpdateProfile/custom'
	];
	
    if (!allowed.includes(pageName)) {
		return;
	}
		
    // Only run on Citizen skin
    if (!document.body.classList.contains('skin-citizen')) {
        return;
    }
    
    // Wait for DOM to be ready
    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }
    
    // Privacy options configuration
    var privacyOptions = [
        { value: 'public', label: 'public', icon: '👁️' },
        { value: 'hidden', label: 'hidden', icon: '🚫' },
        { value: 'friends', label: 'friends', icon: '👥' },
        { value: 'foaf', label: 'friends of friends', icon: '👥👥' }
    ];
    
    // Create CSS styles
    function injectStyles() {
	    var style = document.createElement('style');
	    style.textContent = [
	        '.privacy-dropdown-wrapper {',
	        '  position: relative;',
	        '  display: inline-block;',
	        '  margin-left: 10px;',
	        '  vertical-align: middle;',
	        '  font-family: inherit;',
	        '  z-index: 1100;',
	        '}',
	        '',
	        '.privacy-dropdown-wrapper.is-open {',
	        '  z-index: 9999;',
	        '}',
	        '',
	        '.privacy-dropdown-trigger {',
	        '  background: var(--sp-card, var(--surface-bg, #fff));',
	        '  border: 1px solid var(--sp-border, var(--theme-border-color, #e2e8f0));',
	        '  border-radius: calc(var(--sp-radius, 8px) * 0.9);',
	        '  padding: 6px 10px;',
	        '  cursor: pointer;',
	        '  display: inline-flex;',
	        '  align-items: center;',
	        '  gap: 8px;',
	        '  font-size: 12px;',
	        '  font-weight: 600;',
	        '  color: var(--sp-contrast, var(--primary-text-color, #111));',
	        '  transition: box-shadow var(--sp-transition, 180ms), transform var(--sp-transition, 180ms), border-color var(--sp-transition, 180ms);',
	        '  min-width: 108px;',
	        '  user-select: none;',
	        '  box-shadow: 0 4px 10px rgba(0,0,0,0.04);',
	        '}',
	        '',
	        '.privacy-dropdown-trigger:hover,',
	        '.privacy-dropdown-trigger:focus {',
	        '  border-color: var(--sp-accent, var(--theme-accent-color, #3b82f6));',
	        '  box-shadow: 0 6px 18px rgba(11,99,214,0.06);',
	        '}',
	        '',
	        '.privacy-dropdown-trigger.active {',
	        '  border-color: var(--sp-accent, #3b82f6);',
	        '  box-shadow: 0 8px 22px rgba(11,99,214,0.10);',
	        '  transform: translateY(-1px);',
	        '}',
	        '',
	        '.privacy-dropdown-icon {',
	        '  font-size: 13px;',
	        '  line-height: 1;',
	        '  opacity: 0.95;',
	        '}',
	        '',
	        '.privacy-dropdown-label {',
	        '  white-space: nowrap;',
	        '  overflow: hidden;',
	        '  text-overflow: ellipsis;',
	        '  max-width: 86px;',
	        '  display: inline-block;',
	        '  vertical-align: middle;',
	        '}',
	        '',
	        '.privacy-dropdown-arrow {',
	        '  margin-left: auto;',
	        '  transition: transform var(--sp-transition, 180ms) ease;',
	        '  font-size: 11px;',
	        '  opacity: 0.85;',
	        '}',
	        '',
	        '.privacy-dropdown-trigger.active .privacy-dropdown-arrow {',
	        '  transform: rotate(180deg);',
	        '}',
	        '',
	        '.privacy-dropdown-menu {',
	        '  position: absolute;',
	        '  top: calc(100% + 8px);',
	        '  left: 0;',
	        '  min-width: 180px;',
	        '  max-width: 260px;',
	        '  background: var(--sp-card, var(--surface-bg, #fff));',
	        '  border: 1px solid var(--sp-border, var(--theme-border-color, #e2e8f0));',
	        '  border-radius: calc(var(--sp-radius, 8px) * 0.9);',
	        '  box-shadow: 0 12px 30px rgba(0,0,0,0.12);',
	        '  z-index: 10000;',
	        '  opacity: 0;',
	        '  visibility: hidden;',
	        '  transform: translateY(-6px) scale(0.995);',
	        '  transform-origin: top left;',
	        '  transition: opacity var(--sp-transition, 180ms) ease, transform var(--sp-transition, 180ms) ease, visibility var(--sp-transition, 180ms);',
	        '  overflow: hidden;',
	        '  padding: 6px 6px;',
	        '}',
	        '',
	        '.privacy-dropdown-menu.show {',
	        '  opacity: 1;',
	        '  visibility: visible;',
	        '  transform: translateY(0) scale(1);',
	        '}',
	        '',
	        '.privacy-dropdown-item {',
	        '  padding: 8px 10px;',
	        '  cursor: pointer;',
	        '  display: flex;',
	        '  align-items: center;',
	        '  gap: 8px;',
	        '  font-size: 13px;',
	        '  color: var(--sp-contrast, var(--primary-text-color, #111));',
	        '  background: var(--sp-card, var(--surface-bg, #fff));',
	        '  border-radius: 6px;',
	        '  transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;',
	        '  opacity: 0.7;',
	        '}',
	        '',
	        '.privacy-dropdown-item:hover,',
	        '.privacy-dropdown-item:focus {',
	        '  background-color: color-mix(in srgb, var(--sp-accent, #7aa2ff) 8%, transparent);',
	        '  outline: none;',
	        '  opacity: 1;',
	        '}',
	        '',
	        '.privacy-dropdown-item.selected {',
	        '  background-color: color-mix(in srgb, var(--sp-accent, #7aa2ff) 14%, transparent);',
	        '  color: var(--sp-accent, #7aa2ff);',
	        '  font-weight: 700;',
	        '  opacity: 1;',
	        '}',
	        '',
	        '.privacy-dropdown-item .privacy-dropdown-icon {',
	        '  font-size: 12px;',
	        '  opacity: 1;',
	        '  width: 18px;',
	        '  text-align: center;',
	        '}',
	        '',
	        '.privacy-dropdown-trigger:focus {',
	        '  outline: 3px solid rgba(122,162,255,0.14);',
	        '  outline-offset: 2px;',
	        '}',
	        '.privacy-dropdown-item:focus {',
	        '  outline: 2px solid rgba(122,162,255,0.12);',
	        '  outline-offset: 2px;',
	        '  border-radius: 6px;',
	        '}',
	        '',
	        '@media (max-width: 520px) {',
	        '  .privacy-dropdown-wrapper { margin-left: 6px; }',
	        '  .privacy-dropdown-trigger { padding: 8px 10px; min-width: 90px; font-size: 13px; }',
	        '  .privacy-dropdown-label { max-width: 72px; }',
	        '  .privacy-dropdown-menu { left: auto; right: 0; min-width: 160px; }',
	        '}',
	        '',
	        '.privacy-dropdown-trigger, .privacy-dropdown-menu, .privacy-dropdown-item {',
	        '  -webkit-font-smoothing: antialiased;',
	        '  -moz-osx-font-smoothing: grayscale;',
	        '}'
	    ].join('\n');
	    document.head.appendChild(style);
	}
    
    // Create privacy dropdown element
    function createPrivacyDropdown(fieldKey, currentValue) {
        var wrapper = document.createElement('div');
        wrapper.className = 'privacy-dropdown-wrapper';
        wrapper.setAttribute('data-field-key', fieldKey);
        
        // Find current option
        var currentOption = privacyOptions.find(function(opt) {
            return opt.value === currentValue;
        }) || privacyOptions[0];
        
        // Create trigger
        var trigger = document.createElement('div');
        trigger.className = 'privacy-dropdown-trigger';
        trigger.setAttribute('tabindex', '0');
        trigger.innerHTML = [
            '<span class="privacy-dropdown-icon" aria-hidden="true">' + currentOption.icon + '</span>',
            '<span class="privacy-dropdown-label">' + currentOption.label + '</span>',
            '<span class="privacy-dropdown-arrow" aria-hidden="true">▾</span>'
        ].join('');
        
        // Create menu
        var menu = document.createElement('div');
        menu.className = 'privacy-dropdown-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-hidden', 'true');
        
        privacyOptions.forEach(function(option) {
            var item = document.createElement('div');
            item.className = 'privacy-dropdown-item';
            if (option.value === currentValue) {
                item.classList.add('selected');
            }
            item.setAttribute('data-value', option.value);
            item.setAttribute('role', 'menuitem');
            item.setAttribute('tabindex', '-1');
            item.innerHTML = [
                '<span class="privacy-dropdown-icon" aria-hidden="true">' + option.icon + '</span>',
                '<span class="privacy-dropdown-label-text">' + option.label + '</span>'
            ].join('');
            menu.appendChild(item);
        });
        
        wrapper.appendChild(trigger);
        wrapper.appendChild(menu);
        
        return wrapper;
    }
    
    // Handle dropdown interactions
    function setupDropdownBehavior(dropdown) {
        var trigger = dropdown.querySelector('.privacy-dropdown-trigger');
        var menu = dropdown.querySelector('.privacy-dropdown-menu');
        var fieldKey = dropdown.getAttribute('data-field-key');
        
        // Toggle dropdown (click)
        trigger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Close other dropdowns
            document.querySelectorAll('.privacy-dropdown-wrapper.is-open').forEach(function(otherWrapper) {
                if (otherWrapper !== dropdown) {
                    otherWrapper.classList.remove('is-open');
                    var otherTrigger = otherWrapper.querySelector('.privacy-dropdown-trigger');
                    var otherMenu = otherWrapper.querySelector('.privacy-dropdown-menu');
                    if (otherTrigger) {
                        otherTrigger.classList.remove('active');
                    }
                    if (otherMenu) {
                        otherMenu.classList.remove('show');
                        otherMenu.setAttribute('aria-hidden', 'true');
                    }
                }
            });
            
            // Toggle current dropdown
            var opening = !trigger.classList.contains('active');
            trigger.classList.toggle('active', opening);
            menu.classList.toggle('show', opening);
            menu.setAttribute('aria-hidden', opening ? 'false' : 'true');
            dropdown.classList.toggle('is-open', opening);
            
            // focus first selected or first item when opening
            if (opening) {
                var selected = menu.querySelector('.privacy-dropdown-item.selected');
                var focusTarget = selected || menu.querySelector('.privacy-dropdown-item');
                if (focusTarget) focusTarget.focus();
            } else {
                trigger.focus();
            }
        });
        
        // Keyboard interactions for trigger
        trigger.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                trigger.click();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!trigger.classList.contains('active')) {
                    trigger.click();
                } else {
                    var first = menu.querySelector('.privacy-dropdown-item');
                    if (first) first.focus();
                }
            }
        });
        
        // Handle option selection
        menu.addEventListener('click', function(e) {
            var item = e.target.closest('.privacy-dropdown-item');
            if (!item) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            var value = item.getAttribute('data-value');
            updatePrivacySetting(fieldKey, value, dropdown);
        });
        
        // Keyboard navigation inside menu
        menu.addEventListener('keydown', function(e) {
            var focused = document.activeElement;
            if (!focused || !focused.classList.contains('privacy-dropdown-item')) return;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                var next = focused.nextElementSibling;
                if (next) next.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                var prev = focused.previousElementSibling;
                if (prev) prev.focus();
                else trigger.focus();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                trigger.classList.remove('active');
                menu.classList.remove('show');
                menu.setAttribute('aria-hidden', 'true');
                dropdown.classList.remove('is-open');
                trigger.focus();
            } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                focused.click();
            }
        });
    }
    
    // Update privacy setting via API
    function updatePrivacySetting(fieldKey, privacy, dropdown) {
        // Get CSRF token from existing form
        var tokenInput = document.querySelector('input[name="wpEditToken"]');
        var token = tokenInput ? tokenInput.value : '';
        
        if (!token) {
            console.error('No CSRF token found');
            return;
        }
        
        // Make API request
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/w/api.php', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var response = JSON.parse(xhr.responseText);
                        if (response.smpuserprivacy) {
                            // Update dropdown UI
                            updateDropdownUI(dropdown, privacy);
                            console.log('Privacy setting updated successfully');
                        } else {
                            console.error('API returned unexpected payload', response);
                        }
                    } catch (e) {
                        console.error('Error parsing response:', e, xhr.responseText);
                    }
                } else {
                    console.error('API request failed:', xhr.status, xhr.responseText);
                }
            }
        };
        
        var params = [
            'action=smpuserprivacy',
            'format=json',
            'method=set',
            'field_key=' + encodeURIComponent(fieldKey),
            'privacy=' + encodeURIComponent(privacy),
            'token=' + encodeURIComponent(token)
        ].join('&');
        
        xhr.send(params);
    }
    
    // Update dropdown UI after successful API call
    function updateDropdownUI(dropdown, newValue) {
        var trigger = dropdown.querySelector('.privacy-dropdown-trigger');
        var menu = dropdown.querySelector('.privacy-dropdown-menu');
        
        // Find new option
        var newOption = privacyOptions.find(function(opt) {
            return opt.value === newValue;
        });
        
        if (newOption) {
            // Update trigger
            var iconEl = trigger.querySelector('.privacy-dropdown-icon');
            var labelEl = trigger.querySelector('.privacy-dropdown-label');
            if (iconEl) iconEl.textContent = newOption.icon;
            if (labelEl) labelEl.textContent = newOption.label;
            
            // Update menu selection
            menu.querySelectorAll('.privacy-dropdown-item').forEach(function(item) {
                item.classList.remove('selected');
                if (item.getAttribute('data-value') === newValue) {
                    item.classList.add('selected');
                }
            });
        }
        
        // Close dropdown
        trigger.classList.remove('active');
        menu.classList.remove('show');
        menu.setAttribute('aria-hidden', 'true');
        dropdown.classList.remove('is-open');
        trigger.focus();
    }
    
    // Close dropdowns when clicking outside
    function setupGlobalClickHandler() {
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.privacy-dropdown-wrapper')) {
                document.querySelectorAll('.privacy-dropdown-wrapper.is-open').forEach(function(wrapper) {
                    wrapper.classList.remove('is-open');
                    var trigger = wrapper.querySelector('.privacy-dropdown-trigger');
                    var menu = wrapper.querySelector('.privacy-dropdown-menu');
                    if (trigger) {
                        trigger.classList.remove('active');
                    }
                    if (menu) {
                        menu.classList.remove('show');
                        menu.setAttribute('aria-hidden', 'true');
                    }
                });
            }
        });
    }
    
    // Main function to replace eye containers
    function replaceEyeContainers() {
        var eyeContainers = document.querySelectorAll('.eye-container');
        
        eyeContainers.forEach(function(container) {
            var fieldKey = container.getAttribute('fieldkey');
            var currentAction = container.getAttribute('current_action');
            
            if (!fieldKey || !currentAction) return;
            
            // Create new dropdown
            var dropdown = createPrivacyDropdown(fieldKey, currentAction);
            
            // Find the appropriate place to insert the dropdown
            var parentDiv = container.parentNode;
            if (parentDiv && parentDiv.classList.contains('visualClear')) {
                // Insert dropdown before the visualClear div
                parentDiv.parentNode.insertBefore(dropdown, parentDiv);
            } else {
                // Fallback: replace the container directly
                container.parentNode.insertBefore(dropdown, container);
            }
            
            // Setup behavior
            setupDropdownBehavior(dropdown);
            
            // Remove old container
            container.remove();
        });
    }
    
    // Initialize everything
    ready(function() {
        injectStyles();
        replaceEyeContainers();
        setupGlobalClickHandler();
        
        console.log('Privacy dropdowns initialized');
    });
    
})();