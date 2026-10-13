import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "vite";
const root = fileURLToPath(new URL("../admin/", import.meta.url));
const check = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/typescript/bin/tsc", import.meta.url),
    ),
    "-p",
    root + "/tsconfig.json",
  ],
  { stdio: "inherit" },
);
if (check.status !== 0) process.exit(check.status ?? 1);
await build({
  root,
  base: "/admin/",
  configFile: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    assetsDir: "assets",
    sourcemap: false,
  },
});
