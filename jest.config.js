/** @type {import("jest").Config} **/
export default {
  testEnvironment: "jsdom",
  transform: {
    // Deliberately a single ts-jest entry. ts-jest memoises its ConfigSet in a
    // static map keyed by the Jest *project* config object, which every transform
    // entry in a project shares. With two entries, whichever transformer is
    // instantiated first in a worker wins and its tsconfig is applied to every file
    // that worker compiles — the other entry's `tsconfig` is silently discarded.
    // That order varies with worker scheduling and transform-cache hits, which made
    // TS5097 surface on a random wiki-audit suite roughly one run in three.
    // tsconfig.jest.json covers the whole suite instead; see it for why the root
    // tsconfig cannot be used directly.
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json'
      }
    ]
  },
  globalSetup: "./setup-test-env.js",
  moduleNameMapper: {
    '(.+)\\.js': '$1'
  },
  extensionsToTreatAsEsm: ['.ts']
};
