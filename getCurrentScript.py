import os
import yaml

# The Utaite Wiki Gadgets Definition
UTAITE_YAML_CONTENT = """
workspace:
  enable_all: true

gadgets:
  core:
    CustomTabber:
      description: "Custom Tabber functionality."
      code:
        - CustomTabber.ts
      resourceLoader:
        default: true
        hidden: true
    videopreview:
      description: "Video preview functionality."
      code:
        - PreviewVid.less
        - PreviewVid.ts
      resourceLoader:
        default: true
    preloadtemplate:
      description: "Preload templates on edit."
      code:
        - preloadTemplate.ts
        - preloadTemplate.less
      resourceLoader:
        default: true
        hidden: true
        actions:
          - edit
          - submit
    datatables:
      description: "DataTables helper."
      code:
        - datatables-helper.ts
        - mobile-datatables-helper.ts
        - Datatables.less
      resourceLoader:
        default: true
        hidden: true
        actions:
          - view
    userlinks:
      description: "User links customization."
      code:
        - UserLinks.ts
      resourceLoader:
        default: true
        hidden: true
    forum:
      description: "Forum specific scripts."
      code:
        - forum.ts
      resourceLoader:
        default: true
        hidden: true
        namespaces: "110,111"
    lightboxmodoki:
      description: "Lightbox-like gallery."
      code:
        - lightbox-modoki.ts
        - lightbox-modoki.less
      resourceLoader:
        default: true
        hidden: true
    twitter:
      description: "Twitter integration."
      code:
        - twitter.ts
      resourceLoader:
        default: true
        hidden: true
    "bottom toolbar":
      description: "Bottom toolbar with various tools."
      code:
        - bottom toolbar.ts
        - bottom toolbar.less
      resourceLoader:
        default: true
        dependencies:
          - mediawiki.api
          - oots-ui
          - mediawiki.page.watch.ajax
          - mediawiki.watchstar.widgets
    ToolsMenu:
      description: "Tools Menu."
      code:
        - ToolsMenu.ts
      resourceLoader:
        default: true
        hidden: true
    ModalBuilder:
      description: "Modal Builder utility."
      code:
        - ModalBuilder.ts
      resourceLoader:
        default: true
        hidden: true
    QuickPurge:
      description: "Quick Purge tool."
      code:
        - QuickPurge.ts
      resourceLoader:
        default: true
        hidden: true
    LinkPreview:
      description: "Link Preview."
      code:
        - LinkPreview.ts
        - LinkPreview.less
    ShowbyGroup:
      description: "Show content by user group."
      code:
        - showbygroup.ts
        - showbygroup.less
      resourceLoader:
        default: true
        hidden: true
    AddCategory:
      description: "Add Category script."
      code:
        - add-category.ts
      resourceLoader:
        default: true
        hidden: true
        actions:
          - view
        namespaces: "0,4,6,8,10,12,14,110,828,3000,3006"
    hidesnonedit:
      description: "Hides site notice on edit."
      code:
        - hidesnonedit.ts
      resourceLoader:
        default: true
        hidden: true
    sandbox:
      description: "Sandbox tools."
      code:
        - portablesandbox.ts
        - sandbox.ts
        - sandbox.less
        - sandbox.tson
      resourceLoader:
        default: true
        hidden: true
        actions:
          - view
        namespaces: "0,4"

  Contents:
    spoiler:
      description: "Spoiler functionality."
      code:
        - spoiler.ts
      resourceLoader:
        default: true
        hidden: true
    utacolle:
      description: "UtaColle-related script."
      code:
        - UtaColle.ts
      resourceLoader:
        default: true
        hidden: true

  utility:
    getuserprofile:
      description: "Get User Profile utility."
      code:
        - getuserprofile.ts
      resourceLoader:
        default: true
        hidden: true
    docsbrowser:
      description: "Documentation Browser."
      code:
        - DocsBrowser.ts
      resourceLoader:
        default: true
        hidden: true
    LinkSuggest:
      description: "Link Suggestions."
      code:
        - LinkSuggest.ts
        - LinkSuggest.less
      resourceLoader:
        default: true
        actions:
          - edit
          - submit
        dependencies:
          - mediawiki.api
    PWA:
      description: "Progressive Web App support."
      code:
        - PWA.ts
      resourceLoader:
        default: true
        hidden: true

  blog:
    userblog:
      description: "User Blog functionality."
      code:
        - userblog.ts
        - userblog.less
      resourceLoader:
        default: true
        hidden: true
        namespaces: "0,2,3000,3001"
        dependencies:
          - mediawiki.api

  styling:
    citizen:
      description: "Citizen skin styling and extensions."
      code:
        - citizen-vars.less
        - citizen-base.less
        - citizen.less
        - citizen-layout.less
        - citizen-templates.less
        - citizen-widgets.less
        - citizen-extensions.less
        - citizen-navigation.less
        - citizen-forums.less
        - citizen-external.less
        - citizen-pages.less
      resourceLoader:
        default: true
        hidden: true
    mainpage:
      description: "Main Page styling."
      code:
        - Mp.less
      resourceLoader:
        default: true
        hidden: true
    actioncard:
      description: "Action Card styling."
      code:
        - actioncard.ts
      resourceLoader:
        default: true
        hidden: true
        namespaces: "0"
        actions:
          - view
    fontawesome:
      description: "FontAwesome icons."
      code:
        - fontawesome.less
      resourceLoader:
        default: true
        hidden: true
    usercard:
      description: "User Card styling."
      code:
        - citizen-usergroup-icons.ts
      resourceLoader:
        default: true
        hidden: true
    uptodatebox:
      description: "Up-to-date Box styling."
      code:
        - uptodate.less
      resourceLoader:
        default: true
        hidden: true
    systemmessage:
      description: "System Message styling."
      code:
        - editing.ts
      resourceLoader:
        default: true
        hidden: true
    protectionindicator:
      description: "Protection Indicator."
      code:
        - ProtectionIndicator.ts
      resourceLoader:
        default: true
        hidden: true
    movablesitenotice:
      description: "Movable Site Notice."
      code:
        - movablenotice.ts
        - movablenotice.less
    birthday:
      description: "Custom Effect for Utaite Birthday."
      code:
        - birthday.ts
      resourceLoader:
        default: true
        hidden: true
        namespaces: "0"
        actions:
          - view
    usersignaturestyle:
      description: "User Signature styling."
      code:
        - user-sign.less
      resourceLoader:
        default: true
        hidden: true
    badge:
      description: "Badge styling."
      code:
        - badge.less
      resourceLoader:
        default: true
        hidden: true
    documentation:
      description: "Documentation styling."
      code:
        - documentation.less
        - documentation.ts
      resourceLoader:
        default: true
        hidden: true

  external:
    item:
      description: "External Item styling."
      code:
        - Item.less
      resourceLoader:
        default: true
        hidden: true
    tabs:
      description: "Tabs styling."
      code:
        - Tabs.less
      resourceLoader:
        default: true
        hidden: true

  community:
    discord:
      description: "Discord integration."
      code:
        - discord.ts
      resourceLoader:
        default: true
        hidden: true
    consolemessage:
      description: "Console Message."
      code:
        - console.ts
      resourceLoader:
        default: true
        hidden: true

  "moderation & housekeeping":
    massrename:
      description: "Mass Rename tool."
      code:
        - massrename.ts
    massdelete:
      description: "Mass Delete tool."
      code:
        - massdelete.ts
    massupload:
      description: "Mass Upload tool."
      code:
        - massupload.ts
    masscategorization:
      description: "Mass Categorization tool."
      code:
        - masscategorization.ts
"""

