/** @type {import("jest").Config} **/
export default {
  testEnvironment: "jsdom",
  transform: {
    // dev-utils/wiki-audit is executed directly by Node (`node .../fetch-cli.ts`),
    // so its relative imports must carry .ts extensions. TypeScript only permits
    // those under `allowImportingTsExtensions`, which the root tsconfig cannot
    // enable because it emits. This override is scoped to that directory so the
    // rest of the suite keeps compiling against the root config unchanged.
    '^.+wiki-audit[\\\\/].+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'dev-utils/wiki-audit/tsconfig.json'
      }
    ],
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json'
      }
    ]
  },
  globalSetup: "./setup-test-env.js",
  moduleNameMapper: {
    '(.+)\\.js': '$1'
  },
  extensionsToTreatAsEsm: ['.ts']
};
