<script lang="ts">
  import Composer from './Composer.svelte'
  import { formatEntityUri } from '@arbol/design-system'

  const artifact = formatEntityUri({ repo: 'Arbol', kind: 'artifact', entityId: 'storybook-artifact', title: 'Turn Composition' })
  const ticket = formatEntityUri({ repo: 'Mycel', kind: 'ticket', entityId: 'storybook-ticket', title: 'Remove Feature Toggle' })
  const valueRef = { current: `Compare ${ticket} with ${artifact}, then recommend the safest rollout.` }
  const attachmentsRef = { current: [] }
  const inputRef = { current: null as HTMLTextAreaElement | null }
  let submitted = $state('Nothing sent yet.')

  function send() { submitted = valueRef.current }
</script>

<div class="preview">
  <p class="eyebrow">Elma · Rich Composer</p>
  <h1>Pasted Entity URIs become Chips</h1>
  <p class="intro">Edit the sentence or paste another valid URI. The visual editor uses Entity Chips while its source value remains plain text.</p>
  <Composer
    {valueRef}
    {attachmentsRef}
    large
    minRows={6}
    hint="⌘⏎ to preview submitted agent text"
    placeholder="Paste an Entity URI…"
    onSend={send}
    {inputRef}
    composerToken={1}
  />
  <section>
    <span>Exact string sent to the agent</span>
    <code>{submitted}</code>
  </section>
</div>

<style>
  .preview { box-sizing:border-box;min-height:100vh;padding:clamp(24px,6vw,72px);background:radial-gradient(circle at 50% 0,var(--arbol-color-accent-soft),transparent 32rem),var(--arbol-color-bg);color:var(--arbol-color-text);font-family:var(--arbol-font-ui); }
  .eyebrow,section span { color:var(--arbol-color-text-muted);font:600 var(--arbol-type-label)/1.2 var(--arbol-font-mono);letter-spacing:.06em;text-transform:uppercase; }
  h1 { max-width:720px;margin:8px auto 10px;font-size:clamp(28px,4vw,44px);letter-spacing:-.04em; }
  .eyebrow,.intro { max-width:720px;margin-left:auto;margin-right:auto; }
  .intro { margin-bottom:28px;color:var(--arbol-color-text-muted);line-height:1.55; }
  section { display:grid;gap:10px;max-width:720px;margin:28px auto 0;padding:16px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface); }
  code { white-space:pre-wrap;overflow-wrap:anywhere;color:var(--arbol-color-text);font:500 var(--arbol-type-label)/1.5 var(--arbol-font-mono); }
</style>
