#!/usr/bin/env node
'use strict';

// admin-portal.html's real content lives inside a single JSON-encoded
// <script type="__bundler/template"> blob, decoded at runtime by the
// bootstrap script embedded in the same file. Git merges (and any
// line/string-based tooling) can silently corrupt that blob without
// leaving conflict markers - the file was corrupted twice this way, both
// times passing local review. This script:
//   1. Extracts the __bundler/template blob and confirms it's valid JSON.
//   2. Extracts every checkable inline <script> tag from the DECODED
//      content and runs each through `node --check`.
// admin-portal.html must only ever be edited via a decode -> edit ->
// re-encode process - never git merge, cherry-pick, or other line-based
// tooling.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const FILE = process.argv[2] || 'admin-portal.html';

function fail(msg) {
  console.log(`::error file=${FILE}::${msg}`);
  console.error('FAILED: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`${FILE} not found (looked in ${process.cwd()}).`);
}

const raw = fs.readFileSync(FILE, 'utf8');

const openTag = '<script type="__bundler/template">';
const openIdx = raw.indexOf(openTag);
if (openIdx === -1) {
  fail(
    `Could not find ${JSON.stringify(openTag)} in ${FILE}. Either the bundle ` +
    'structure changed or the tag was lost/corrupted.'
  );
}

const contentStart = openIdx + openTag.length;
const closeIdx = raw.indexOf('</script>', contentStart);
if (closeIdx === -1) {
  fail('Found the __bundler/template opening tag but no matching </script> closing tag.');
}

const blob = raw.slice(contentStart, closeIdx).trim();

let decoded;
try {
  decoded = JSON.parse(blob);
} catch (e) {
  fail(
    `__bundler/template blob is not valid JSON: ${e.message}\n` +
    'This is exactly the failure mode seen twice before: the file was ' +
    'edited with git merge/cherry-pick or a raw string replace (which can ' +
    'hit a $-pattern or escaping edge case), corrupting the encoded blob. ' +
    'admin-portal.html must ONLY be edited via the decode/edit/re-encode ' +
    'process, never git merge or line-based tools - see CLAUDE.md.'
  );
}

if (typeof decoded !== 'string' || decoded.length < 100) {
  fail(`Decoded __bundler/template blob looks wrong (type=${typeof decoded}, length=${decoded && decoded.length}).`);
}

console.log(`✓ __bundler/template blob is valid JSON (${decoded.length} chars decoded).`);

// Extract every inline <script> tag with no `src` (nothing external to
// check) and a plain-JS (or absent) `type`, skipping non-JS types like
// text/babel/text/jsx that node --check can't parse as-is.
const CHECKABLE_TYPES = new Set(['', 'text/javascript', 'application/javascript']);
const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/g;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-bundle-check-'));
let checked = 0;
let skipped = 0;
const failures = [];

try {
  let match;
  while ((match = scriptRe.exec(decoded)) !== null) {
    const attrs = match[1] || '';
    const body = match[2] || '';

    if (/\bsrc\s*=/.test(attrs)) { skipped++; continue; }
    const typeMatch = attrs.match(/type\s*=\s*"([^"]*)"/);
    const type = typeMatch ? typeMatch[1] : '';
    if (!CHECKABLE_TYPES.has(type)) { skipped++; continue; }
    if (!body.trim()) { skipped++; continue; }

    const tmpFile = path.join(tmpDir, `script-${checked}.js`);
    fs.writeFileSync(tmpFile, body);
    try {
      execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
    } catch (e) {
      failures.push({
        index: checked,
        error: (e.stderr ? e.stderr.toString() : e.message).trim(),
        preview: body.trim().slice(0, 160).replace(/\s+/g, ' '),
      });
    }
    checked++;
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (failures.length) {
  for (const f of failures) {
    console.log(
      `::error file=${FILE}::Inline <script> #${f.index} in the decoded bundle failed ` +
      `node --check:\n${f.error}\n  starts with: ${f.preview}...`
    );
  }
  fail(`${failures.length} of ${checked} checked inline <script> block(s) failed syntax checking.`);
}

console.log(`✓ All ${checked} checkable inline <script> block(s) passed node --check (${skipped} skipped: external src or non-JS type).`);
