<script lang="ts">
  import HunkReview from './HunkReview.svelte'
  import type { HunkReviewSnapshot } from './types'

  type HunkDefinition = {
    id: string
    label: string
    description: string
    hunk: HunkReviewSnapshot
  }

  const definitions: HunkDefinition[] = [
    {
      id: 'vs-master',
      label: 'Worktree vs master',
      description: 'feature/hunks → master · Includes committed and uncommitted worktree changes.',
      hunk: {
        hunk_id: 'hun-worktree-master',
        title: 'OAK-482: Add durable Hunk reviews',
        files: [
          { path: 'renderer/packages/design-system/src/hunks/HunkReview.svelte', patch: `diff --git a/renderer/packages/design-system/src/hunks/HunkReview.svelte b/renderer/packages/design-system/src/hunks/HunkReview.svelte
index 20dfd41..b2c7589 100644
--- a/renderer/packages/design-system/src/hunks/HunkReview.svelte
+++ b/renderer/packages/design-system/src/hunks/HunkReview.svelte
@@ -8,8 +8,11 @@
   let selectedIndex = $state(0)
   let selectedFile = $derived(hunk.files[selectedIndex] ?? null)
   let blocks = $derived(selectedFile ? parseHunkPatch(selectedFile.patch) : [])
+  let selectedDefinition = $state('vs-master')

-  function pathFor(file: HunkReviewFile | null) { return file?.path ?? '' }
+  function pathFor(file: HunkReviewFile | null) {
+    return file?.path ?? ''
+  }
   function belongsToFile(note: HunkReviewComment, file: HunkReviewFile | null) {
     if (!file || !note.position) return false
     return note.position.new_path === file.path || note.position.old_path === file.path
@@ -25,6 +28,7 @@
 <div class="hunk-review">
   {#if !hunk.files.length}<p class="empty">{emptyMessage}</p>
   {:else}<aside aria-label="Changed files"><h2>Files</h2>
+    <span class="file-count">{hunk.files.length} changed</span>
     {#each hunk.files as file, index}<button class:active={selectedIndex === index}>{pathFor(file)}</button>{/each}
   </aside>
 ` },
          { path: 'daemons/core/arbol_core/rpc/hunks.py', patch: `diff --git a/daemons/core/arbol_core/rpc/hunks.py b/daemons/core/arbol_core/rpc/hunks.py
index 17ac622..2b1f5cb 100644
--- a/daemons/core/arbol_core/rpc/hunks.py
+++ b/daemons/core/arbol_core/rpc/hunks.py
@@ -79,6 +79,10 @@ async def _create(ctx, req):
     params = req.params or {}
     definition = str(params.get("definition") or "")
     repo, target = await walkthrough._resolve(str(params.get("target_id") or ""))
+    if definition not in HUNK_DEFINITIONS:
+        raise git.WalkthroughError(
+            "invalid_hunk_definition",
+            "Choose a supported Hunk definition",
+        )
     snapshot, provenance, title = await _capture(repo, target, definition)
 ` },
        ],
        discussions: [
          { id: 'discussion-architecture', notes: [{ id: 'note-1', author: { name: 'Maya Chen' }, created_at: '2026-03-18T10:30:00Z', body: 'Could we keep definition selection in the host? The renderer should receive only a durable snapshot.', position: { new_path: 'renderer/packages/design-system/src/hunks/HunkReview.svelte', new_line: 11 } }] },
          { id: 'discussion-api', notes: [{ id: 'note-2', author: { name: 'Noah Williams' }, created_at: '2026-03-18T11:02:00Z', body: 'This validation makes the capture contract explicit. Nice.', resolved: true, position: { new_path: 'daemons/core/arbol_core/rpc/hunks.py', new_line: 84 } }] },
          { id: 'discussion-general', notes: [{ id: 'note-3', author: { name: 'Maya Chen' }, created_at: '2026-03-18T12:11:00Z', body: 'Please add the MR definition once mirror discussions are mapped.' }] },
        ],
      },
    },
    {
      id: 'vs-parent',
      label: 'Worktree vs parent',
      description: 'feature/hunks → feature/change-walkthrough · Includes committed and uncommitted worktree changes.',
      hunk: {
        hunk_id: 'hun-worktree-parent',
        title: 'Add durable Hunk review surface',
        files: [
          { path: 'renderer/apps/elma/src/change-walkthrough/ChangeWalkthroughPage.svelte', patch: `diff --git a/renderer/apps/elma/src/change-walkthrough/ChangeWalkthroughPage.svelte b/renderer/apps/elma/src/change-walkthrough/ChangeWalkthroughPage.svelte
index 4c4d552..c40ac3a 100644
--- a/renderer/apps/elma/src/change-walkthrough/ChangeWalkthroughPage.svelte
+++ b/renderer/apps/elma/src/change-walkthrough/ChangeWalkthroughPage.svelte
@@ -112,7 +112,11 @@
   <header class="walkthrough-header">
     <h1>Change Walkthrough</h1>
-    <button onclick={refresh}>Refresh</button>
+    <div class="actions">
+      <button onclick={refresh}>Refresh</button>
+      <button onclick={() => createHunk('vs-parent')}>Create Hunk</button>
+    </div>
   </header>
 ` },
          { path: 'renderer/packages/design-system/src/index.ts', patch: `diff --git a/renderer/packages/design-system/src/index.ts b/renderer/packages/design-system/src/index.ts
index 7a606cd..3a9fef1 100644
--- a/renderer/packages/design-system/src/index.ts
+++ b/renderer/packages/design-system/src/index.ts
@@ -106,3 +106,7 @@ export type { ParsedChain, ChainMeta, ChainCell, ChainCellKind } from './markdo
+// Captured code-review snapshots. HunkReview only renders supplied snapshot data.
+export { default as HunkReview } from './hunks/HunkReview.svelte'
+export { parseHunkPatch, filesFromCapturedPatch } from './hunks/types'
+export type { HunkReviewSnapshot, HunkReviewFile } from './hunks/types'
 ` },
        ],
        discussions: [{ id: 'parent-thread', notes: [{ id: 'note-parent', author: { name: 'Avery Patel' }, created_at: '2026-03-17T15:45:00Z', body: 'This is a useful narrower review when the parent branch already contains related changes.', position: { new_path: 'renderer/apps/elma/src/change-walkthrough/ChangeWalkthroughPage.svelte', new_line: 117 } }] }],
      },
    },
    {
      id: 'uncommitted',
      label: 'Uncommitted changes',
      description: 'feature/hunks · Staged, unstaged, and untracked files relative to the current commit.',
      hunk: {
        hunk_id: 'hun-uncommitted',
        title: 'feature/hunks — uncommitted changes',
        files: [
          { path: 'renderer/packages/design-system/src/hunks/mockDefinition.ts', new_file: true, patch: `diff --git a/renderer/packages/design-system/src/hunks/mockDefinition.ts b/renderer/packages/design-system/src/hunks/mockDefinition.ts
new file mode 100644
index 0000000..2cc327f
--- /dev/null
+++ b/renderer/packages/design-system/src/hunks/mockDefinition.ts
@@ -0,0 +1,5 @@
+export const HUNK_DEFINITIONS = [
+  'vs-master',
+  'vs-parent',
+  'uncommitted',
+  'last-commit',
+]
` },
          { path: 'README.md', patch: `diff --git a/README.md b/README.md
index 238d72a..7f6c5a1 100644
--- a/README.md
+++ b/README.md
@@ -42,3 +42,4 @@ Review flow
 - Open a live comparison.
 - Explicitly save the snapshot as a Hunk.
+- Sync replaces stale snapshot content in place.
 ` },
        ],
      },
    },
    {
      id: 'last-commit',
      label: 'Last commit',
      description: 'Capture the latest commit against its parent. Title comes from the commit subject.',
      hunk: {
        hunk_id: 'hun-last-commit',
        title: 'Render GitLab discussions inline in Hunk review',
        files: [
          { path: 'renderer/apps/oaken/src/tasks/MergeRequestReview.svelte', patch: `diff --git a/renderer/apps/oaken/src/tasks/MergeRequestReview.svelte b/renderer/apps/oaken/src/tasks/MergeRequestReview.svelte
index b747b43..6e7dacc 100644
--- a/renderer/apps/oaken/src/tasks/MergeRequestReview.svelte
+++ b/renderer/apps/oaken/src/tasks/MergeRequestReview.svelte
@@ -33,6 +33,9 @@
   const hunk = $derived({
     title: mergeRequest.title,
     files,
+    discussions: artifact.discussions,
   })
+
+  // HunkReview renders the snapshot without fetching GitLab.
 ` },
        ],
        discussions: [{ id: 'commit-thread', notes: [{ id: 'note-commit', author: { name: 'Jordan Kim' }, created_at: '2026-03-16T09:15:00Z', body: 'The shared component makes the local and MR review surfaces consistent.', resolved: true, position: { new_path: 'renderer/apps/oaken/src/tasks/MergeRequestReview.svelte', new_line: 36 } }] }],
      },
    },
  ]

  let selectedId = $state(definitions[0].id)
  let selected = $derived(definitions.find((definition) => definition.id === selectedId) ?? definitions[0])
