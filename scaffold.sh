#!/bin/bash

# Create Category Directories
mkdir -p src/gadgets/{core,contents,utility,blog,styling,external,community,moderation}

# --- Core (Default) ---

# CustomTabber
mkdir -p src/gadgets/core/CustomTabber
touch src/gadgets/core/CustomTabber/CustomTabber.ts

# videopreview
mkdir -p src/gadgets/core/videopreview
touch src/gadgets/core/videopreview/PreviewVid.less src/gadgets/core/videopreview/PreviewVid.ts

# TextExtractsLoader
mkdir -p src/gadgets/core/TextExtractsLoader
touch src/gadgets/core/TextExtractsLoader/TextExtractsLoader.ts

# preloadtemplate
mkdir -p src/gadgets/core/preloadtemplate
touch src/gadgets/core/preloadtemplate/preloadTemplate.ts src/gadgets/core/preloadtemplate/preloadTemplate.less

# datatables
mkdir -p src/gadgets/core/datatables
touch src/gadgets/core/datatables/datatables-helper.ts src/gadgets/core/datatables/mobile-datatables-helper.ts src/gadgets/core/datatables/Datatables.less

# userlinks
mkdir -p src/gadgets/core/userlinks
touch src/gadgets/core/userlinks/UserLinks.ts

# forum
mkdir -p src/gadgets/core/forum
touch src/gadgets/core/forum/forum.ts

# lightboxmodoki
mkdir -p src/gadgets/core/lightboxmodoki
touch src/gadgets/core/lightboxmodoki/lightbox-modoki.ts src/gadgets/core/lightboxmodoki/lightbox-modoki.less

# twitter
mkdir -p src/gadgets/core/twitter
touch src/gadgets/core/twitter/twitter.ts

# bottom toolbar (Handling spaces in name)
mkdir -p "src/gadgets/core/bottom toolbar"
touch "src/gadgets/core/bottom toolbar/bottom toolbar.ts" "src/gadgets/core/bottom toolbar/bottom toolbar.less"

# ToolsMenu
mkdir -p src/gadgets/core/ToolsMenu
touch src/gadgets/core/ToolsMenu/ToolsMenu.ts

# ModalBuilder
mkdir -p src/gadgets/core/ModalBuilder
touch src/gadgets/core/ModalBuilder/ModalBuilder.ts

# QuickPurge
mkdir -p src/gadgets/core/QuickPurge
touch src/gadgets/core/QuickPurge/QuickPurge.ts

# LinkPreview
mkdir -p src/gadgets/core/LinkPreview
touch src/gadgets/core/LinkPreview/LinkPreview.ts src/gadgets/core/LinkPreview/LinkPreview.less

# ShowbyGroup
mkdir -p src/gadgets/core/ShowbyGroup
touch src/gadgets/core/ShowbyGroup/showbygroup.ts src/gadgets/core/ShowbyGroup/showbygroup.less

# AddCategory
mkdir -p src/gadgets/core/AddCategory
touch src/gadgets/core/AddCategory/add-category.ts

# hidesnonedit
mkdir -p src/gadgets/core/hidesnonedit
touch src/gadgets/core/hidesnonedit/hidesnonedit.ts

# sandbox
mkdir -p src/gadgets/core/sandbox
touch src/gadgets/core/sandbox/portablesandbox.ts src/gadgets/core/sandbox/sandbox.ts src/gadgets/core/sandbox/sandbox.less src/gadgets/core/sandbox/sandbox.json

# --- Contents ---

# spoiler
mkdir -p src/gadgets/contents/spoiler
touch src/gadgets/contents/spoiler/spoiler.ts

# utacolle
mkdir -p src/gadgets/contents/utacolle
touch src/gadgets/contents/utacolle/UtaColle.ts

# --- Utility ---

# getuserprofile
mkdir -p src/gadgets/utility/getuserprofile
touch src/gadgets/utility/getuserprofile/getuserprofile.ts

# docsbrowser
mkdir -p src/gadgets/utility/docsbrowser
touch src/gadgets/utility/docsbrowser/DocsBrowser.ts

