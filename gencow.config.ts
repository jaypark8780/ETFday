import { defineConfig } from "@gencow/core";

export default defineConfig({
    functionsDir: "./gencow",
    schema: "./gencow/schema.ts",
    codegen: {
        // Optional: where generated frontend codegen artifacts are written.
        // Default: "./src/gencow".
        outDir: "./src/gencow",
        // Set false if you fully own gencow/auth-schema.ts.
        authSchema: true,
    },
    storage: "./.gencow/uploads",
    db: { url: "./.gencow/data" },
    port: 5456,
});
