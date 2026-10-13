const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Player-facing release notes: only feature and fix commits are shown
// (case-insensitive "feat…" / "fix…" prefix, e.g. "feat:", "fix(ui):",
// "FEAT:", "FIX:"). Docs, chores, tests and merge commits are hidden.
const VISIBLE = /^(feat|fix)\b/i;

// Internal tooling players should never see, even when committed as feat/fix.
const HIDDEN = [/FB-028/i, /developer mode/i, /\bdev (runs?|panel|mode|dice|routes?|scenarios?)\b/i];

const isPlayerFacing = (msg) => VISIBLE.test(msg) && !HIDDEN.some((re) => re.test(msg));

const raw = execSync(
  'git log --reverse --pretty=format:"%H|%s|%ad" --date=short',
  { encoding: "utf-8" }
).trim();

const commits = raw
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [hash, subject, date] = line.split("|");
    return { hash, subject, date };
  });

let major = 0;
let minor = 0;
let patch = 0;

const versionMap = new Map();

// Version numbers are computed over ALL commits so they stay stable; only the
// commits shown inside each version are filtered.
for (const commit of commits) {
  const msg = commit.subject ?? "";

  if (/feat|FB-/.test(msg)) {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  const version = `v${major}.${minor}.${patch}`;
  if (!versionMap.has(version)) {
    versionMap.set(version, { version, date: commit.date, commits: [] });
  }
  if (isPlayerFacing(msg)) {
    versionMap.get(version).commits.push({ hash: commit.hash, message: msg, date: commit.date });
  }
}

// Newest version first; versions with nothing player-facing are dropped, so the
// in-game version number and NEW badge only move when players get something.
const releaseNotes = [...versionMap.values()].filter((v) => v.commits.length > 0).reverse();

const outDir = path.resolve(__dirname, "../apps/web/src/lib");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "releaseNotes.json"),
  JSON.stringify(releaseNotes, null, 2)
);

console.log(
  `[release-notes] wrote ${releaseNotes.length} version(s) to apps/web/src/lib/releaseNotes.json`
);
