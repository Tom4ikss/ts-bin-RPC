// Content script in the page's own world, before its scripts: installs the hook.
import { createHook } from './hook.ts';
import { HOOK } from './protocol.ts';

if (!(HOOK in globalThis)) Object.defineProperty(globalThis, HOOK, { value: createHook(), configurable: true });
