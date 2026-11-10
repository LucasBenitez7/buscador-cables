#!/usr/bin/env node
/**
 * Launches the Next.js CLI with the monorepo root `.env` loaded.
 *
 * Next.js only reads `.env` from the app directory, and `next.config.ts` is
 * evaluated in an isolated context, so neither picks up the single root `.env`.
 * Node's `--env-file` cannot be used either: Next.js forwards `execArgv` to its
 * build workers through `NODE_OPTIONS`, which rejects that flag.
 *
 * Usage: node scripts/next.mjs <dev|build|start> [next args...]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

function findRepoRoot(startDir) {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
}

const args = process.argv.slice(2);
const appDir = process.cwd();

loadEnvConfig(findRepoRoot(appDir), args[0] === "dev");

const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
