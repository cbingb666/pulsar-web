import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePaths = [
  "README.md",
  ...(await readdir(resolve(root, "docs")))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => `docs/${name}`),
];
const errors = [];
const documents = new Map();
const translationPaths = new Set();

for (const sourcePath of sourcePaths) {
  const translationPath = sourcePath === "README.md"
    ? "README.en.md"
    : `docs/en/${sourcePath.slice("docs/".length)}`;
  translationPaths.add(translationPath);
  const source = await readFile(resolve(root, sourcePath), "utf8");
  documents.set(sourcePath, source);
  if (!source.startsWith("<!-- canonical-language: zh-CN -->\n")) {
    errors.push(`${sourcePath}: missing canonical Chinese marker`);
  }
  let translation;
  try {
    translation = await readFile(resolve(root, translationPath), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    errors.push(`${sourcePath}: missing English translation ${translationPath}`);
    continue;
  }
  documents.set(translationPath, translation);
  const hash = createHash("sha256").update(source).digest("hex");
  const expected = `<!-- source: ${sourcePath}; source-sha256: ${hash} -->\n`;
  if (!translation.startsWith(expected)) {
    errors.push(`${translationPath}: stale or invalid source header; update/review the translation against ${sourcePath} before recording its SHA-256`);
  }
  const relativeTranslation = relative(dirname(sourcePath), translationPath);
  const relativeSource = relative(dirname(translationPath), sourcePath);
  if (!source.includes(`](${relativeTranslation})`)) {
    errors.push(`${sourcePath}: missing English language link`);
  }
  if (!translation.includes(`](${relativeSource})`)) {
    errors.push(`${translationPath}: missing canonical Chinese language link`);
  }
}

for (const name of await readdir(resolve(root, "docs/en"))) {
  if (name.endsWith(".md") && !translationPaths.has(`docs/en/${name}`)) {
    errors.push(`docs/en/${name}: orphan translation has no canonical source`);
  }
}

// Ignore fenced examples. Check local files and heading fragments without fetching websites.
const withoutFences = (text) => text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
const headings = (text) => {
  const seen = new Map();
  const ids = new Set();
  for (const match of withoutFences(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1].toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "").replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    ids.add(count ? `${base}-${count}` : base);
  }
  return ids;
};
for (const [path, text] of documents) {
  for (const match of withoutFences(text).matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) continue;
    const [file, fragment] = target.split("#", 2);
    const absolute = file ? resolve(root, dirname(path), decodeURIComponent(file)) : resolve(root, path);
    try {
      const info = await stat(absolute);
      if (fragment && info.isFile() && absolute.endsWith(".md")) {
        const content = documents.get(relative(root, absolute)) ?? await readFile(absolute, "utf8");
        if (!headings(content).has(decodeURIComponent(fragment))) {
          errors.push(`${path}: missing heading in ${target}`);
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      errors.push(`${path}: broken local link ${target}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation checks passed: ${sourcePaths.length} canonical Chinese documents and ${translationPaths.size} English translations.`);
}
