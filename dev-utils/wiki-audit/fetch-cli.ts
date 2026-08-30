import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { createClient } from './lib/api.ts';
import { runFetch, USER_AGENT } from './fetch.ts';

const apiUrl = process.env.WIKI_API_URL;
if (!apiUrl) throw new Error('WIKI_API_URL is not set');

const outDir = resolve(import.meta.dirname, '../../wiki');
await mkdir(outDir, { recursive: true });
await runFetch(createClient(apiUrl, USER_AGENT), outDir);
