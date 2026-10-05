<script lang="ts">
  import { EntityCard, InlineMarkdown, formatEntityUri } from '@arbol/design-system'
  import Composer from './Composer.svelte'
  import ContextStrip from './ContextStrip.svelte'

  type Scenario = 'new-chat' | 'existing-chat' | 'pinned-message'

  let { scenario = 'new-chat' }: { scenario?: Scenario } = $props()

  const inspectionUri = formatEntityUri({
    repo: 'Arbol',
    kind: 'artifact',
    entityId: 'storybook-turn-inspection-result',
    title: 'Turn inspection · OAuth callback timeout',
  })
  const inspectionContent = [
    '## Inspection result',
    '',
    '**Outcome:** Failed after 42.8 seconds',
    '',
    '**Finding:** The callback completed, but the agent waited for a second tool result that could never arrive.',
    '',
    '### Relevant events',
    '- `auth.exchange` completed successfully',
    '- `browser.wait` remained pending until timeout',
    '- No user-facing final answer was composed',
    '',
    '> Recommend a safe recovery path and preserve the successful exchange result.',
  ].join('\n')

  const newDraftRef = { current: 'Explain why this turn failed and suggest the safest fix.' }
  const existingDraftRef = { current: 'Does this inspection change your recommendation?' }
  const attachmentsRef = { current: [] }
  const inputRef = { current: null as HTMLTextAreaElement | null }
  let attachmentVisible = $state(true)
  let submitted = $state('')

  function sendNew() { submitted = newDraftRef.current }
  function sendExisting() { submitted = existingDraftRef.current }
</script>

