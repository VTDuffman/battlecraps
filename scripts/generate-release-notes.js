const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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
  versionMap.get(version).commits.push({ hash: commit.hash, message: msg, date: commit.date });
}

// Newest version first
const releaseNotes = [...versionMap.values()].reverse();

const outDir = path.resolve(__dirname, "../apps/web/src/lib");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "releaseNotes.json"),
  JSON.stringify(releaseNotes, null, 2)
);

console.log(
  `[release-notes] wrote ${releaseNotes.length} version(s) to apps/web/src/lib/releaseNotes.json`
);
