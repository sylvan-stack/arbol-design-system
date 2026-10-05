<script lang="ts">
  /* Visual verification harness for the Svelte design-system (Storybook's role
   * during the React→Svelte port). Renders every ported primitive inside the
   * shared UIShell so a headless screenshot eyeballs the whole kit at once. */
  import { UIShell, Button, Card, Tabs, Dropdown, Badge, KbdHint, Meter, Field, Dot,
    MultiSelect, Modal, EntityChip, EntityCard, BlueprintDoc, Frontmatter, MarkdownDoc } from '@arbol/design-system'

  // A runbook-shaped doc with `<!-- sources: … -->` comments — invisible until
  // the Sources toggle reveals them as chips (per-section, in place).
  const sampleSourcedDoc = `# Runbook: better-grep

## Why it exists

Grep-compatible head plus a Mycel semantic tail — the places grep misses and
the docs that explain them.

<!-- sources:
mycel:mycel/better_grep.py
arbol:renderer/packages/design-system/src/entities/entityUri.ts
-->

## Use

Run \`better-grep <pattern>\` exactly like grep; the tail appends ranked
semantic hits.

<!-- sources: mycel-docs/retrieval.md#Hybrid -->
`

  // A ticket-workspace document's frontmatter (see ~/Artifacts/jira/<KEY>/ticket.md)
  // for the generic metadata strip.
  const sampleFrontmatter = {
    role: 'authored',
    status: 'heartwood',
    key: 'DEMO-10009',
    url: 'https://jira.example.test/browse/DEMO-10009',
    assignee: 'Alex River',
    updated: '2026-07-08T07:57:27.187+0000',
    sources: ['jira-mirror:DEMO-10009.md'],
    generated: 'false',
  }

  // A trimmed real blueprint (Mycel `code-review.md`) for the contract renderer.
  const sampleBlueprint = `---
role: blueprint
name: code-review
summary: Review an MR (or branch) against its ticket with overlay-scoped retrieval
inputs:
  - name: mr
    type: string
    required: true
    description: MR URL, or repo+branch when reviewing before an MR exists
  - name: repo
    type: repo
    required: false
    description: inferred from the MR URL when omitted
outputs:
  - artifact: "findings in chat; persist to ~/Artifacts/{repo}/{ticket}-review.md only when asked"
    must: [every-finding-has-file-line, severity-ranked]
done_when: every changed file was examined or explicitly listed as skipped;
  each finding carries file:line, severity, and a concrete failure scenario
restrictions: [read-only]
recipe: inherit
default-recipe: bro-opus-max
---
# Blueprint: Code Review

## Goal

A review grounded in three contexts at once: the **diff**, the **ticket's
intent**, and the **repo as the branch sees it**.

## Process

1. **Context in**: fetch the MR and its ticket with \`--closure\`.
2. **Review from the worktree**, file by file, retrieving callers first.

## Quality bar

- No finding without a failure scenario; no "consider maybe" filler.
`

  let theme = $state('redwood')
  let tab = $state('one')
  let drop = $state('b')
  let repos = $state(['arbol'])
  let modal = $state(false)

  $effect(() => { document.documentElement.setAttribute('data-theme', theme) })
</script>

