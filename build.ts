import { build as esbuild } from "esbuild";
import { rm } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
const allowlist = [
  "axios",
  "connect-pg-simple",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "discord.js",
  "express",
  "express-session",
  "memorystore",
  "passport",
  "passport-local",
  "pg",
  "ws",
  "zod",
  "zod-validation-error",
];

async function buildServer() {
  // remove old dist folder
  await rm("dist", { recursive: true, force: true });

  console.log("building server...");

  await esbuild({
    entryPoints: ["index.ts"], // <-- your bot entrypoint in root
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: allowlist.map((dep) => dep),
    logLevel: "info",
  });

  console.log("server build complete!");
}

buildServer().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
