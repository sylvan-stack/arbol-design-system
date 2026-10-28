<script lang="ts">
  import { untrack } from 'svelte';
  import ElmaFrame from './ElmaFrame.svelte';
  import PinnedMessage from './PinnedMessage.svelte';
  import HistoryTree from './HistoryTree.svelte';
  import ResponseReader from './ResponseReader.svelte';
  import { ELMA_RESPONSE_FIXTURE } from '../fixtures/elma-response';
  import Composer from './Composer.svelte';
  import PermissionRequest from '../patterns/PermissionRequest.svelte';
  import Modal from '../patterns/Modal.svelte';
  import ConfirmAction from '../patterns/ConfirmAction.svelte';
  import CommandPalette from '../patterns/CommandPalette.svelte';
  import Notice from '../patterns/Notice.svelte';
  import Button from '../components/Button.svelte';
  let {
    empty = false,
    approval = false,
    history = false,
    routeFailure = false,
    failed = false,
    renameFailure = false,
    archiveRunning = false, archiveFailure = false, latest=false, latestEmpty=false, latestLoading=false, latestFailure=false,latestSelectionFailure=false, opening='none' as 'none'|'waiting'|'failed', attention=false,unknownAttention=false,reconnecting=false,stale=false,reimportOutcome='replaced' as 'replaced'|'copied'|'uncertain'|'refused'|'waiting',
  }: { empty?: boolean; approval?: boolean; history?: boolean;routeFailure?:boolean;failed?:boolean;renameFailure?:boolean;archiveRunning?:boolean;archiveFailure?:boolean;latest?:boolean;latestEmpty?:boolean;latestLoading?:boolean;latestFailure?:boolean;latestSelectionFailure?:boolean;opening?:'none'|'waiting'|'failed';attention?:boolean;unknownAttention?:boolean;reconnecting?:boolean;stale?:boolean;reimportOutcome?:'replaced'|'copied'|'uncertain'|'refused'|'waiting' } = $props();
  let noticeRows=$state(untrack(()=>[...(attention?[{id:'space',kind:'space_low',severity:'warning',message:'Fictional space warning: 8 GiB available.'},{id:'database_unreachable',kind:'database_unreachable',severity:'urgent',message:'The fictional database does not answer. Answers in progress go on.'}]:[]),...(unknownAttention?[{id:'__proto__',kind:'future_notice',severity:'warning',message:'An unfamiliar <literal> notice stays visible.'}]:[])]));
  let staleShown=$state(untrack(()=>stale)),importPending=$state(false),importProblem=$state('');const sourceRootName='Older Fixture Root';const continuedCopies=new Map<string,{title:string|null;draft:string;messages:string[]}>();
  function finishImport(copied=false){if(copied){continuedCopies.set('fictional-continued-copy',{title:storedTitle,draft,messages:[...messages]});draft='';}storedTitle=copied?'Fictional new copy':'Fictional updated history';messages=[...messages,'New messages from the fictional original Root'];current=messages.length-1;staleShown=false;importPending=false;latestOpen=false;actionNotice=copied?'Opened a new copy. The continued copy is kept.':'Chat updated from '+sourceRootName;}
  function bringOver(){if(importPending)return;importProblem='';if(reimportOutcome==='waiting'){importPending=true;return;}if(reimportOutcome==='uncertain'){const message='The import may have finished. Check the chat list before trying again.';if(latestOpen)latestSelectionProblem=message;else importProblem=message;return;}if(reimportOutcome==='refused'){importProblem='migration_unavailable: A fictional comparison failed.';noticeRows=[...noticeRows.filter(row=>row.id!=='migration_unavailable'),{id:'migration_unavailable',kind:'migration_unavailable',severity:'warning',message:'The original chats could not be checked. Saved chats are still available.'}];return;}finishImport(reimportOutcome==='copied');}
  let openingState=$state(untrack(()=>opening));
  let latestOpen=$state(untrack(()=>latest)),latestSelectionProblem=$state('');
  const latestRows=Array.from({length:12},(_,i)=>({id:String(i),label:'Fictional chat '+(i+1),detail:'sample · claude/fictional/model-a · completed · '+(i+1)+(i?' minutes ago':' minute ago')}));
  const archivedDrafts=new Map<string,string>();
  let quickOpen=$state(false),archiveConfirm=$state(false),archiveWaiting=$state(false);
  function quickAction(id:string){quickOpen=false;if(id==='rename')startRename();else if(id==='archive')archiveConfirm=true;else if(id==='reimport')bringOver();else actionNotice='Copy session ID selected in the fictional preview; clipboard unchanged.';}
  function archiveChat(){archiveConfirm=false;if(archiveFailure){actionNotice='fictional_failure: The local preview refused this archive.';return;}if(archiveRunning&&!archiveWaiting){archiveWaiting=true;return;}archiveWaiting=false;archivedDrafts.set('fictional-chat',draft);newRepository(repositories.find(row=>row.name===repository)?.folder??repositories[0].folder);actionNotice='Chat archived in the fictional preview; its saved Draft is kept.';}
  let messages = $state([
    'A fictional first prompt',
    'Compare the useful shared patterns',
    'Keep the interface familiar.',
  ]);
  let storedTitle=$state<string|null>(untrack(()=>empty?null:'A fictional conversation')),isOngoing=$state(true),actionNotice=$state(''),rename=$state<{value:string;busy:boolean;problem:string}|null>(null);
  function startRename(){if(!shown){actionNotice='Start a chat before renaming';return;}rename={value:storedTitle??'',busy:false,problem:''};}
  function saveRename(){if(!rename)return;if(renameFailure){rename.problem='fictional_failure: The local preview refused this rename.';return;}storedTitle=rename.value.trim()||null;rename=null;actionNotice='Title changed in the fictional preview.';}
  function toggleOngoing(){if(!shown)return;isOngoing=!isOngoing;actionNotice=isOngoing?'Marked ongoing':'Cleared ongoing';}
  let failureAction=$state('');
  let draft = $state(untrack(()=>reconnecting?'Fictional retained Draft':'')),
    composerOpen = $state(false),
    reader = $state<{ scrollToEdge: (edge: 'top' | 'bottom') => void }>();
  let current = $state(2),
    hasMessages = $state(false),
    historyOpen = $state(false);
  let newChatMode=$state(false),repository=$state('sample'),repoChange=$state<string|null>(null),repositoryNotice=$state('');
  const repositories=[{name:'sylvan-stack',folder:'/fictional/readonly'},{name:'sample',folder:'/fictional/readonly/sample'}];
  const repositoryDrafts=new Map<string,string>([['sample','Fictional repository Draft']]);
  $effect(() => {
    historyOpen = history;
  });
  const shown = $derived((!empty&&!newChatMode) || hasMessages);
  const count = $derived(shown ? messages.length : 0);
  let route=$state({driver:'claude',subscription:'fictional',model:'model-a',effort:'high'});
  let routeProblem=$state(untrack(()=>routeFailure?'Models could not be read: fictional Driver unavailable.':''));
  let routes=$state<{driver:string;subscription:string;unavailable?:string}[]>([{driver:'claude',subscription:'fictional'},{driver:'codex',subscription:'fictional'},{driver:'claude',subscription:'offline',unavailable:'needs attention'}]);
  function pickRoute(driver:string,subscription:string){route={driver,subscription,model:'model-a',effort:'high'};}
  function nextModel(){route={...route,model:route.model==='model-a'?'model-b':'model-a',effort:route.model==='model-a'?'medium':'high'};}
  function nextEffort(){route={...route,effort:route.effort==='high'?'medium':'high'};}
  function newRepository(folder:string){if(!shown)repositoryDrafts.set(repository,draft);repository=repositories.find(r=>r.folder===folder)?.name??'other';draft=repositoryDrafts.get(repository)??'';newChatMode=true;hasMessages=false;storedTitle=null;isOngoing=false;messages=[];current=0;repositoryNotice='';}
  function chooseRepository(folder:string){if(shown)repoChange=folder;else newRepository(folder);}
  function keys(event: KeyboardEvent) {
    if(event.defaultPrevented||document.querySelector('dialog[open]')||rename)return;
    if(event.ctrlKey&&event.shiftKey&&event.metaKey&&!event.altKey&&event.key.toLowerCase()==='c'){event.preventDefault();latestOpen=true;return;}
    if(event.key==='Enter'&&event.shiftKey&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();if(shown)quickOpen=true;else actionNotice='Start a chat before using chat actions';return;}
    if(event.key==='Backspace'&&event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey){event.preventDefault();if(shown)archiveConfirm=true;else actionNotice='Start a chat before archiving';return;}
    if(event.altKey&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&(event.key==='0'||event.code==='Digit0')){event.preventDefault();toggleOngoing();return;}
    if(event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&/^[12]$/.test(event.key)){event.preventDefault();newRepository(repositories[Number(event.key)-1].folder);return;}
    if(event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey){if(/^[1-3]$/.test(event.key)){const row=routes[Number(event.key)-1];if(!row.unavailable){event.preventDefault();pickRoute(row.driver,row.subscription);}}else if(event.key.toLowerCase()==='m'){event.preventDefault();nextModel();}else if(event.key==='Tab'){event.preventDefault();nextEffort();}return;}
    if (event.metaKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      historyOpen = !historyOpen;
    } else if (!historyOpen && event.metaKey && event.key === '[') {
      event.preventDefault();
      current = Math.max(0, current - 1);
    } else if (!historyOpen && event.metaKey && event.key === ']') {
      event.preventDefault();
      current = Math.min(count - 1, current + 1);
    }
  }