# LinkSuggest
mkdir -p src/gadgets/utility/LinkSuggest
touch src/gadgets/utility/LinkSuggest/LinkSuggest.ts src/gadgets/utility/LinkSuggest/LinkSuggest.less

# PWA
mkdir -p src/gadgets/utility/PWA
touch src/gadgets/utility/PWA/PWA.ts

# --- Blog ---

# userblog
mkdir -p src/gadgets/blog/userblog
touch src/gadgets/blog/userblog/userblog.ts src/gadgets/blog/userblog/userblog.less

# --- Styling ---

# citizen
mkdir -p src/gadgets/styling/citizen
touch src/gadgets/styling/citizen/citizen-vars.less \
      src/gadgets/styling/citizen/citizen-base.less \
      src/gadgets/styling/citizen/citizen.less \
      src/gadgets/styling/citizen/citizen-layout.less \
      src/gadgets/styling/citizen/citizen-templates.less \
      src/gadgets/styling/citizen/citizen-widgets.less \
      src/gadgets/styling/citizen/citizen-extensions.less \
      src/gadgets/styling/citizen/citizen-navigation.less \
      src/gadgets/styling/citizen/citizen-pages.less \
      src/gadgets/styling/citizen/citizen-forums.less \
      src/gadgets/styling/citizen/citizen-external.less

# mainpage
mkdir -p src/gadgets/styling/mainpage
touch src/gadgets/styling/mainpage/Mp.less

# actioncard
mkdir -p src/gadgets/styling/actioncard
touch src/gadgets/styling/actioncard/actioncard.ts

# fontawesome
mkdir -p src/gadgets/styling/fontawesome
touch src/gadgets/styling/fontawesome/fontawesome.less

# usercard
mkdir -p src/gadgets/styling/usercard
touch src/gadgets/styling/usercard/citizen-usergroup-icons.ts

# uptodatebox
mkdir -p src/gadgets/styling/uptodatebox
touch src/gadgets/styling/uptodatebox/uptodate.less

# systemmessage
mkdir -p src/gadgets/styling/systemmessage
touch src/gadgets/styling/systemmessage/editing.ts

# protectionindicator
mkdir -p src/gadgets/styling/protectionindicator
touch src/gadgets/styling/protectionindicator/ProtectionIndicator.ts

# movablesitenotice
mkdir -p src/gadgets/styling/movablesitenotice
touch src/gadgets/styling/movablesitenotice/movablenotice.ts src/gadgets/styling/movablesitenotice/movablenotice.less

# birthday
mkdir -p src/gadgets/styling/birthday
touch src/gadgets/styling/birthday/birthday.ts

# usersignaturestyle
mkdir -p src/gadgets/styling/usersignaturestyle
touch src/gadgets/styling/usersignaturestyle/user-sign.less

# badge
mkdir -p src/gadgets/styling/badge
touch src/gadgets/styling/badge/badge.less

# documentation
mkdir -p src/gadgets/styling/documentation
touch src/gadgets/styling/documentation/documentation.less src/gadgets/styling/documentation/documentation.ts

# --- External ---

# item
mkdir -p src/gadgets/external/item
touch src/gadgets/external/item/Item.less

# tabs
mkdir -p src/gadgets/external/tabs
touch src/gadgets/external/tabs/Tabs.less

# --- Community ---

# discord
mkdir -p src/gadgets/community/discord
touch src/gadgets/community/discord/discord.ts

# consolemessage
mkdir -p src/gadgets/community/consolemessage
touch src/gadgets/community/consolemessage/console.ts

# --- Moderation & Housekeeping ---

# massrename
mkdir -p src/gadgets/moderation/massrename
touch src/gadgets/moderation/massrename/massrename.ts

# massdelete
mkdir -p src/gadgets/moderation/massdelete
touch src/gadgets/moderation/massdelete/massdelete.ts

# massupload
mkdir -p src/gadgets/moderation/massupload
touch src/gadgets/moderation/massupload/massupload.ts

# masscategorization
mkdir -p src/gadgets/moderation/masscategorization
touch src/gadgets/moderation/masscategorization/masscategorization.ts

echo "Structure created successfully!"