def create_files_from_yaml():
    # Parse the YAML content
    try:
        data = yaml.safe_load(UTAITE_YAML_CONTENT)
    except yaml.YAMLError as exc:
        print(f"Error parsing YAML: {exc}")
        return

    # Base directory for the interface code
    base_dir = os.path.join("src", "gadgets")
    
    # 1. Create the definition file itself
    os.makedirs(base_dir, exist_ok=True)
    definition_path = os.path.join(base_dir, "gadgets-definition.yaml")
    with open(definition_path, "w", encoding="utf-8") as f:
        f.write(UTAITE_YAML_CONTENT)
    print(f"[CREATED] Definition file: {definition_path}")

    # 2. Iterate through categories and gadgets
    gadgets_config = data.get("gadgets", {})
    
    for category, gadgets in gadgets_config.items():
        print(f"\nProcessing Category: {category}")
        
        for gadget_name, gadget_info in gadgets.items():
            # Define the specific directory for this gadget
            # Structure: src/gadgets/<Category>/<GadgetName>/
            gadget_dir = os.path.join(base_dir, category, gadget_name)
            os.makedirs(gadget_dir, exist_ok=True)
            
            # Get the list of code files
            code_files = gadget_info.get("code", [])
            
            for filename in code_files:
                # Handle file extension conversions
                root, ext = os.path.splitext(filename)
                
                final_filename = filename
                if ext == ".js":
                    final_filename = root + ".ts"
                elif ext == ".css":
                    final_filename = root + ".less"
                
                # Full path to the file
                file_path = os.path.join(gadget_dir, final_filename)
                
                # Create the file if it doesn't exist
                if not os.path.exists(file_path):
                    with open(file_path, "w", encoding="utf-8") as f:
                        if final_filename.endswith(".ts"):
                            f.write(f"// {final_filename}\n// TODO: Implement {gadget_name}\n")
                        elif final_filename.endswith(".less"):
                            f.write(f"/* {final_filename} */\n")
                        else:
                            f.write("")
                    print(f"  + Created: {file_path}")
                else:
                    print(f"  - Exists:  {file_path}")

if __name__ == "__main__":
    print("Scaffolding Utaite Wiki Interface Code...")
    create_files_from_yaml()
    print("\nDone! Directory structure is ready.")