<UIShell title="Design System" {theme} onTheme={(id) => (theme = id)}>
  <div style="height:100%;overflow:auto;padding:var(--arbol-space-5);
              display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:var(--arbol-space-5);
              align-content:start;font:var(--arbol-type-body)/1.4 var(--arbol-font-ui);color:var(--arbol-color-text)">

    <Card>
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">Buttons</div>
      <div style="display:flex;gap:var(--arbol-space-2);flex-wrap:wrap">
        <Button kind="primary">{#snippet children()}Primary{/snippet}</Button>
        <Button>{#snippet children()}Default{/snippet}</Button>
        <Button kind="soft">{#snippet children()}Soft{/snippet}</Button>
        <Button kind="ghost">{#snippet children()}Ghost{/snippet}</Button>
        <Button disabled>{#snippet children()}Disabled{/snippet}</Button>
        <Button size="s">{#snippet children()}Small{/snippet}</Button>
      </div>
    </Card>

    <Card>
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">Badges &amp; status</div>
      <div style="display:flex;gap:var(--arbol-space-2);align-items:center;flex-wrap:wrap">
        <Badge kind="accent">{#snippet children()}accent{/snippet}</Badge>
        <Badge kind="ok">{#snippet children()}ok{/snippet}</Badge>
        <Badge kind="err">{#snippet children()}err{/snippet}</Badge>
        <Badge>{#snippet children()}mute{/snippet}</Badge>
        <Dot pulse />
        <Dot color="var(--arbol-color-warn)" />
        <Dot color="var(--arbol-color-err)" />
        <KbdHint k="⌘K" />
        <KbdHint k="⏎" />
      </div>
    </Card>

    <Card>
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">Tabs</div>
      <Tabs
        tabs={[{ id: 'one', label: 'Overview' }, { id: 'two', label: 'Details' }, { id: 'three', label: 'Logs' }]}
        active={tab}
        onSelect={(id) => (tab = id)}
      />
      <div style="color:var(--arbol-color-text-muted);padding:0 var(--arbol-space-2)">active: {tab}</div>
    </Card>

    <Card>
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">Form bits</div>
      <Field label="Provider" hint="Choose which IP backs this chat session">
        {#snippet children()}
          <Dropdown
            value={drop}
            options={[{ value: 'a', label: 'Claude' }, { value: 'b', label: 'Codex' }, { value: 'c', label: 'Cursor' }]}
            onChange={(v) => (drop = v)}
          />
        {/snippet}
      </Field>
    </Card>

    <Card>
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">Meters</div>
      <Meter title="Tokens" meter={{ percentUsed: 42, displayText: '42k / 100k' }} />
      <Meter title="Rate limit" meter={{ percentUsed: 78, displayText: '78%', resetInfo: 'resets in 2h' }} />
      <Meter title="Quota" meter={{ percentUsed: 95, displayText: 'almost full' }} />
    </Card>

    <Card>
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">Entities</div>
      <div style="display:flex;flex-direction:column;gap:var(--arbol-space-2)">
        <EntityChip uri="[arb:mr:mr-482:UG9zdGdyZXMgbWlncmF0aW9u]" />
        <EntityChip uri="[arb:cht:chat-1:UmVmYWN0b3IgaW50YWtlIHBoYXNl]" />
        <EntityChip uri="[arb:tic:ticket-1:RHJhZnQgZW50aXR5]" />
        <EntityCard
          uri="[arb:cmt:commit-1:cmVuYW1lIHNlc3Npb27ihpJjaGF0X3Nlc3Npb24=]"
          content={'**Commit:** `1fd12e8`\n\nRenames the canonical session field.'}
        />
      </div>
    </Card>

    <Card>
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">MultiSelect &amp; Modal</div>
      <MultiSelect
        options={[{ value: 'arbol', label: 'arbol' }, { value: 'mycel', label: 'mycel' }, { value: 'universe', label: 'universe' }]}
        selected={repos}
        onChange={(v) => (repos = v)}
      />
      <div style="margin-top:var(--arbol-space-3)">
        <Button kind="primary" onclick={() => (modal = true)}>{#snippet children()}Open modal{/snippet}</Button>
      </div>
    </Card>

    <Card style="grid-column:1 / -1">
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">Frontmatter — every document's YAML header as a metadata strip</div>
      <Frontmatter data={sampleFrontmatter} />
      <p style="margin:0;color:var(--arbol-color-text-muted)">The document body renders below the strip, exactly as before.</p>
    </Card>

    <Card style="grid-column:1 / -1">
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">Source Refs — hidden by default; the Sources toggle reveals clickable chips</div>
      <div style="height:340px;display:flex;flex-direction:column">
        <MarkdownDoc content={sampleSourcedDoc} title="tools/better-grep.md" />
      </div>
    </Card>

    <Card style="grid-column:1 / -1">
      <div style="font-weight:700;margin-bottom:var(--arbol-space-3)">BlueprintDoc — typed-contract rendering of a Blueprint .md</div>
      <BlueprintDoc content={sampleBlueprint} />
    </Card>
  </div>
</UIShell>

{#if modal}
  <Modal title="Confirm" subtitle="dialog demo" onClose={() => (modal = false)}>
    {#snippet children()}
      <div style="color:var(--arbol-color-text)">A focus-dimming modal — Esc, backdrop, or × dismiss.</div>
    {/snippet}
    {#snippet footer()}
      <Button onclick={() => (modal = false)}>{#snippet children()}Cancel{/snippet}</Button>
      <Button kind="primary" onclick={() => (modal = false)}>{#snippet children()}Confirm{/snippet}</Button>
    {/snippet}
  </Modal>
{/if}
