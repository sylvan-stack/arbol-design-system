<script lang="ts">
  import type { SlackMessage } from './slackApi'

  let {
    message,
    time,
    copied = false,
    compact = false,
    spotlighted = false,
    spotlightBusy = false,
    oncopy,
    ongraft,
    onspotlight,
  }: {
    message: SlackMessage
    time: (timestamp: number) => string
    copied?: boolean
    compact?: boolean
    spotlighted?: boolean
    spotlightBusy?: boolean
    oncopy?: (message: SlackMessage) => void | Promise<void>
    ongraft?: (message: SlackMessage) => void
    onspotlight?: (message: SlackMessage) => void | Promise<void>
  } = $props()

  const authorName = $derived(message.author_name || message.author_external_id || 'Unknown')
  const content = $derived(message.deleted_at
    ? 'Message deleted'
    : (message.rendered_content ?? message.content))
</script>

<div class="slack-avatar" class:small={compact}>
  {#if message.author_avatar_url}
    <img src={message.author_avatar_url} alt="" />
  {:else}
    {authorName.slice(0, 1).toUpperCase()}
  {/if}
</div>
<div class="slack-message-body">
  {#if oncopy || ongraft || onspotlight}
    <div class="slack-message-actions">
      {#if onspotlight}
        <button
          class="slack-to-spotlight"
          class:active={spotlighted}
          disabled={spotlightBusy}
          title={spotlighted ? 'Remove this Slack message from Spotlight' : 'Add this Slack message to Spotlight'}
          aria-label={spotlighted ? 'Remove Slack message from Spotlight' : 'Add Slack message to Spotlight'}
          onclick={() => onspotlight?.(message)}
        >{spotlightBusy ? (spotlighted ? 'Removing…' : 'Adding…') : spotlighted ? 'Remove Spotlight' : 'Spotlight'}</button>
      {/if}
      {#if ongraft}
        <button
          class="slack-to-graft"
          title="Wrap this Slack message in a Graft"
          aria-label="Wrap Slack message in a Graft"
          onclick={() => ongraft?.(message)}
        >To Graft</button>
      {/if}
      {#if oncopy}
        <button
          class="slack-copy-link"
          class:copied
          title={copied ? 'Copied' : 'Copy link'}
          aria-label={copied ? 'Slack message link copied' : 'Copy Slack message link'}
          onclick={() => oncopy?.(message)}
        >{copied ? 'Copied' : 'Copy link'}</button>
      {/if}
    </div>
  {/if}
  <div class="slack-message-meta">
    <b>{authorName}</b>
    <time>{time(message.occurred_at)}</time>
    {#if message.edited_at}<span>(edited)</span>{/if}
  </div>
  <div class:deleted={!!message.deleted_at} class="slack-message-text">{content}</div>
</div>
