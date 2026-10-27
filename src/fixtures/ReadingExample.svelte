<script lang="ts">
 import {untrack} from 'svelte';
 import ResponseReader from '../sections/ResponseReader.svelte';
 import type { ResponseBlock } from '../sections/elma-response';
 let {streaming=false,theme='redwood',scale=1}:{streaming?:boolean;theme?:string;scale?:number}=$props();
 let running=$state(untrack(()=>streaming)),other=$state(false),count=$state(0);
 $effect(()=>{running=streaming;});
 let blocks=$state<ResponseBlock[]>([{id:'thinking',kind:'thinking',text:Array.from({length:35},(_,i)=>`Fictional reasoning paragraph ${i+1}. The fixture compares details before answering.`).join('\n\n')},{id:'answer',kind:'text',text:Array.from({length:45},(_,i)=>`Fictional answer paragraph ${i+1}. This is local example text for reading and navigation.`).join('\n\n')}]);
</script>
<div class="fixture" data-theme={theme} style:--elma-content-scale={scale}>
 <div class="controls"><button onclick={()=>{count++;blocks=[...blocks,{id:'append:'+count,kind:'text',text:'Fictional appended text '+count+'\n\n'+('More fictional content. '.repeat(80))}];}}>Append fictional text</button><button onclick={()=>running=false}>Mark complete</button><button onclick={()=>other=!other}>Show other Exchange</button></div>
 <ResponseReader identity={other?'fictional:other':'fictional:original'} response={{blocks:other?[{id:'other',kind:'text',text:'The other fictional answer.'}]:blocks,streaming:running,statusLabel:running?'Responding…':'Completed'}}/>
</div>
<style>.fixture{height:650px;display:flex;flex-direction:column;background:var(--canvas);color:var(--text);min-width:0}.controls{display:flex;gap:8px;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--border)}button{background:var(--panel);color:var(--text);border:1px solid var(--border);padding:6px 10px;border-radius:4px;font:inherit}</style>
