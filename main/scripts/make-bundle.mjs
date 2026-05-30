// Builds the app as a single self-contained HTML file and copies it to
// ./smplx-viewer.html in the project root. Run with: pnpm bundle
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

execSync("vite build --mode singlefile", { stdio: "inherit" });

const src = "dist/index.html";
const dest = "smplx-viewer.html";
if (!existsSync(src)) {
  console.error(`\nExpected ${src} but it was not produced.`);
  process.exit(1);
}
copyFileSync(src, dest);
console.log(`\n✅ Standalone page written to ${dest} — open it directly in a browser.`);
