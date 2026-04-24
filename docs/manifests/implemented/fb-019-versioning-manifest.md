# Implementation Manifest: FB-019 Versioning and Release Notes

## Step 1: Configuration & Ignore Files
**Goal:** Ensure the auto-generated release notes JSON is ignored by Git and Claude so it doesn't cause commit conflicts or pollute the context window.
**Files:**
- `@.gitignore`
- `@.claudeignore`

**Prompt:**
Update the ignore files to exclude the auto-generated release notes artifact. Add `apps/web/src/lib/releaseNotes.json` to both `@.gitignore` and `@.claudeignore`. Do not modify any existing rules in these files.

## Step 2: Build Pipeline Script & Package Hooks
**Goal:** Create the SemVer calculation script with correct git parsing, and hook it into both build and dev processes to prevent Vite crashes.
**Files:**
- `@scripts/generate-release-notes.js` (Create this file)
- `@package.json` (Root package.json)
- `@apps/web/package.json`

**Prompt:**
Create a Node script at `@scripts/generate-release-notes.js`. It must use `child_process.execSync` to run `git log --reverse --pretty=format:"%H|%s|%ad" --date=short` (Note the --reverse flag).
Calculate SemVer starting at v0.0.0. Process commits sequentially:
1. If the message starts with or contains `feat` or `FB-`, increment Minor and reset Patch to 0.
2. If it contains `fix`, `chore`, `KI-`, or if it doesn't match anything else (fallback), increment Patch.
3. Group commits by resulting version.
4. Use `path.resolve` and `fs.mkdirSync(dir, { recursive: true })` to ensure the `apps/web/src/lib` directory exists, then write the array of version objects to `apps/web/src/lib/releaseNotes.json` with the newest version at index 0.

After creating the script, update the root `@package.json` to add `"prebuild": "node scripts/generate-release-notes.js"`. Then, update `@apps/web/package.json` to add `"predev": "node ../../scripts/generate-release-notes.js"` so the JSON is generated before Vite starts locally.

## Step 3: Frontend Components (UI & State)
**Goal:** Create the Version Display and Modal, ensuring safe version comparison and state management.
**Files:**
- `@apps/web/src/components/VersionDisplay.tsx` (Create this file)
- `@apps/web/src/components/ReleaseNotesModal.tsx` (Create this file)

**Prompt:**
Create `@apps/web/src/components/ReleaseNotesModal.tsx`. It accepts `isOpen` and `onClose` props. Import `apps/web/src/lib/releaseNotes.json`. Render a scrollable timeline. The top item (index 0) is the current version: display it prominently with its formatted commit messages. Map the rest as historical entries.

Create `@apps/web/src/components/VersionDisplay.tsx`. Import the same JSON. It should render the latest version text as a clickable button. Use `useEffect` to check `localStorage.getItem('battlecraps_last_seen_version')`. 
Important: Because standard string comparison fails on semver (e.g., "v0.10.0" vs "v0.9.0"), simply check if `localStorage` value `!==` the latest version string. If they don't match, show a "NEW" indicator dot/badge.
Clicking the component should `setItem` the latest version to `localStorage`, clear the badge state locally, and open the `ReleaseNotesModal`. Manage the modal's `isOpen` state within this component.

## Step 4: Integration
**Goal:** Mount the newly created system on the Title Lobby Screen.
**Files:**
- `@apps/web/src/components/TitleLobbyScreen.tsx`

**Prompt:**
Update `@apps/web/src/components/TitleLobbyScreen.tsx`. Import `<VersionDisplay />` and place it cleanly in the UI (like a bottom corner). Ensure it does not overlap the existing "Press Any Button to Play" prompt or other lobby controls. Ensure the styling blends with the existing screen aesthetic.

## Step 3.1: Enhance "New Version" Indicator
**Goal:** Make the new version alert highly prominent by increasing its size, altering the text, and adding a glowing pulse animation.
**Files:**
- `@apps/web/src/components/VersionDisplay.tsx`

**Prompt:**
Update `@apps/web/src/components/VersionDisplay.tsx`. Modify the rendering logic for when a new version is detected. Remove the separate "NEW" dot/badge. Instead:
1. Change the button text to prepend "New - " before the version string (e.g., "New - v1.0.0").
2. Apply conditional Tailwind classes so the entire clickable element is 50% larger when a new version is active. You can achieve this cleanly by applying `scale-150` (be sure to set the correct transform origin, e.g., `origin-bottom-right`, so it doesn't scale off-screen).
3. Add a continuous glowing and pulsating effect using Tailwind's `animate-pulse` and an arbitrary text-shadow class (e.g., `[text-shadow:_0_0_12px_currentColor]`). 
Ensure that once clicked and the `localStorage` state updates, the component smoothly drops the text prefix, scale, and animation classes, reverting to the standard subtle version display.