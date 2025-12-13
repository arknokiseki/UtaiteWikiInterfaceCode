import {
  autogenerateEntrypoint,
  generateCssBanner,
  generateGadgetsDefinitionWikitext,
  createMwGadgetImplementation,
} from './plugins';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { 
  readGadgetsDefinition, 
  getGadgetsToBuild,
  getMediaWikiInterfaceCodeToBuild,
  mapWikicodeSourceFiles, 
  setViteServerOrigin,
  setGadgetNamespace,
} from './dev-utils/build-orchestration.js';
import { generateScriptBanner } from './dev-utils/generate-banner.js';
import { resolveCommandLineArgumentsPassedToVite } from './dev-utils/resolve-env.js';
import { 
  ConfigEnv, 
  defineConfig, 
  UserConfig, 
  loadEnv
} from 'vite';

export default defineConfig(async ({ mode }: ConfigEnv): Promise<UserConfig> => {
  const customArgs = resolveCommandLineArgumentsPassedToVite();
  const envProfile = process.env.NODE_PROJECT_PROFILE;
  console.log(`Loading profile: '${envProfile || 'default'}'\n`);
  const env = loadEnv(envProfile || mode, process.cwd(), '');

  const { 
    GADGET_NAMESPACE: gadgetNamespace = 'ext.gadget',
    GIT_REPOSITORY_URL: ghUrl = '', 
    GIT_REPOSITORY_BRANCH: ghBranch = 'development',
    SERVER_DEV_ORIGIN: serverDevOrigin = 'http://localhost:5173',
    SERVER_PREVIEW_ORIGIN: serverPreviewOrigin = 'http://localhost:4173',
  } = env;
  
  const isDev = mode === 'development';
  const isOnBuildWatch = customArgs.cmd === 'watch-build';
  const createRolledUpImplementation = customArgs.cmd === 'rollup';
  
  if (isDev) { 
    setViteServerOrigin(serverDevOrigin); 
  } else {
    setViteServerOrigin(serverPreviewOrigin);
  }
  setGadgetNamespace(gadgetNamespace);
  
  const gadgetsDefinition = await readGadgetsDefinition();
  const gadgetsToBuild = getGadgetsToBuild(gadgetsDefinition);
  const mwInterfaceCodeToBuild = getMediaWikiInterfaceCodeToBuild();
  const [bundleInputs, bundleAssets] = mapWikicodeSourceFiles(gadgetsToBuild, mwInterfaceCodeToBuild);

  const minify = customArgs.minify || false;

  return {
    plugins: [

      // On Vite Build, watch changes made to files in gadgets/ subdirectory
      // and generate the load.js entrypoint file 
      autogenerateEntrypoint(gadgetsToBuild, mwInterfaceCodeToBuild, createRolledUpImplementation),

      // On Vite Build, generate the contents of MediaWiki:Gadgets-definition
      generateGadgetsDefinitionWikitext(gadgetsDefinition),

      // Create the rolled up gadget implementation if prompted to
      createRolledUpImplementation && 
        createMwGadgetImplementation(
          gadgetsToBuild, minify
        ),
      
      // On Vite Build, copy the i18n.json files to dist/
      viteStaticCopy({
        targets: bundleAssets,
        structured: false,
      }),

      // On Vite Build, automatically add banner to each CSS file
      !minify && 
        generateCssBanner(ghUrl, ghBranch, gadgetsDefinition)
    ],
    build: {
      target: 'es2018',
      minify: minify,
      cssMinify: minify,
      rollupOptions: {
        input: bundleInputs,
        output: {
          // Preserve the directory structure
          entryFileNames: (chunkInfo) => {
            return chunkInfo.name + '.js';
          },
          assetFileNames: (assetInfo) => {
            // Handle CSS files
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return assetInfo.name;
            }
            return 'assets/[name][extname]';
          },
          generatedCode: {
            /**
             * Turn these settings off if you want to enforce ES5 compliance
             */
            arrowFunctions: true,
            constBindings: true,
            objectShorthand: true,
          },
          globals: {
            /**
             * Pass this to ensure that Vite/Rollup does not use $ as a 
             * minification symbol
             */
            'jquery': '$',
            'mediawiki': 'mw',
          },
          banner: minify ? undefined : 
            generateScriptBanner({ ghUrl, ghBranch, gadgetsDefinition })
        },
        external: ['jquery', 'mediawiki']
      },
      outDir: 'dist',
      emptyOutDir: true,
      watch: isOnBuildWatch ? {
        clearScreen: true,
        exclude: [
          'node_modules/**',
          'dist/**',
          'load.js'
        ]
      } : null
    },
    css: {
      preprocessorOptions: {
        less: {
          // Add any Less-specific options here
        }
      },
    },
    esbuild: {
      format: 'esm',
      // Preserve banner & footer
      legalComments: 'inline',
      // Ignore annotations such as /* @__PURE__ */ when building
      ignoreAnnotations: true,

      // Minification settings
      minifyWhitespace: minify && true,
      minifyIdentifiers: minify && false,
      minifySyntax: minify && true,
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          ".yaml": "text",
          ".yml": "text"
        }
      }
    },
    preview: {
      open: '/load.js'
    }
  }
});