</script>

<section class="story" aria-label="Hunk Review component preview">
  <header>
    <div>
      <p class="eyebrow">Durable review snapshot</p>
      <h1>{selected.hunk.title}</h1>
      <p class="description">{selected.description}</p>
    </div>
    <label>
      <span>Hunk Definition</span>
      <select bind:value={selectedId} aria-label="Hunk Definition">
        {#each definitions as definition}<option value={definition.id}>{definition.label}</option>{/each}
      </select>
    </label>
  </header>
  <div class="review"><HunkReview hunk={selected.hunk} /></div>
</section>

<style>
.story{height:100vh;min-height:660px;display:grid;grid-template-rows:auto minmax(0,1fr);background:var(--arbol-color-bg);color:var(--arbol-color-text)}header{display:flex;align-items:end;justify-content:space-between;gap:24px;padding:20px 24px;border-bottom:1px solid var(--arbol-color-border)}.eyebrow{margin:0 0 5px;color:var(--arbol-color-accent);font:600 11px var(--arbol-font-ui);letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font:600 19px var(--arbol-font-ui)}.description{margin:6px 0 0;color:var(--arbol-color-text-muted);font:13px var(--arbol-font-ui)}label{display:grid;gap:5px;font:600 11px var(--arbol-font-ui);color:var(--arbol-color-text-muted)}select{min-width:210px;border:1px solid var(--arbol-color-border);border-radius:6px;padding:7px 9px;background:var(--arbol-color-surface);color:var(--arbol-color-text);font:13px var(--arbol-font-ui)}.review{min-height:0}@media(max-width:680px){header{align-items:start;flex-direction:column}select{width:100%}}
</style>
