import { ViteCustomCliArguments } from './types.js';

const acceptedFlags = ['minify'];
const argumentKeys = ['cmd'];
const rxCliFlag = new RegExp(`^--(${acceptedFlags.join('|')})$`);
const rxCliArg = new RegExp(`^--(${argumentKeys.join('|')})=(.+)$`);

export function resolveCommandLineArgumentsPassedToVite(): ViteCustomCliArguments {
  const customArgs = process.argv.slice(4);
  let args: ViteCustomCliArguments = {};
  for (const arg of customArgs) {
    let m = arg.match(rxCliArg);
    if (m !== null) {
      //@ts-ignore
      args[m[1]] = m[2];
      continue;  
    }
    m = arg.match(rxCliFlag);
    if (m !== null) {
      //@ts-ignore
      args[m[1]] = true;
      continue;
    }
  }

  return args;
}