</script>

<svelte:window onkeydown={keys} />
<ElmaFrame
  fitted
  title={shown ? storedTitle||Array.from((messages[0]??'').split('\n')[0]).slice(0,80).join('')||'New Chat' : 'New Chat'}
  placeholder={shown&&!storedTitle}
  onrename={startRename}
  onquick={()=>quickOpen=true}
  {rename}
  onRenameInput={value=>{if(rename)rename.value=value;}}
  onRenameSave={saveRename}
  onRenameCancel={()=>rename=null}
  onongoing={shown?toggleOngoing:undefined}
  total={count}
  turn={current + 1}
  hasChat={shown}
  ongoing={shown&&isOngoing}
  {repository}
  {route}
  {repositories}
  onrepository={chooseRepository}
  {routes}
  onrefreshAccounts={()=>{routes=routes.map(row=>({...row,unavailable:undefined}));actionNotice='Public accounts refreshed in fictional preview.';}}
  onrefreshAccount={(driver,subscription)=>{routes=routes.map(row=>row.driver===driver&&row.subscription===subscription?{...row,unavailable:undefined}:row);pickRoute(driver,subscription);actionNotice='Sign-in status refreshed in fictional preview; no credential was requested.';}}
  {routeProblem}
  onretryRoute={()=>routeProblem=''}
  onroute={pickRoute}
  onmodel={nextModel}
  oneffort={nextEffort}
  inputTokens={shown ? 9100 : 0}
  outputTokens={shown ? 2700 : 0}
  onolder={() => (current = Math.max(0, current - 1))}
  onnewer={() => (current = Math.min(count - 1, current + 1))}
  onhistory={() => (historyOpen = true)}
