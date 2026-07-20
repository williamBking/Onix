# Onix Finance — Agent Notes

## admin-portal.html — CRITICAL, read before any edit

This file's entire real content lives inside a single line: a JSON-encoded string assigned to
a <script type="__bundler/template"> tag (currently around line 4641-4643).

RULES, NO EXCEPTIONS:
- NEVER use git merge or git cherry-pick on this file. Both have corrupted it in production
  even when the branch-level diff looked clean — corruption only appeared after GitHub's actual
  merge, not before, meaning branch-level verification is NOT sufficient on its own.
- The ONLY safe way to edit this file:
  1. Back up first (cp admin-portal.html admin-portal.html.bak-<timestamp>)
  2. Read the blob line, JSON.parse() it to get the real decoded content
  3. Find insertion/edit points via exact string search, verify each anchor occurs EXACTLY
     ONCE before touching it
  4. Use .replace(oldStr, () => newStr) — a FUNCTION, never a plain string — this codebase has
     literal $ characters that corrupt plain-string replace
  5. Re-encode via JSON.stringify(), splice back into that one line only
  6. Verify: line count unchanged, diff confined to one line, re-decoded content diff,
     node --check the extracted JS
- Keep changes to this file SMALL and SEPARATE. Do not bundle multiple unrelated changes
  (e.g. a bug fix + a new feature) into one edit pass — verify and ship one change at a time.
- After pushing, verify LIVE on the deployed site (hard-refresh, check browser console) before
  considering the task done.

## Editing admin-portal.html

This file's real content is **not** the visible HTML — it's a JSON-encoded
string inside a single `<script type="__bundler/template">` tag near the
end of the file (a "bundler" export format). Everything before that tag is
a loading shell that decodes and mounts this blob at runtime.

**Never edit this file with git merge, cherry-pick, rebase, or any other
line-based tool.** The entire template lives on one line; a line-based
merge cannot meaningfully resolve conflicts in it, and has silently
corrupted the file more than once.

**Only ever edit it via decode → edit → re-encode:**

1. Extract the JSON string from the `__bundler/template` script tag.
2. `JSON.parse()` it to get the real HTML/JS content.
3. Make the edit as a plain string replacement using a **function**
   replacer — `str.replace(old, () => newStr)` — never a string replacer.
   The content is full of `$`-prefixed currency-formatting code, and
   `String.replace()` treats `$&`, `$'`, `` $` `` etc. specially in a
   *string* replacement argument, silently splicing in huge unrelated
   chunks of the file. A function replacer inserts its return value
   verbatim with no special-pattern interpretation.
4. Re-encode with `JSON.stringify()`, **then escape nested `</script>` as
   `<\/script>`** before writing it back:
   ```js
   function safeStringifyForScriptTag(str) {
     return JSON.stringify(str).replace(/<\/script/gi, '<\\/script');
   }
   ```
   The decoded content has its own nested `<script>` tags (Chart.js CDN,
   i18n, the dashboard init script). `JSON.stringify()` does not escape
   forward slashes, so skipping this step leaves those nested closing
   tags as literal `</script>` — which a real browser's HTML parser
   treats as closing the *outer* `__bundler/template` tag at the first
   occurrence, silently truncating the blob to a few KB. This shipped
   broken once already. Local `JSON.parse()` on the raw line does **not**
   catch this, because it doesn't simulate a browser's HTML tag-boundary
   parsing — you have to check *how many `</script>` occur between the
   opening tag and where you claim the closing tag is*, or run a real
   `DOMParser` extraction.
5. Verify before trusting the edit:
   - Occurrence-count each anchor string in the decoded content before
     replacing (abort if it's not exactly 1).
   - `node --check` on every inline `<script>` block in the decoded
     content.
   - Confirm exactly one raw `</script>` exists between the opening
     `__bundler/template` tag and its true close, in the **final
     re-encoded file** (not just the decoded string).
   - Ideally, load the raw file text into a real browser's `DOMParser`
     and confirm the extracted `textContent` round-trips through
     `JSON.parse()` to the expected length — this is the only check that
     actually simulates what a real page load does.

CI enforces the JSON-validity and `node --check` parts of step 5
automatically via `.github/workflows/validate-admin-bundle.yml` (required
status check `validate-admin-bundle`, runs on the PR merge result) — but
don't rely on CI to catch what local verification should already catch.
