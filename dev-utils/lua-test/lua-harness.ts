/**
 * Runs Scribunto-shaped Lua modules under Node so Jest can drive them.
 *
 * Scribunto modules cannot be required directly, so this loads the module
 * source into a fengari Lua state alongside a stub of the small part of the
 * `mw` API the album module uses. Only pure helpers are exercised here;
 * anything needing a real parser frame is covered by the render-parity
 * harness instead.
 */
import { readFileSync } from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

/** Stub of the `mw` globals the module is allowed to touch. */
const MW_STUB = `
mw = {
  text = {
    trim = function(s) return (tostring(s or ''):gsub('^%s*(.-)%s*$', '%1')) end,
  },
  title = {
    getCurrentTitle = function()
      return {
        rootText = _TEST_ROOT or 'Test Singer',
        namespace = _TEST_NS or 0,
      }
    end,
  },
}
`;

export interface LuaModule {
  /** Evaluates a Lua expression against the loaded module, returning a string. */
  eval(expr: string): string;
  /** Sets the value ROOTPAGENAME resolves to. */
  setRoot(name: string): void;
  /** Sets the namespace getCurrentTitle() reports. Mainspace is 0. */
  setNamespace(ns: number): void;
}

export function loadLuaModule(path: string, globalName = 'M'): LuaModule {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  const exec = (src: string, chunk: string, expectValue: boolean) => {
    if (lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring(chunk)) !== lua.LUA_OK) {
      throw new Error(`Lua load error in ${chunk}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
    }
    if (lua.lua_pcall(L, 0, expectValue ? 1 : 0, 0) !== lua.LUA_OK) {
      throw new Error(`Lua runtime error in ${chunk}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
    }
  };

  exec(MW_STUB, 'mw-stub', false);
  exec(readFileSync(path, 'utf8'), path, true);
  lua.lua_setglobal(L, to_luastring(globalName));

  return {
    eval(expr: string): string {
      exec(`return tostring(${expr})`, 'expr', true);
      const out = to_jsstring(lua.lua_tostring(L, -1));
      lua.lua_pop(L, 1);
      return out;
    },
    setRoot(name: string): void {
      exec(`_TEST_ROOT = ${JSON.stringify(name)}`, 'set-root', false);
    },
    setNamespace(ns: number): void {
      exec(`_TEST_NS = ${Number(ns)}`, 'set-ns', false);
    },
  };
}
