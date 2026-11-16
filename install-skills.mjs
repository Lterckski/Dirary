#!/usr/bin/env node
// Installs a curated set of design, review and security skills for Claude Code.
// Usage (run from your app's repo root):
//   node install-skills.mjs                 -> installs into ./.claude/skills (this project only)
//   node install-skills.mjs --global        -> installs into ~/.claude/skills (all projects)
//   Optional add-ons: --with-hallmark  --with-apple-hig  --with-extras
// Requires: git and Node 18+. Works on Windows, macOS and Linux.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const target = args.has("--global") ? join(homedir(), ".claude", "skills") : join(process.cwd(), ".claude", "skills");

// [repo, path to the skill folder inside the repo, installed name]
const CORE = [
  // Design system + building screens
  ["dominikmartn/hue", ".", "hue"],
  ["Dammyjay93/interface-design", ".claude/skills/interface-design", "interface-design"],
  // Jakub Krehel: interface craft
  ...["better-colors", "better-typography", "better-layout", "better-ui", "better-writing",
      "better-accessibility", "better-interface", "interface-review", "state-machine",
      "variant", "build-design", "explain-interface"]
    .map((s) => ["jakubkrehel/skills", `skills/${s}`, s]),
  // Emil Kowalski: motion and polish
  ...["animate-expo", "animate", "choreograph", "gestures", "review-animations", "improve-animations",
      "find-animation-opportunities", "remove-animations", "animation-performance",
      "animation-vocabulary", "emil-design-eng", "apple-design", "break-ui", "pick-ui-library",
      "learn-taste", "ask-emil"]
    .map((s) => ["emilkowalski/skills", `skills/${s}`, s]),
  // Review + security
  ["Superfuture/design-review", "design-review/skills/design-review", "design-review"],
  ["cloudflare/security-audit-skill", "skills/security-audit", "security-audit"],
];

const OPTIONAL = [
  ...(args.has("--with-hallmark") ? [["nutlope/hallmark", "skills/hallmark", "hallmark"]] : []),
  // Renamed so it doesn't collide with Emil's "apple-design"
  ...(args.has("--with-apple-hig") ? [["dickwu/apple-design-skill", ".", "apple-hig"]] : []),
  ...(args.has("--with-extras")
    ? [["jakubkrehel/skills", "skills/afk", "afk"],
       ["emilkowalski/skills", "skills/prototype", "prototype"],
       ["emilkowalski/skills", "skills/mobile-native", "mobile-native"],
       ["emilkowalski/skills", "skills/ask-sonner", "ask-sonner"]]
    : []),
];

const work = mkdtempSync(join(tmpdir(), "skills-"));
const cloned = new Map();
function repoDir(repo) {
  if (!cloned.has(repo)) {
    const dir = join(work, repo.replace("/", "__"));
    console.log(`Cloning ${repo} ...`);
    execFileSync("git", ["clone", "--depth", "1", "-q", `https://github.com/${repo}.git`, dir], { stdio: "inherit" });
    cloned.set(repo, dir);
  }
  return cloned.get(repo);
}

const SKIP = new Set([".git", ".github", "examples", "docs", "README.md", "AGENTS.md", "GEMINI.md", ".cursorrules"]);
mkdirSync(target, { recursive: true });

for (const [repo, sub, name] of [...CORE, ...OPTIONAL]) {
  const src = join(repoDir(repo), sub);
  const dest = join(target, name);
  if (!existsSync(join(src, "SKILL.md"))) { console.warn(`  ! ${repo}/${sub} has no SKILL.md, skipped`); continue; }
  rmSync(dest, { recursive: true, force: true });
  // Whole-repo skills (sub === "."): copy only what the skill needs
  cpSync(src, dest, { recursive: true, filter: (p) => sub !== "." || !SKIP.has(p.slice(src.length + 1).split(/[\\/]/)[0]) });
  // Hue's SKILL.md links two example screens; keep just those
  if (name === "hue") for (const ex of ["ridge", "stint"]) cpSync(join(src, "examples", ex), join(dest, "examples", ex), { recursive: true });
  postProcess(name, join(dest, "SKILL.md"));
  console.log(`  ✓ ${name}`);
}

function postProcess(name, file) {
  let md = readFileSync(file, "utf8");
  if (name === "apple-hig") md = md.replace(/^name:\s*apple-design\s*$/m, "name: apple-hig");
  if (name === "design-review") {
    // Remove the anonymous usage ping and the paid "Pro" upsell (it also pings and uploads code)
    md = md.replace(/## 0\. Usage ping[\s\S]*?(?=\n## 1\.)/, "")
           .replace(/## 5\. Pro mode[\s\S]*?(?=\n## \d|$)/, "");
  }
  writeFileSync(file, md);
}

rmSync(work, { recursive: true, force: true });
console.log(`\nDone. Skills installed in ${target}. Restart Claude Code to load them.`);
