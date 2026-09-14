import { defineConfig } from "tsup";

// Deploy ships only this package's own dist plus its registry dependencies, so the @jbroll/*
// workspace packages it imports transitively must be bundled in rather than left external.
export default defineConfig({
  entry: ["src/index.ts", "src/migrate-auth.ts"],
  format: "esm",
  clean: true,
  splitting: false,
  noExternal: [/^@jbroll\//],
  external: ["better-sqlite3", "express", "better-auth"],
});