{#snippet chatNote(removable: boolean, sent = false)}
  {#if attachmentVisible}
    <section class="chat-note" aria-label="Entity Card attached as Chat Note">
      <header class="chat-note-header">
        <span class="note-glyph" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6M8 13h8M8 17h5" />
          </svg>
        </span>
        <span class="note-label">Chat Note</span>
        <span class="note-purpose">{sent ? 'Context sent with this message' : 'Will be included as context'}</span>
        {#if removable}
          <button class="remove-note" type="button" aria-label="Remove Chat Note" title="Remove Chat Note" onclick={() => (attachmentVisible = false)}>×</button>
        {/if}
      </header>
      <EntityCard uri={inspectionUri} content={inspectionContent} contentFormat="markdown" />
    </section>
  {/if}
{/snippet}

{#snippet answerPreview()}
  <div class="answer-preview">
    <div class="answer-mark" aria-hidden="true"></div>
    <div>
      <div class="answer-kicker">ELMA</div>
      <p>The timeout is downstream of the successful token exchange. I would preserve that result and remove the redundant wait before retrying the final composition step.</p>
      <p class="muted-line">The attached inspection gives us enough evidence to narrow the change to the callback sequence.</p>
    </div>
  </div>
{/snippet}

<div class="preview">
  <div class="story-intro">
    <p class="eyebrow">Elma · Entity Card context</p>
    <h1>
      {scenario === 'new-chat'
        ? 'First message with a Chat Note'
        : scenario === 'existing-chat'
          ? 'Next message with a Chat Note'
          : 'Sent message with a Chat Note'}
    </h1>
    <p>
      {scenario === 'pinned-message'
        ? 'After sending, the same Entity Card stays visible with the pinned user message. See more reveals the exact context made available to the agent.'
        : 'The Entity Card sits outside the editable message so context is clearly attached rather than accidentally inserted into the prompt.'}
    </p>
  </div>

  <div class="chat-window">
    <header class="window-header">
      <div class="window-identity">
        <span class="elm-mark" aria-hidden="true">⌁</span>
        <div><strong>Elma Chat</strong><span>{scenario === 'new-chat' ? 'New Chat' : 'OAuth callback investigation'}</span></div>
      </div>
      <div class="window-status"><span></span> Ready</div>
    </header>

    {#if scenario === 'new-chat'}
      <main class="new-chat-main">
        <div class="composer-column">
          <ContextStrip repo="Mycel" ipLabel="Codex" model="claude-sonnet-4" thinking="medium" />
          <div class="attached-area">{@render chatNote(true)}</div>
          <Composer
            valueRef={newDraftRef}
            {attachmentsRef}
            large
            minRows={7}
            hint="⌘⏎ to Send"
            placeholder="Message Mycel…"
            onSend={sendNew}
            {inputRef}
            composerToken={11}
          />
        </div>
      </main>
    {:else if scenario === 'existing-chat'}
      <main class="existing-main">
        <div class="previous-prompt">
          <div><InlineMarkdown text="Review the OAuth callback implementation and identify the smallest safe change." /></div>
          <span>1 / 2</span>
        </div>
        {@render answerPreview()}
        <div class="existing-composer">
          <div class="composer-column compact-column">
            <div class="attached-area">{@render chatNote(true)}</div>
            <Composer
              valueRef={existingDraftRef}
              {attachmentsRef}
              minRows={3}
              hint="⌘⏎ to Send  ·  Esc to cancel"
              placeholder="Message Mycel…"
              onSend={sendExisting}
              {inputRef}
              composerToken={12}
            />
          </div>
        </div>
      </main>
    {:else}
      <main class="existing-main">
        <div class="pinned-with-note">
          <div class="pinned-content">
            <div class="attached-area pinned-card">{@render chatNote(false, true)}</div>
            <div class="sent-message"><InlineMarkdown text="Explain why this turn failed and suggest the safest fix." /></div>
          </div>
          <div class="message-actions"><button type="button">Edit</button><button type="button">Remove</button></div>
        </div>
        {@render answerPreview()}
        <div class="collapsed-composer">Press Enter to start new message <kbd>⏎</kbd></div>
      </main>
    {/if}
  </div>

  {#if submitted}
    <div class="send-toast" role="status">Story message sent: “{submitted}”</div>
  {/if}
</div>

<style>
  .preview {
    box-sizing: border-box;
    min-height: 100vh;
    padding: clamp(24px, 5vw, 64px);
    background:
      radial-gradient(circle at 50% -12rem, color-mix(in oklch, var(--arbol-color-accent-soft) 75%, transparent), transparent 38rem),
      var(--arbol-color-bg);
    color: var(--arbol-color-text);
    font-family: var(--arbol-font-ui);
  }
  .story-intro { width: min(100%, 980px); margin: 0 auto 24px; }
  .story-intro .eyebrow { margin: 0 0 7px; color: var(--arbol-color-text-muted); font: 650 var(--arbol-type-label)/1.2 var(--arbol-font-mono); letter-spacing: .07em; text-transform: uppercase; }
  .story-intro h1 { margin: 0; font-size: clamp(25px, 3.2vw, 38px); line-height: 1.1; letter-spacing: -.035em; }
  .story-intro > p:last-child { max-width: 760px; margin: 10px 0 0; color: var(--arbol-color-text-muted); line-height: 1.55; }
  .chat-window { width: min(100%, 980px); height: min(690px, calc(100vh - 210px)); min-height: 550px; margin: 0 auto; display: grid; grid-template-rows: auto 1fr; overflow: hidden; border: 1px solid var(--arbol-color-border); border-radius: 16px; background: var(--arbol-color-bg); box-shadow: 0 24px 70px color-mix(in oklch, black 22%, transparent), var(--arbol-shadow-1); }
  .window-header { display: flex; align-items: center; justify-content: space-between; min-height: 54px; padding: 0 18px; border-bottom: 1px solid var(--arbol-color-border); background: color-mix(in oklch, var(--arbol-color-surface) 75%, var(--arbol-color-bg)); }
  .window-identity { display: flex; align-items: center; gap: 10px; }
  .window-identity > div { display: grid; gap: 2px; }
  .window-identity strong { font-size: 13px; }
  .window-identity span { color: var(--arbol-color-text-muted); font: 500 10px/1.2 var(--arbol-font-mono); }
  .elm-mark { width: 29px; height: 29px; display: grid; place-items: center; border-radius: 9px; background: var(--arbol-color-accent-soft); color: var(--arbol-color-accent); font-size: 21px; }
  .window-status { display: flex; align-items: center; gap: 7px; color: var(--arbol-color-text-muted); font: 600 10px/1 var(--arbol-font-mono); }
  .window-status > span { width: 6px; height: 6px; border-radius: 50%; background: var(--arbol-color-ok); box-shadow: 0 0 0 3px color-mix(in oklch, var(--arbol-color-ok) 15%, transparent); }
  .new-chat-main { min-height: 0; display: grid; place-items: center; padding: clamp(22px, 5vw, 48px); background: radial-gradient(100% 70% at 50% 0, var(--arbol-color-accent-soft), transparent 60%); }
  .composer-column { width: min(100%, var(--arbol-text-area-max-width)); }
  .compact-column { margin: 0 auto; }
  .attached-area { margin-bottom: var(--arbol-space-3); }
  .chat-note { overflow: hidden; padding: 9px; border: 1px solid color-mix(in oklch, var(--arbol-color-accent) 34%, var(--arbol-color-border)); border-radius: calc(var(--arbol-radius-m) + 3px); background: linear-gradient(145deg, color-mix(in oklch, var(--arbol-color-accent-soft) 46%, var(--arbol-color-surface)), var(--arbol-color-surface)); box-shadow: inset 0 1px color-mix(in oklch, white 7%, transparent); }
  .chat-note-header { display: flex; align-items: center; min-height: 22px; gap: 7px; padding: 0 3px 8px; }
  .note-glyph { width: 20px; height: 20px; display: grid; place-items: center; color: var(--arbol-color-accent); }
  .note-label { color: var(--arbol-color-text); font: 700 10px/1 var(--arbol-font-mono); letter-spacing: .055em; text-transform: uppercase; }
  .note-purpose { min-width: 0; color: var(--arbol-color-text-muted); font: 500 10px/1 var(--arbol-font-ui); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .remove-note { all: unset; width: 22px; height: 22px; margin-left: auto; display: grid; place-items: center; border-radius: 6px; color: var(--arbol-color-text-muted); cursor: pointer; font-size: 17px; }
  .remove-note:hover { background: var(--arbol-color-surface-2); color: var(--arbol-color-text); }
  .existing-main { min-height: 0; display: grid; grid-template-rows: auto 1fr auto; }
  .previous-prompt, .pinned-with-note { border-bottom: 1px solid var(--arbol-color-border); background: color-mix(in oklch, var(--arbol-color-surface) 68%, var(--arbol-color-bg)); }
  .previous-prompt { display: flex; align-items: flex-start; gap: 16px; justify-content: space-between; padding: 13px 17px; color: var(--arbol-color-text); font: 400 var(--arbol-type-body)/1.5 var(--arbol-font-ui); }
  .previous-prompt > span { flex-shrink: 0; color: var(--arbol-color-text-muted); font: 600 10px/1.4 var(--arbol-font-mono); }
  .answer-preview { min-height: 0; display: grid; grid-template-columns: 3px minmax(0, 1fr); gap: 18px; align-content: start; overflow: auto; padding: clamp(26px, 5vw, 52px) clamp(26px, 7vw, 72px); }
  .answer-mark { height: 74px; border-radius: 99px; background: linear-gradient(var(--arbol-color-accent), transparent); }
  .answer-kicker { margin-bottom: 12px; color: var(--arbol-color-accent); font: 700 10px/1 var(--arbol-font-mono); letter-spacing: .08em; }
  .answer-preview p { max-width: 700px; margin: 0 0 15px; line-height: 1.65; }
  .answer-preview .muted-line { color: var(--arbol-color-text-muted); }
  .existing-composer { border-top: 1px solid var(--arbol-color-border); padding: 14px clamp(18px, 5vw, 46px); background: var(--arbol-color-bg); }
  .pinned-with-note { display: flex; align-items: flex-start; gap: 16px; padding: 13px 17px; }
  .pinned-content { min-width: 0; flex: 1; }
  .pinned-card { margin-bottom: 11px; }
  .sent-message { color: var(--arbol-color-text); white-space: pre-wrap; overflow-wrap: anywhere; font: 400 var(--arbol-type-body)/1.55 var(--arbol-font-ui); }
  .message-actions { flex-shrink: 0; display: flex; gap: 9px; }
  .message-actions button { all: unset; color: var(--arbol-color-text-muted); cursor: pointer; font: 600 var(--arbol-type-label)/1 var(--arbol-font-ui); }
  .message-actions button:hover { color: var(--arbol-color-text); }
  .collapsed-composer { display: flex; align-items: center; justify-content: center; gap: 10px; border-top: 1px solid var(--arbol-color-border); padding: 16px; color: var(--arbol-color-text-muted); font: 500 var(--arbol-type-body)/1 var(--arbol-font-ui); }
  kbd { padding: 3px 6px; border: 1px solid var(--arbol-color-border); border-radius: 5px; background: var(--arbol-color-surface); box-shadow: 0 1px var(--arbol-color-border); font: 600 10px/1 var(--arbol-font-mono); }
  .send-toast { position: fixed; right: 22px; bottom: 22px; max-width: min(440px, calc(100vw - 44px)); padding: 11px 14px; border: 1px solid var(--arbol-color-border); border-radius: var(--arbol-radius-m); background: var(--arbol-color-surface); box-shadow: var(--arbol-shadow-2); color: var(--arbol-color-text); font: 500 var(--arbol-type-label)/1.4 var(--arbol-font-ui); }
  @media (max-width: 640px) {
    .preview { padding: 18px 10px; }
    .story-intro { padding: 0 6px; }
    .story-intro > p:last-child { font-size: 13px; }
    .chat-window { height: 670px; min-height: 0; border-radius: 12px; }
    .note-purpose { display: none; }
    .answer-preview { padding: 25px 18px; }
    .message-actions { display: none; }
  }
</style>
