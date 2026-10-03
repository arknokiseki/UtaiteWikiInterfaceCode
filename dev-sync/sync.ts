import { resolveFileExtension } from '../dev-utils/utils.ts';

import { normalizePath } from "vite";

import { Mwn } from "mwn";

import http from "http";
import https from "https";
import axios from "axios";
import { readdirSync, createWriteStream, existsSync, mkdirSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join, relative, resolve, basename } from "path";
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const EDIT_SUMMARY = 'Automated: Syncing the MediaWiki Interface + Gadgets Code';

const __dirname = import.meta.dirname;
const logsFolderPath = resolve(__dirname, '../logs');
if (!existsSync(logsFolderPath)) { mkdirSync(logsFolderPath); }
const srcPath = resolve(__dirname, '../src');
const distPath = resolve(__dirname, '../dist');
const gadgetsSubfolder = 'gadgets';
const mediawikiSubfolder = 'mediawiki';
const gadgetsDistPath = resolve(distPath, gadgetsSubfolder);
const mediawikiDistPath = resolve(distPath, mediawikiSubfolder);

/* Set Mwn to log to a file */
const currentDate = new Date(Date.now()).toISOString().slice(0, 10);
Mwn.setLoggingConfig({
  stream: createWriteStream(
    resolve(logsFolderPath, `${currentDate}.log`), {
    flags: 'a',
    encoding: 'utf8'
  })
});

/**
 * Utility to log a message onto the console along with a file on disk.
 * 
 * @param message 
 */
function log(message: string) {
  console.log(message);
  Mwn.log(`[I] ${message}`);
}

/**
 * Resolves the project's environment variables by referring to the profile
 * set using the environment variable `NODE_PROJECT_PROFILE` 
 */
function resolveEnv(): void {
  const profile = process.env.NODE_PROJECT_PROFILE || null;
  console.log(`Running Node script on profile '${profile ?? 'default'}'`);
  if (profile !== null) process.env.profile = profile;

  const envFilename = `.env${!!profile ? '.' : ''}${profile || ''}`;
  const envFile = resolve(process.cwd(), envFilename);
  if (!existsSync(envFile)) {
    throw new Error(`Cannot find ./${envFilename}!`);
  }
  process.loadEnvFile(envFile);
}

/**
 * Creates the Mwn Bot object
 * 
 * @returns 
 */
async function initBot(): Promise<Mwn> {
  /* Constructor */
  const bot = new Mwn({
    apiUrl: process.env.WIKI_API_URL,
    username: process.env.BOT_USERNAME,
    password: process.env.BOT_PASSWORD,
    userAgent: process.env.BOT_USERAGENT,
    OAuth2AccessToken: process.env.BOT_OAUTH_ACCESS_TOKEN,
    silent: true,       // suppress messages (except error messages)
    retryPause: 5000,   // pause for 5000 milliseconds (5 seconds) on maxlag error.
    maxRetries: 5       // attempt to retry a failing requests upto 5 times
  });

  /* For non-prod environments, set the bot to transmit requests over insecure HTTP if needed */
  if (process.env.ENV_REJECT_UNAUTHORIZED === '0') {
    log("Setting HTTP Request Agent to not reject unauthorized requests. Do not do this on a production environment.");
    const httpAgent = new http.Agent({ keepAlive: true });
    const httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });
    axios.defaults.httpAgent = httpAgent;
    axios.defaults.httpsAgent = httpsAgent;
    bot.setRequestOptions({ httpAgent, httpsAgent });
  }

  /* Finally login */
  if (!!process.env.BOT_USERNAME || !!process.env.BOT_PASSWORD) {
    // Login using Special:BotPasswords
    log(`Logging into ${process.env.WIKI_API_URL} as ${process.env.BOT_USERNAME}`);
    await bot.login({
      apiUrl: process.env.WIKI_API_URL,
      username: process.env.BOT_USERNAME,
      password: process.env.BOT_PASSWORD,
    });
    log(`Successfully logged in!`);
  } else {
    // Login using OAuth
    log(`Authenticating OAuth credentials by checking in with ${process.env.WIKI_API_URL}`);
    bot.initOAuth();
    await bot.getTokensAndSiteInfo();
    log(`Successfully authenticated!`);
  }

  return bot;
}

