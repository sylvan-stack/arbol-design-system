<script lang="ts">
  import EntityCard from './EntityCard.svelte'
  import EntityChip from './EntityChip.svelte'
  import EntityRichText from './EntityRichText.svelte'
  import { formatEntityUri, type ParsedEntityUri } from './entityUri'
  import { ENTITIES, type EntityKind } from './data'
  import type { EntityCardResolver } from './card'

  type StoryMode = 'all' | 'chips' | 'cards'

  let {
    mode = 'all',
    resolverDelayMs = 700,
  }: {
    mode?: StoryMode
    resolverDelayMs?: number
  } = $props()

  const artifactUri = formatEntityUri({
    repo: 'Arbol',
    kind: 'artifact',
    entityId: '903b027c-4af2-46db-a47a-7763e45ae8d8',
    title: 'Turn Composition',
  })
  const toolCallsUri = formatEntityUri({
    repo: 'Mycel',
    kind: 'artifact',
    entityId: '9b6984cc-db34-4a84-b948-0eaefbea916a',
    title: 'Tool Calls',
  })
  const ticketUri = formatEntityUri({
    repo: 'Mycel',
    kind: 'ticket',
    entityId: '1fe4c727-bcce-4373-9b95-390ead08a39a',
    title: 'Remove Feature Toggle',
  })
  const unicodeUri = formatEntityUri({
    repo: 'Universe',
    kind: 'glossary',
    entityId: 'glossary-entity-uri',
    title: 'Entity URI — 日本語の説明',
  })
  const longUri = formatEntityUri({
    repo: 'Blueprint',
    kind: 'requirement',
    entityId: 'req-entity-card-context',
    title: 'Entity Card Content must be identical to the context made available to the agent',
  })
  const invalidUri = '[arb:unknown:missing-title:not-base64]'
  const kindExamples: Record<EntityKind, string> = {
    ticket: 'Remove Feature Toggle',
    graft: 'Entity references rollout',
    mr: 'Composer entity chip support',
    commit: 'Render entity URIs inline',
    slack: 'Platform foundations thread',
    telegram: 'Telegram project update',
    telegram_conversation: 'Telegram project chat',
    email: 'Design review follow-up',
    confluence: 'Architecture decision record',
    comunicado: 'Approval required',
    chat: 'Entity components discussion',
    artifact: 'Turn Composition',
    requirement: 'Visible context matches agent context',
    invariant: 'Entity identity remains stable',
    glossary: 'Entity URI',
    secret: 'Deployment credential',
    flyer: 'Entity references overview',
    branch: 'feature/entity-chips',
    living_topic: 'Intermittent authentication failures',
    mandate: 'Release Steward activation',
  }
  const allKindUris = ENTITIES.ORDER.map((kind, index) => ({
    kind,
    meta: ENTITIES.meta(kind),
    uri: formatEntityUri({ repo: 'Arbol', kind, entityId: `storybook-${index + 1}`, title: kindExamples[kind] }),
  }))

  let navigationMessage = $state('No navigation requested yet.')

  const previewNavigator = async (entity: ParsedEntityUri) => {
    navigationMessage = `Would go to ${entity.kind}:${entity.entityId}`
  }

  function wait(delay: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, delay)
      signal.addEventListener('abort', () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
  }

  const inspectionResolver: EntityCardResolver = async (entity, { signal }) => {
    await wait(resolverDelayMs, signal)
    return `## Turn inspection result\n\n**Entity:** ${entity.title}\n\n- **Status:** Passed with observations\n- **Session:** Chat · Entity components\n- **Turn:** 42\n\n### Observation\n\nThe resolved content is one Markdown string. This exact semantic content can be displayed to the user and supplied to the agent as context.`
  }

  const failingResolver: EntityCardResolver = async (_entity, { signal }) => {
    await wait(Math.min(resolverDelayMs, 500), signal)
    throw new Error('The example resolver could not load this entity.')
  }

  const persistedMarkdown = `## Context snapshot\n\nThis content was resolved when the attachment was created and can be reused without another request.\n\n- Entity URI is persisted with the attachment\n- Content is visible under **See more**\n- The same content is sent to the agent`

  const persistedPlain = `Repository: Mycel\nDecision: Remove the obsolete feature toggle\nOwner: Platform Foundations\nStatus: Ready for implementation`
</script>

