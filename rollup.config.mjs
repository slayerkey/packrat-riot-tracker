import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.packrat.riot-tracker.sdPlugin";

/**
 * Self-contained plugin: unlike the ESPN based trackers, this one does not import
 * plugins/_shared. Riot's API is a different domain (personal account, personal key, no game
 * schedule), so it gets its own client, cache, poller and badge renderer under src/.
 *
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	output: {
		dir: `${sdPlugin}/bin`,
		entryFileNames: "plugin.js",
		format: "es",
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		}
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			}
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined,
			include: ["src/**/*.ts"]
		}),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true,
			extensions: [".ts", ".mjs", ".js", ".json", ".node"],
			// Load bearing (see ufc-tracker's README): without dedupe the SDK can resolve to two
			// separate copies and every settings call hangs forever with no error.
			dedupe: ["@elgato/streamdeck", "@elgato/utils", "ws"]
		}),
		commonjs(),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			}
		}
	]
};

export default config;
