import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2];
if (!source) throw new Error("Usage: npm run sync:shared -- /path/to/zcs/src");
const files = [
  "components/kit.tsx",
  "components/toast.tsx",
  "components/markdown.tsx",
  "lib/utils.ts",
  "lib/icons.ts",
  "lib/brand.ts",
  "lib/site.ts",
  "lib/toast-context.ts",
  "types/lucide-deep.d.ts",
  "styles.css",
];
for (const file of files) {
  const target = resolve(root, "src/shared", file);
  await mkdir(dirname(target), { recursive: true });
  if (file === "styles.css")
    await writeFile(
      target,
      (await readFile(resolve(source, file), "utf8")).replace('@source "../src";', '@source "./";'),
    );
  else await copyFile(resolve(source, file), target);
}
console.log(
  `Synced ${files.length} original site UI files. These local copies must be committed with the admin repository.`,
);