<div class="entity-workshop">
  <header class="workshop-header">
    <div>
      <p class="eyebrow">Design system · Entity references</p>
      <h1>Entity Chip &amp; Entity Card</h1>
      <p class="intro">Shipping Svelte components rendered from complete Entity URIs. Switch Storybook themes to review every state against the full token ladder.</p>
    </div>
    <div class="contract" aria-label="Entity URI format">
      <span>Entity URI</span>
      <code>[repo:kind:id:title-base64]</code>
    </div>
  </header>

  {#if mode === 'all' || mode === 'chips'}
    <section class="workshop-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Compact, request-free reference</p>
          <h2>Entity Chip</h2>
        </div>
        <p>Only the decoded title is visible. Hold <kbd>⌘</kbd> and click a valid Chip to exercise the story navigator.</p>
      </div>

      <div class="kind-spectrum" aria-label="Every Entity Kind">
        {#each allKindUris as example (example.kind)}
          <div class="kind-sample">
            <span class="sample-label">{example.meta.label} · {example.meta.tag}</span>
            <EntityChip uri={example.uri} navigate={previewNavigator} />
          </div>
        {/each}
      </div>

      <div class="chip-board chip-states">
        <div class="sample">
          <span class="sample-label">Artifact · Mycel</span>
          <EntityChip uri={toolCallsUri} navigate={previewNavigator} />
        </div>
        <div class="sample">
          <span class="sample-label">Ticket · Mycel</span>
          <EntityChip uri={ticketUri} navigate={previewNavigator} />
        </div>
        <div class="sample">
          <span class="sample-label">UTF-8 title</span>
          <EntityChip uri={unicodeUri} navigate={previewNavigator} />
        </div>
        <div class="sample narrow">
          <span class="sample-label">Long title · constrained</span>
          <EntityChip uri={longUri} navigate={previewNavigator} />
        </div>
        <div class="sample">
          <span class="sample-label">Malformed reference</span>
          <EntityChip uri={invalidUri} navigate={previewNavigator} />
        </div>
      </div>
      <div class="composer-demo">
        <span class="sample-label">Composer and pinned-message projection</span>
        <div class="composer-surface">
          Please compare <EntityRichText text={`the ticket ${ticketUri} with ${artifactUri}.`} />
        </div>
        <code class="raw-source">{`Please compare the ticket ${ticketUri} with ${artifactUri}.`}</code>
        <p>The UI lifts valid URIs into Chips. The draft and submitted message retain the exact raw string shown below.</p>
      </div>

      <output class="navigation-output" aria-live="polite">{navigationMessage}</output>
    </section>
  {/if}

  {#if mode === 'all' || mode === 'cards'}
    <section class="workshop-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Inspectable context</p>
          <h2>Entity Card</h2>
        </div>
        <p>Cards start with the URI title and reveal either persisted content or a use-case-specific resolver result.</p>
      </div>

      <div class="card-board">
        <div class="card-sample">
          <span class="sample-label">Persisted Markdown · collapsed</span>
          <EntityCard uri={artifactUri} content={persistedMarkdown} />
        </div>

        <div class="card-sample">
          <span class="sample-label">Persisted plain text · expanded</span>
          <EntityCard uri={ticketUri} content={persistedPlain} contentFormat="plain" initiallyExpanded />
        </div>

        <div class="card-sample">
          <span class="sample-label">Lazy Markdown resolver</span>
          <EntityCard uri={toolCallsUri} resolve={inspectionResolver} />
        </div>

        <div class="card-sample">
          <span class="sample-label">Resolver error and retry</span>
          <EntityCard uri={unicodeUri} resolve={failingResolver} />
        </div>

        <div class="card-sample">
          <span class="sample-label">No expanded content</span>
          <EntityCard uri={longUri} />
        </div>

        <div class="card-sample">
          <span class="sample-label">Malformed reference</span>
          <EntityCard uri={invalidUri} content="This content must not make an invalid reference valid." />
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .entity-workshop {
    box-sizing: border-box;
    min-height: 100vh;
    padding: clamp(24px, 5vw, 64px);
    background:
      radial-gradient(circle at 92% 2%, var(--arbol-color-accent-soft), transparent 28rem),
      var(--arbol-color-bg);
    color: var(--arbol-color-text);
    font-family: var(--arbol-font-ui);
  }
  .workshop-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--arbol-space-6);
    max-width: 1120px;
    margin: 0 auto var(--arbol-space-6);
    padding-bottom: var(--arbol-space-5);
    border-bottom: 1px solid var(--arbol-color-border);
  }
  h1, h2, p { margin: 0; }
  h1 {
    margin-top: var(--arbol-space-2);
    font-size: clamp(26px, 4vw, 42px);
    line-height: 1.05;
    letter-spacing: -0.035em;
  }
  h2 { margin-top: 3px; font-size: 20px; line-height: 1.2; }
  .eyebrow, .sample-label {
    color: var(--arbol-color-text-muted);
    font: 600 var(--arbol-type-label)/1.2 var(--arbol-font-mono);
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }
  .intro {
    max-width: 660px;
    margin-top: var(--arbol-space-3);
    color: var(--arbol-color-text-muted);
    font-size: var(--arbol-type-body);
    line-height: 1.55;
  }
  .contract {
    flex: none;
    display: grid;
    gap: 6px;
    color: var(--arbol-color-text-muted);
    font: 600 var(--arbol-type-label)/1.2 var(--arbol-font-ui);
  }
  .contract code {
    padding: 8px 10px;
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-s);
    background: var(--arbol-color-surface);
    color: var(--arbol-color-text);
    font-family: var(--arbol-font-mono);
  }
  .workshop-section {
    max-width: 1120px;
    margin: 0 auto var(--arbol-space-6);
    padding: clamp(18px, 3vw, 28px);
    border: 1px solid var(--arbol-color-border);
    border-radius: var(--arbol-radius-l);
    background: color-mix(in oklch, var(--arbol-color-surface) 92%, transparent);
    box-shadow: var(--arbol-shadow-2);
  }
  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--arbol-space-5);
    margin-bottom: var(--arbol-space-5);
  }
  .section-heading > p {
    max-width: 520px;
    color: var(--arbol-color-text-muted);
    font-size: var(--arbol-type-body);
    line-height: 1.5;
  }
  kbd {
    padding: 1px 5px;
    border: 1px solid var(--arbol-color-border);
    border-radius: 4px;
    background: var(--arbol-color-surface-2);
    color: var(--arbol-color-text);
    font-family: var(--arbol-font-mono);
  }
  .kind-spectrum {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--arbol-space-3); margin-bottom: var(--arbol-space-5);
  }
  .kind-sample {
    display: grid; align-content: center; justify-items: start; gap: var(--arbol-space-3); min-width: 0; min-height: 78px; padding: var(--arbol-space-3);
    border: 1px solid var(--arbol-color-hairline); border-radius: var(--arbol-radius-m);
    background: radial-gradient(circle at 10% 15%, var(--arbol-color-accent-soft), transparent 65%), var(--arbol-color-bg);
  }
  .chip-board, .card-board {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--arbol-space-3);
  }
  .sample, .card-sample {
    min-width: 0;
    padding: var(--arbol-space-4);
    border: 1px solid var(--arbol-color-hairline);
    border-radius: var(--arbol-radius-m);
    background: var(--arbol-color-bg);
  }
  .sample {
    display: flex;
    min-height: 72px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--arbol-space-3);
  }
  .sample.narrow > :global(.entity-chip) { max-width: 230px; }
  .card-sample { display: grid; align-content: start; gap: var(--arbol-space-3); }
  .composer-demo { display:grid;gap:var(--arbol-space-3);margin-top:var(--arbol-space-5);padding:var(--arbol-space-4);border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-bg); }
  .composer-surface { padding:var(--arbol-space-4);border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface);color:var(--arbol-color-text);font:400 var(--arbol-type-body)/1.6 var(--arbol-font-ui); }
  .raw-source { display:block;overflow-wrap:anywhere;white-space:pre-wrap;color:var(--arbol-color-text-muted);font:500 var(--arbol-type-label)/1.45 var(--arbol-font-mono); }
  .composer-demo > p { color:var(--arbol-color-text-muted);font-size:var(--arbol-type-body); }
  .navigation-output {
    display: block;
    margin-top: var(--arbol-space-3);
    color: var(--arbol-color-text-muted);
    font: 500 var(--arbol-type-label)/1.4 var(--arbol-font-mono);
  }
  @media (max-width: 760px) {
    .entity-workshop { padding: var(--arbol-space-4); }
    .workshop-header, .section-heading { align-items: flex-start; flex-direction: column; }
    .contract { width: 100%; }
    .contract code { overflow-x: auto; }
    .kind-spectrum {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--arbol-space-3); margin-bottom: var(--arbol-space-5);
  }
  .kind-sample {
    display: grid; align-content: center; justify-items: start; gap: var(--arbol-space-3); min-width: 0; min-height: 78px; padding: var(--arbol-space-3);
    border: 1px solid var(--arbol-color-hairline); border-radius: var(--arbol-radius-m);
    background: radial-gradient(circle at 10% 15%, var(--arbol-color-accent-soft), transparent 65%), var(--arbol-color-bg);
  }
  .chip-board, .card-board { grid-template-columns: 1fr; }
  }
</style>
