# Unused gadget pages (archive)

Byte-for-byte copies of the 26 `MediaWiki:Gadget-*` pages that exist on utaite.wiki
but that nothing loads: no gadget in MediaWiki:Gadgets-definition lists them, and a
wiki-wide `insource:` search found no `mw.loader.load`/`importScript` of them.
Copied from the live wiki on 2026-10-03.

This folder is outside `src/`, so it is not built, linted, type-checked, tested or synced.
Deleting a page on the wiki does not touch these copies; restoring one means
pasting the file back into its page (or moving it into `src/` and the gadget definition).

| Page | Bytes | Created | Last edit | What it is |
|---|---:|---|---|---|
| [MediaWiki:Gadget-ActivityFeedMimic.css](https://utaite.wiki/wiki/MediaWiki:Gadget-ActivityFeedMimic.css) | 4,935 | 2020-12-09 | 2025-07-15 (Ark) | Styles {{Special:RecentChanges}} to look like Fandom's old <activityfeed/> (from Fandom) |
| [MediaWiki:Gadget-CustomSlider.css](https://utaite.wiki/wiki/MediaWiki:Gadget-CustomSlider.css) | 3,063 | 2018-09-11 | 2025-04-15 (Ark) | Styles for CustomSlider (from Fandom Dev wiki) |
| [MediaWiki:Gadget-CustomSlider.js](https://utaite.wiki/wiki/MediaWiki:Gadget-CustomSlider.js) | 39,803 | 2018-09-11 | 2026-10-02 (Ark) | Image slider for #SliderView (from Fandom Dev wiki). Only Template:MP-slider uses the markup, and nothing transcludes that template; its /doc wrongly says ImportJS loads the script |
| [MediaWiki:Gadget-blog-post-vote.js](https://utaite.wiki/wiki/MediaWiki:Gadget-blog-post-vote.js) | 2,830 | 2025-04-16 | 2025-04-16 (Ark) | Vote box tweaks for the Blog namespace (500); BlogPage/SocialProfile era |
| [MediaWiki:Gadget-blogs.css](https://utaite.wiki/wiki/MediaWiki:Gadget-blogs.css) | 15,963 | 2025-04-16 | 2025-06-24 (Ark) | Layout for the old BlogPage extension |
| [MediaWiki:Gadget-citizen-extension-socialprofile-handle-birthday.js](https://utaite.wiki/wiki/MediaWiki:Gadget-citizen-extension-socialprofile-handle-birthday.js) | 3,029 | 2025-10-14 | 2025-10-15 (Ark) | Birthday formatting on SocialProfile user pages |
| [MediaWiki:Gadget-citizen-extension-socialprofile-userpage-activityitempagetitleexcerpt.js](https://utaite.wiki/wiki/MediaWiki:Gadget-citizen-extension-socialprofile-userpage-activityitempagetitleexcerpt.js) | 1,287 | 2025-10-15 | 2025-10-15 (Ark) | Truncates long titles in the SocialProfile activity list |
| [MediaWiki:Gadget-citizen-extension-socialprofile-userpage.css](https://utaite.wiki/wiki/MediaWiki:Gadget-citizen-extension-socialprofile-userpage.css) | 15,519 | 2025-10-15 | 2025-10-15 (Ark) | SocialProfile user page theme |
| [MediaWiki:Gadget-citizen-extension-socialprofile.js](https://utaite.wiki/wiki/MediaWiki:Gadget-citizen-extension-socialprofile.js) | 18,875 | 2025-09-12 | 2025-11-05 (Ark) | Special:UpdateProfile form enhancements (SocialProfile) |
| [MediaWiki:Gadget-citizen-extensions-socialprofile.css](https://utaite.wiki/wiki/MediaWiki:Gadget-citizen-extensions-socialprofile.css) | 15,099 | 2025-11-18 | 2025-11-18 (Ark) | SocialProfile styles; the page itself says the extensions are no longer in use |
| [MediaWiki:Gadget-citizen-layout.js](https://utaite.wiki/wiki/MediaWiki:Gadget-citizen-layout.js) | 3,515 | 2025-09-12 | 2025-11-05 (Ark) | Swaps the Citizen avatar icon for the SocialProfile avatar |
| [MediaWiki:Gadget-create-blog-post.css](https://utaite.wiki/wiki/MediaWiki:Gadget-create-blog-post.css) | 5,514 | 2025-04-16 | 2025-04-16 (Ark) | Styles for the Special:CreateBlogPost form (BlogPage) |
| [MediaWiki:Gadget-create-blog-post.js](https://utaite.wiki/wiki/MediaWiki:Gadget-create-blog-post.js) | 12,527 | 2025-04-16 | 2025-07-26 (Ark) | Custom Special:CreateBlogPost form (BlogPage) |
| [MediaWiki:Gadget-discography-editor.css](https://utaite.wiki/wiki/MediaWiki:Gadget-discography-editor.css) | 2,327 | 2025-08-20 | 2025-08-20 (Ark) | Styles for the discography editor modal (v0.0.1, by Makudoumee) |
| [MediaWiki:Gadget-discography-editor.js](https://utaite.wiki/wiki/MediaWiki:Gadget-discography-editor.js) | 27,004 | 2025-08-20 | 2025-08-21 (Ark) | Discography editor for Data pages (v0.0.1 draft, by Makudoumee) |
| [MediaWiki:Gadget-findreplace.js](https://utaite.wiki/wiki/MediaWiki:Gadget-findreplace.js) | 26,946 | 2025-06-23 | 2025-09-03 (Ark) | Find and replace for the CodeMirror source editor (v2.0.0) |
| [MediaWiki:Gadget-gadget-impl.js](https://utaite.wiki/wiki/MediaWiki:Gadget-gadget-impl.js) | 3,703 | 2025-12-13 | 2025-12-13 (Arknomahounorobotto) | A pasted mw.loader.impl dump of the getuserprofile gadget (bot test, Dec 2025); not real source |
| [MediaWiki:Gadget-layout.css](https://utaite.wiki/wiki/MediaWiki:Gadget-layout.css) | 7,534 | 2025-06-23 | 2025-09-30 (Ark) | Old layout CSS; the page says it moved to Gadget-citizen-layout.css and is kept as an archive |
| [MediaWiki:Gadget-massupload.css](https://utaite.wiki/wiki/MediaWiki:Gadget-massupload.css) | 10,626 | 2025-07-15 | 2025-07-15 (Ark) | Styles for a bulk upload modal (no matching script on the wiki) |
| [MediaWiki:Gadget-mmv.css](https://utaite.wiki/wiki/MediaWiki:Gadget-mmv.css) | 2,855 | 2025-07-17 | 2025-07-17 (Ark) | MultimediaViewer overlay restyle |
| [MediaWiki:Gadget-mmv.js](https://utaite.wiki/wiki/MediaWiki:Gadget-mmv.js) | 5,596 | 2025-07-17 | 2025-07-17 (Ark) | MultimediaViewer overlay helper |
| [MediaWiki:Gadget-mobile-mainpage.js](https://utaite.wiki/wiki/MediaWiki:Gadget-mobile-mainpage.js) | 2,243 | 2025-11-13 | 2025-11-13 (Ark) | Main page mobile tweaks (Nov 2025), predates the main page redesign |
| [MediaWiki:Gadget-nocontextmenu.js](https://utaite.wiki/wiki/MediaWiki:Gadget-nocontextmenu.js) | 1,202 | 2025-07-10 | 2025-07-10 (Ark) | Disables right-click on .no-context-menu elements |
| [MediaWiki:Gadget-poll-correction.js](https://utaite.wiki/wiki/MediaWiki:Gadget-poll-correction.js) | 10,533 | 2025-06-24 | 2025-06-24 (Ark) | Workaround for an Extension:Poll comment deletion bug |
| [MediaWiki:Gadget-recent-blogs.css](https://utaite.wiki/wiki/MediaWiki:Gadget-recent-blogs.css) | 1,423 | 2025-04-16 | 2025-04-16 (Ark) | Styles for #recent-blogs (old blog listing) |
| [MediaWiki:Gadget-suggestions.js](https://utaite.wiki/wiki/MediaWiki:Gadget-suggestions.js) | 8,050 | 2025-07-27 | 2025-09-03 (Ark) | Template name autocomplete for the CodeMirror source editor (v1.0.10) |