const rxGadgetFolderStructure = new RegExp(`^${gadgetsSubfolder}\/(?<gadgetId>[^\/]+\/[^\/]+)\/(?<relFilePath>.*)$`);

/**
 * Fetches the names of each `MediaWiki:` page to edit as well as the correspondent 
 * filepaths of the code bundle on `dist/`. 
 * 
 * `getPagesToUpdate()` will try to get the minimum list of pages to edit if 
 * possible.
 * 
 * @param baseCommit  only subscribe to changes made since this commit (the last synced one)
 * @param updateAll   if set to `true`, then `getPagesToUpdate` will update all pages
 * @returns           a Map object with the pagename as key, filepath as value
 */
async function getPagesToUpdate(baseCommit?: string, updateAll?: boolean): Promise<Map<string, string>> {
  const res = new Map<string, string>();
  const gadgetsToUpdate = new Set<string>();

  let filepaths = await ((baseCommit === undefined || updateAll) ? getAllFilesFromSrc() : getFileChangesFromGit(baseCommit));

  for (let filepath of filepaths) {
    if (filepath.startsWith(`${gadgetsSubfolder}/`)) {
      if (basename(filepath) === 'gadgets-definition.yaml') {
        res.set('MediaWiki:Gadgets-definition', resolve(gadgetsDistPath, 'gadgets-definition.wikitext'));
      } else {
        const m = filepath.match(rxGadgetFolderStructure);
        if (m !== null) {
          gadgetsToUpdate.add(m.groups!['gadgetId']!);
        }
      }
    } else if (filepath.startsWith(`${mediawikiSubfolder}/`)) {
      const pagename = resolveFileExtension(basename(filepath));
      res.set(`MediaWiki:${pagename}`, normalizePath(resolve(mediawikiDistPath, pagename)));
    }
  }

  gadgetsToUpdate.forEach(gadgetId => {
    const files = getFilesInGadgetDistFolder(gadgetId);
    files.forEach(file => {
      const pagename = `MediaWiki:Gadget-${basename(file)}`;
      res.set(pagename, file);
    });
  });
  
  return res;
}

/**
 * Fetch all filepaths in `src/`.
 * 
 * @returns 
 */
async function getAllFilesFromSrc(): Promise<string[]> {
  let entries = readdirSync(srcPath, { withFileTypes: true, recursive: true });
  let results = entries
    .filter(entry => entry.isFile())
    .map(entry => normalizePath(join(relative(srcPath, entry.parentPath), entry.name)));
  return results;
}

