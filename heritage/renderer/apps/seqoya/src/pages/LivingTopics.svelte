<script lang="ts">
  import { onMount } from 'svelte'
  import { EntityChip, entityLinkTarget, type EntityUri } from '@arbol/design-system'
  import { api, type LivingTopic, type LivingTopicEntity } from '../api'

  let topics = $state<LivingTopic[]>([])
  let expanded = $state<Set<string>>(new Set())
  let loading = $state(true)
  let busy = $state<string | null>(null)
  let error = $state<string | null>(null)
  let editing = $state<string | null>(null)
  let title = $state('')
  let description = $state('')
  let initialTopicId = $state<string | null>(null)

  const errorText = (value: unknown) => value instanceof Error ? value.message : String(value)

  async function load() {
    loading = true
    error = null
    try {
      topics = await api.livingTopics.list()
      if (initialTopicId && topics.some((topic) => topic.living_topic_id === initialTopicId)) {
        expanded = new Set([...expanded, initialTopicId])
        requestAnimationFrame(() => document.getElementById(`living-topic-${initialTopicId}`)?.scrollIntoView({ block: 'nearest' }))
        initialTopicId = null
      }
    } catch (value) {
      error = errorText(value)
    } finally {
      loading = false
    }
  }

  onMount(() => {
    const linked = (event: Event) => {
      const detail = (event as CustomEvent).detail as { living_topic_id?: string }
      if (detail?.living_topic_id) expanded = new Set([...expanded, detail.living_topic_id])
      void load()
    }
    const opened = (event: Event) => {
      const detail = (event as CustomEvent).detail as { page?: string; living_topic_id?: string }
      if (detail?.page !== 'living-topics') return
      initialTopicId = detail.living_topic_id || null
      void load()
    }
    window.addEventListener('arbol-living-topic-entity-linked', linked)
    window.addEventListener('arbol-open', opened)
    const pending = (window as unknown as { __arbolPendingOpen?: { page?: string; living_topic_id?: string } }).__arbolPendingOpen
    if (pending?.page === 'living-topics') initialTopicId = pending.living_topic_id || null
    void load()
    return () => {
      window.removeEventListener('arbol-living-topic-entity-linked', linked)
      window.removeEventListener('arbol-open', opened)
    }
  })

  function resetForm() {
    editing = null
    title = ''
    description = ''
  }

  function edit(topic: LivingTopic) {
    editing = topic.living_topic_id
    title = topic.title
    description = topic.description
  }

  async function save() {
    if (!title.trim()) return
    busy = editing || 'create'
    error = null
    try {
      if (editing) await api.livingTopics.update(editing, title.trim(), description)
      else await api.livingTopics.create(title.trim(), description)
      resetForm()
      await load()
    } catch (value) {
      error = errorText(value)
    } finally {
      busy = null
    }
  }

  async function removeTopic(topic: LivingTopic) {
    if (!confirm(`Delete Living Topic “${topic.title}” and its links? The linked Entities will not be deleted.`)) return
    busy = topic.living_topic_id
    error = null
    try {
      await api.livingTopics.remove(topic.living_topic_id)
      if (editing === topic.living_topic_id) resetForm()
      expanded.delete(topic.living_topic_id)
      expanded = new Set(expanded)
      await load()
    } catch (value) {
      error = errorText(value)
    } finally {
      busy = null
    }
  }

  async function startChat(topic: LivingTopic) {
    busy = `chat:${topic.living_topic_id}`
    error = null
    try {
      const result = await api.livingTopics.startChat(topic.living_topic_id)
      const opened = await api.livingTopics.openChatSession(result.chat_session_id)
      if (opened?.ok === false) throw new Error(opened.error || 'Could not open the Chat Session in Elma')
      // The new session is linked to the topic by the RPC.
      await load()
    } catch (value) {
      error = errorText(value)
    } finally {
      busy = null
    }
  }

  async function linkEntity(topic: LivingTopic) {
    error = null
    try {
      const result = await api.livingTopics.showEntitySearch(topic.living_topic_id, topic.title)
      if (result.ok === false) throw new Error(result.error || 'Could not open Entity Search')
    } catch (value) {
      error = errorText(value)
    }
  }

  async function unlink(topic: LivingTopic, entity: LivingTopicEntity) {
    busy = `${topic.living_topic_id}:${entity.kind}:${entity.entity_id}`
    error = null
    try {
      await api.livingTopics.unlink(topic.living_topic_id, entity.kind, entity.entity_id)
      await load()
    } catch (value) {
      error = errorText(value)
    } finally {
      busy = null
    }
  }

  function toggle(topicId: string) {
    if (expanded.has(topicId)) expanded.delete(topicId)
    else expanded.add(topicId)
    expanded = new Set(expanded)
  }

  function validEntity(entity: LivingTopicEntity): entity is LivingTopicEntity & { uri: EntityUri } {
    return entity.lifecycle === 'active' && typeof entity.uri === 'string' && entity.uri.length > 0
  }
