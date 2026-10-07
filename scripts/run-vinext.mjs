import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
const supportedCommands = new Set(["dev", "build", "start"]);

if (!supportedCommands.has(command)) {
  console.error("Usage: node scripts/run-vinext.mjs <dev|build|start>");
  process.exit(1);
}

mkdirSync(".wrangler", { recursive: true });

const executable = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);
const child = spawn(process.execPath, [executable, command], {
  stdio: "inherit",
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  },
});

child.on("error", (error) => {
  console.error(`Failed to start vinext: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