async function git(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: resolve(__dirname, '..'), maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

/**
 * Only fetch the paths of files in `src/` changed between `baseCommit` and HEAD.
 *
 * A tree diff rather than `git log --since`: commits brought in by a merge keep
 * their original (older) dates and the merge commit itself lists no files, so a
 * date filter silently skipped everything that arrived through a merge.
 *
 * @param baseCommit
 * @returns
 */
async function getFileChangesFromGit(baseCommit: string): Promise<string[]> {
  const prefix = `${basename(srcPath)}/`;
  log(`Collecting changes in ${prefix} since ${baseCommit.slice(0, 7)}`);
  // deleted files have nothing in dist/ to save
  const out = await git('diff', '--name-only', '--diff-filter=d', baseCommit, 'HEAD', '--', prefix);
  return out.split('\n').filter(Boolean).map(file => file.slice(prefix.length));
}

/**
 * Read the last-updated file: the time on the first line and, since the sync
 * started recording it, the synced commit on the second. An older file that only
 * holds a time resolves to the last commit made before that time.
 *
 * @param file
 * @returns the last synced commit, or undefined to sync everything
 */
async function readLastSynced(file: string): Promise<string | undefined> {
  if (!existsSync(file)) return undefined;
  const [time, commit] = (await readFile(file, { encoding: 'utf-8' })).trim().split(/\r?\n/);
  if (commit && /^[0-9a-f]{7,40}$/.test(commit.trim())) return commit.trim();
  const at = Date.parse((time || '').trim());
  if (isNaN(at)) return undefined;
  const legacy = await git('rev-list', '-1', `--before=${new Date(at).toISOString()}`, 'HEAD');
  return legacy || undefined;
}

/**
 * Fetch the paths of the code bundle files comprising a gadget in `dist/`.
 * 
 * @param gadgetId 
 * @returns 
 */
function getFilesInGadgetDistFolder(gadgetId: string): string[] {
  const folderPath = resolve(gadgetsDistPath, gadgetId);
  if (!existsSync(folderPath)) {
    return [];
  }
  let entries = readdirSync(folderPath, { withFileTypes: true, recursive: true });
  let results = entries
    .filter(entry => entry.isFile())
    .map(entry => normalizePath(join(entry.parentPath, entry.name)));
  return results;
}

/**
 * Main bot run
 * 
 * @param bot 
 * @param pagesToUpdate 
 */
async function syncWikiCode(bot: Mwn, pagesToUpdate: Map<string, string>): Promise<string[]> {
  log(`Syncing ${pagesToUpdate.size} page(s)...`);
  const failed = await bot.batchOperation(
    Array.from(pagesToUpdate.keys()) as string[],
    async (pageTitle: string, _: number): Promise<any> => {
      const filepath = pagesToUpdate.get(pageTitle)!;
      const src = await readFile(filepath, { encoding: 'utf-8', flag: 'r' });
      const res: any = await bot.save(pageTitle, src, EDIT_SUMMARY);
      // identical content is a null edit: no new revision
      log(res && res.nochange !== undefined ? `Unchanged page '${pageTitle}'` : `Edited page '${pageTitle}'`);
      return;
    },
    /* concurrencies */ 3,
    /* maxRetries */ 3
  );
  const errors = Object.entries((failed && failed.failures) || {});
  if (errors.length > 0) {
    log(`Failed to edit the following pages:`);
    errors.forEach(([item, error]) => {
      log(`${item}\t${error}`);
    });
  } else {
    log('Finished syncing wiki code!');
  }
  return errors.map(([item]) => item);
}



async function main() {
  try {
    resolveEnv();
    
    const args = process.argv.slice(2);
    const updateAll = args.some((arg) => arg === '--update-all');

    log("Starting the deploy script...");

    const bot = await initBot();
    
    /* Get the last synced commit */
    const lastUpdatedLogFileName = `last-updated${!!process.env.profile ? '.' : ''}${process.env.profile || ''}.txt`;
    const lastUpdatedLogFile = resolve(logsFolderPath, lastUpdatedLogFileName);
    const baseCommit = await readLastSynced(lastUpdatedLogFile);
    // read before syncing, so a commit made while the sync runs is picked up next time
    const head = await git('rev-parse', 'HEAD');

    const pagesToUpdate = await getPagesToUpdate(baseCommit, updateAll);
    const failures = await syncWikiCode(bot, pagesToUpdate);

    if (failures.length > 0) {
      // keep the old marker so the failed pages are retried on the next run
      log(`Not updating ${lastUpdatedLogFileName}: ${failures.length} page(s) failed`);
      process.exitCode = 1;
      return;
    }
    /* Save the synced commit for next time */
    await writeFile(lastUpdatedLogFile, `${new Date(Date.now()).toISOString()}\n${head}\n`, { encoding: 'utf-8', flag: 'w' });
  } catch (err) {
    log(String(err));
    process.exitCode = 1;
  }
}
main();