</script>

<div class="living-topics-page">
  <header>
    <div>
      <h2>Living Topics</h2>
      <p>Durable, evolving context hubs for concerns and subjects that persist or return in different forms.</p>
    </div>
    <button type="button" class="reload" onclick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
  </header>

  {#if error}<div class="error">{error}</div>{/if}

  <form class="topic-form" onsubmit={(event) => { event.preventDefault(); void save() }}>
    <div class="form-heading">{editing ? 'Edit Living Topic' : 'New Living Topic'}</div>
    <label>
      <span>Title</span>
      <input bind:value={title} placeholder="Intermittent authentication failures" maxlength="240" />
    </label>
    <label>
      <span>Description</span>
      <textarea bind:value={description} placeholder="What continuity should this topic preserve?" rows="3"></textarea>
    </label>
    <div class="form-actions">
      <button type="submit" class="primary" disabled={busy !== null || !title.trim()}>{busy === (editing || 'create') ? 'Saving…' : editing ? 'Save changes' : 'Create topic'}</button>
      {#if editing}<button type="button" onclick={resetForm} disabled={busy !== null}>Cancel</button>{/if}
    </div>
  </form>

  <div class="topic-list">
    {#each topics as topic (topic.living_topic_id)}
      {@const open = expanded.has(topic.living_topic_id)}
      <article id={`living-topic-${topic.living_topic_id}`} class:open use:entityLinkTarget={{ repo: 'Arbol', kind: 'living_topic', entityId: topic.living_topic_id, title: topic.title }}>
        <div class="topic-summary">
          <button class="disclosure" type="button" aria-label={open ? 'Collapse topic' : 'Expand topic'} aria-expanded={open} onclick={() => toggle(topic.living_topic_id)}>{open ? '⌄' : '›'}</button>
          <button class="topic-title" type="button" onclick={() => toggle(topic.living_topic_id)}>
            <strong>{topic.title}</strong>
            <span>{topic.entities.length} {topic.entities.length === 1 ? 'linked Entity' : 'linked Entities'}</span>
          </button>
          <div class="topic-actions">
            <button type="button" class="primary" disabled={busy === `chat:${topic.living_topic_id}`} onclick={() => startChat(topic)}>{busy === `chat:${topic.living_topic_id}` ? 'Starting…' : 'Chat'}</button>
            <button type="button" onclick={() => linkEntity(topic)}>Link Entity</button>
            <button type="button" onclick={() => edit(topic)}>Edit</button>
            <button type="button" class="danger" disabled={busy === topic.living_topic_id} onclick={() => removeTopic(topic)}>Delete</button>
          </div>
        </div>

        {#if open}
          <div class="topic-detail">
            {#if topic.description}<p class="description">{topic.description}</p>{/if}
            <div class="entities">
              {#each topic.entities as entity (`${entity.kind}:${entity.entity_id}`)}
                <div class="entity-row">
                  {#if validEntity(entity)}
                    <EntityChip uri={entity.uri} />
                  {:else}
                    <div class="unavailable"><span>{entity.title || 'Unavailable Entity'}</span><small>{entity.kind} · removed or unavailable</small></div>
                  {/if}
                  <button type="button" class="unlink" title="Unlink Entity" disabled={busy === `${topic.living_topic_id}:${entity.kind}:${entity.entity_id}`} onclick={() => unlink(topic, entity)}>Unlink</button>
                </div>
              {:else}
                <div class="empty-links">No Entities linked yet. Choose <strong>Link Entity</strong> and press Enter in Entity Search.</div>
              {/each}
            </div>
          </div>
        {/if}
      </article>
    {:else}
      <div class="empty">{loading ? 'Loading Living Topics…' : 'No Living Topics yet.'}</div>
    {/each}
  </div>
</div>

<style>
  .living-topics-page { box-sizing:border-box; min-height:100%; padding:var(--arbol-space-5); max-width:1100px; }
  header { display:flex; align-items:flex-start; gap:24px; margin-bottom:var(--arbol-space-4); }
  h2 { margin:0 0 4px; font-size:var(--arbol-type-title); }
  header p { margin:0; max-width:760px; color:var(--arbol-color-text-muted); font-size:var(--arbol-type-label); line-height:1.45; }
  button { cursor:pointer; border:1px solid var(--arbol-color-border); background:var(--arbol-color-surface-2); color:var(--arbol-color-text); border-radius:var(--arbol-radius-s); padding:7px 11px; font:500 var(--arbol-type-label)/1.2 var(--arbol-font-ui); }
  button:disabled { opacity:.55; cursor:default; }
  .reload { margin-left:auto; }
  .error { margin:0 0 12px; color:var(--arbol-color-danger,#e35); font-size:var(--arbol-type-label); }
  .topic-form { display:grid; grid-template-columns:minmax(220px,.7fr) minmax(300px,1.3fr) auto; align-items:end; gap:12px; margin-bottom:var(--arbol-space-5); padding:var(--arbol-space-4); border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-l); background:var(--arbol-color-surface-2); }
  .form-heading { grid-column:1/-1; font:600 var(--arbol-type-body)/1.3 var(--arbol-font-ui); }
  label { display:grid; gap:5px; color:var(--arbol-color-text-muted); font-size:11px; }
  input,textarea { box-sizing:border-box; width:100%; resize:vertical; border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-s); background:var(--arbol-color-bg); color:var(--arbol-color-text); padding:8px 10px; font:var(--arbol-type-label)/1.35 var(--arbol-font-ui); }
  .form-actions { display:flex; gap:7px; padding-bottom:1px; }
  .primary { background:var(--arbol-color-accent); color:var(--arbol-color-bg); border-color:transparent; }
  .topic-list { display:grid; gap:10px; }
  article { border:1px solid var(--arbol-color-border); border-radius:var(--arbol-radius-l); background:var(--arbol-color-surface-2); overflow:hidden; box-shadow:var(--arbol-shadow-1); }
  article.open { border-color:color-mix(in oklch,var(--arbol-color-accent) 42%,var(--arbol-color-border)); }
  .topic-summary { min-height:58px; display:flex; align-items:center; gap:8px; padding:8px 10px; }
  .disclosure { width:30px; height:30px; padding:0; border-color:transparent; background:transparent; font-size:21px; color:var(--arbol-color-text-muted); }
  .topic-title { display:grid; flex:1; min-width:0; gap:4px; padding:5px 3px; text-align:left; border:0; background:transparent; }
  .topic-title strong { overflow:hidden; text-overflow:ellipsis; font-size:var(--arbol-type-body); }
  .topic-title span { color:var(--arbol-color-text-muted); font:10px var(--arbol-font-mono); }
  .topic-actions { display:flex; gap:7px; }
  .danger,.unlink { color:var(--arbol-color-danger,#e35); }
  .topic-detail { border-top:1px solid var(--arbol-color-border); padding:14px 48px 16px; background:var(--arbol-color-bg); }
  .description { margin:0 0 13px; white-space:pre-wrap; color:var(--arbol-color-text-muted); font-size:var(--arbol-type-label); line-height:1.5; }
  .entities { display:grid; gap:7px; }
  .entity-row { display:flex; align-items:center; gap:10px; min-width:0; }
  .entity-row :global(.entity-chip),.entity-row :global(.ec) { flex:1; min-width:0; }
  .unlink { margin-left:auto; background:transparent; }
  .unavailable { display:grid; flex:1; gap:2px; color:var(--arbol-color-text-muted); }
  .unavailable small { font:10px var(--arbol-font-mono); }
  .empty-links,.empty { color:var(--arbol-color-text-muted); font-size:var(--arbol-type-label); }
  .empty { display:grid; place-items:center; min-height:140px; border:1px dashed var(--arbol-color-border); border-radius:var(--arbol-radius-l); }
  @media (max-width:850px) { .topic-form { grid-template-columns:1fr; }.form-actions { padding:0; }.topic-actions { flex-wrap:wrap; justify-content:flex-end; }.topic-detail { padding-left:20px; padding-right:20px; } }
</style>
