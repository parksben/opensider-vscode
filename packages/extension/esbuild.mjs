import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const extension = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
};

if (watch) {
  const ext = await esbuild.context(extension);
  await ext.watch();
} else {
  await esbuild.build(extension);
}
