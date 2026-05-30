import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `pnpm build`  -> normal multi-file output in dist/ (good for hosting)
// `pnpm bundle` -> single self-contained dist/index.html (mode === "singlefile")
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "singlefile" ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
