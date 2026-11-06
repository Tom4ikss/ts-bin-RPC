// `ts-bin-rpc/vite` in the workspace. The published package points it at dist/cli/vite.js, built with
// the tbr command, so this file is left out of the build.
export { tbr, type TbrPluginOptions } from '../../cli/src/vite.ts';
