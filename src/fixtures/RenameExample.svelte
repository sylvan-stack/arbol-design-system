<script lang="ts">
 import {untrack} from 'svelte';
 import InlineRename from '../patterns/InlineRename.svelte';
 let {value='A fictional title',busy=false,problem=''}:{value?:string;busy?:boolean;problem?:string}=$props();
 let text=$state(untrack(()=>value)),notice=$state('');
</script>
<InlineRename label="Chat title" value={text} max={240} {busy} {problem} oninput={value=>text=value} onsave={()=>notice='Selected in fictional preview: '+(text.trim()||'(no title)')} oncancel={()=>notice='Canceled in fictional preview.'}/>
{#if notice}<p role="status">{notice}</p>{/if}