>
  {#if reconnecting}<Notice message="Reconnecting…"/>{/if}
  {#each noticeRows as item(item.id)}<Notice identity={item.id} severity={item.severity} tone={item.severity==='urgent'?'urgent':'warning'} role={item.severity==='urgent'?'alert':'status'} message={item.message}/>{/each}
  {#if noticeRows.length}<Button label="Simulate warning closed" onclick={()=>noticeRows=noticeRows.filter(row=>row.id!=='space')}/>{/if}
  {#if staleShown}<Notice message={'New messages in '+sourceRootName}><Button label="Bring over again" disabled={importPending} onclick={bringOver}/></Notice>{/if}
  {#if importPending}<Notice message="Bringing over the latest messages…"><Button label="Complete bring-over in fixture" onclick={()=>finishImport()}/></Notice>{/if}
  {#if importProblem}<Notice tone="urgent" role="alert" message={importProblem}/>{/if}
  {#if actionNotice}<p role="status">{actionNotice}</p>{/if}
  {#if openingState==='waiting'}<Notice message="Saving Draft and opening the requested chat…"><Button label="Complete open in fixture" onclick={()=>{openingState='none';storedTitle='Fictional requested chat';actionNotice='Opened in fictional preview; no native app request consumed.';}}/></Notice>{:else if openingState==='failed'}<Notice role="alert" tone="urgent" message="fictional_failure: The requested chat is not available. Its routing target is retained."><Button label="Retry opening" onclick={()=>openingState='waiting'}/><Button label="Dismiss request" onclick={()=>openingState='none'}/></Notice>{/if}
  {#if latestOpen}<Modal title="Latest chats" initialFocus="button[data-command-row]" onclose={()=>latestOpen=false}>{#if latestLoading}<p role="status">Loading latest chats…</p>{:else if latestFailure}<p role="alert">fictional_failure: The local chat list could not be read.</p><button onclick={()=>actionNotice='Retry selected in the fictional preview.'}>Retry latest chats</button>{:else}{#if latestSelectionProblem}<Notice tone="urgent" role="alert" message={latestSelectionProblem}/>{/if}<CommandPalette title="Chats" emptyLabel="No other recent chats." searchable={false} rows={latestEmpty?[]:latestRows.map((row,i)=>({...row,...(staleShown&&i===0?{detail:row.detail+' · New messages in '+sourceRootName,action:{label:'Bring over again',disabled:importPending}}:{})}))} onaction={bringOver} onselect={id=>{if(latestSelectionFailure){latestSelectionProblem='fictional_failure: This chat cannot be read now.';return;}latestOpen=false;storedTitle=latestRows[Number(id)].label;actionNotice='Opened in fictional preview; no backend or native window used.';}}/>{/if}</Modal>{/if}
  {#if quickOpen}<Modal title="Quick actions" initialFocus="button[data-command-row]" onclose={()=>quickOpen=false}><CommandPalette title="Chat actions" searchable={false} numbered={false} rows={[{id:'rename',label:'Rename chat session',shortcut:'R'},{id:'archive',label:'Archive',shortcut:'A'},{id:'copy',label:'Copy session ID',shortcut:'C'},...(staleShown?[{id:'reimport',label:'Bring over again',disabled:importPending}]:[])]} onselect={quickAction}/></Modal>{/if}
  {#if archiveConfirm}<ConfirmAction title="Archive chat?" description="Save this Draft, stop a running answer first, and wait for its end to be saved before archiving. The chat and its messages are kept." action="Archive" oncancel={()=>archiveConfirm=false} onconfirm={archiveChat}/>{/if}
  {#if archiveWaiting}<p role="status">Waiting for the response to be saved…</p><button onclick={archiveChat}>Save stopped response in fixture</button><button onclick={()=>archiveWaiting=false}>Cancel archive</button>{/if}
  {#if repositoryNotice}<p role="status">{repositoryNotice}</p>{/if}
  {#if shown}<PinnedMessage
      text={messages[current]}
      index={current + 1}
      total={count}
      onolder={() => current--}
      onnewer={() => current++}
      onhistory={() => (historyOpen = true)}
    /><ResponseReader
      bind:this={reader}
      identity={'fictional:' + current}
      response={{
        blocks: ELMA_RESPONSE_FIXTURE,
        acceptedAt: '2026-10-27T09:30:00Z',
        startedAt: '2026-10-27T09:30:02Z',
        endedAt: '2026-10-27T09:30:12Z',
        ...(failed?{statusLabel:'Failed',error:{code:'rate_limited',message:'Fictional quota reached',retryAfterSeconds:3600},onretry:()=>failureAction='Retry selected in fixture; no agent was started.',oncontinue:()=>failureAction='Continue selected in fixture; no message was sent.'}:{}),
      }}
    />{/if}
  {#if failureAction}<p role="status">{failureAction}</p>{/if}
  {#if approval}<p class="boundary">
      Advanced Root proposal: tool approvals are outside First Sapling.
    </p>
    <PermissionRequest />{/if}
  <Composer
    firstSapling
    busy={importPending}
    empty={!shown}
    {repository}
    {route}
    context={shown?'chat:'+current:'new:'+repository}
    bind:value={draft}
    bind:expanded={composerOpen}
    onTop={() => reader?.scrollToEdge('top')}
    onBottom={() => reader?.scrollToEdge('bottom')}
    onsend={(text) => {
      messages = [...messages, text];
      current = messages.length - 1;
      hasMessages = true;
      draft = '';
      composerOpen = false;
    }}
  />
  {#if repoChange}<ConfirmAction title="Change repository?" description="The agent still gets every message of this chat, but no longer remembers what it read and ran before" action="Change repository" actionTone="primary" oncancel={()=>repoChange=null} onconfirm={()=>{repository=repositories.find(r=>r.folder===repoChange)?.name??'other';repositoryNotice='Repo changed to '+repository;repoChange=null;}}/>{/if}
  {#if historyOpen}<Modal
      title={`History · ${count} turns`}
      onclose={() => (historyOpen = false)}
      initialFocus="button[data-history-row]"
      ><HistoryTree
        items={messages.map((message, i) => ({ id: String(i), number: i + 1, message }))}
        selected={String(current)}
        onselect={(id) => {
          current = Number(id);
          historyOpen = false;
        }}
      /></Modal
    >{/if}
</ElmaFrame>

<style>
  .boundary {
    color: var(--warning);
    padding: 12px 24px;
  }
</style>
