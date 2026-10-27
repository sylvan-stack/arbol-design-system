<script lang="ts">
 import {untrack} from 'svelte';
 import AskUserQuestion from '../sections/AskUserQuestion.svelte';
 import {pretty,type Answer,type QuestionView} from '../sections/elma-response';
 let {mode='single'}:{mode?:string}=$props();
 function fixture(mode:string):QuestionView {return{id:'fictional-question',askId:'fictional-ask',open:mode!=='answered',ask:mode==='unknown'?{kind:'future-kind',message:'A fictional future question'}:{callId:'fictional-task',questions:mode==='continue'?[{id:'ready',question:'Ready to continue?',multiple:false,options:[]}]:[{id:'branch',header:'Branch',question:'Which branch should I use?',multiple:false,options:[{label:'main',description:'Default branch'},{label:'work',description:'Work branch'}]},...(mode==='multi'?[{id:'checks',header:'Checks',question:'Which checks should I run?',multiple:true,options:[{label:'unit'},{label:'integration'}]},{id:'note',question:'I will keep the original files.',multiple:false,options:[]}]:[])]},...(['refused','answered'].includes(mode)?{answer:{type:'answers',answers:{branch:['main']}}}:{}),...(mode==='refused'?{problem:'The answer was not taken: fictional refusal',refusalPosition:4}:{})};}
 let question=$state(untrack(()=>fixture(mode))),submitted=$state<Answer>(),position=5;
 function send(answer:Answer){submitted=answer;question={...question,pending:true,problem:undefined};}
</script>
<AskUserQuestion firstSapling {question} onanswer={send}/>
{#if submitted}<pre aria-label="Fictional control payload">{pretty(submitted)}</pre>{/if}
{#if question.pending}<div class="row"><button onclick={()=>question={...question,answer:submitted,pending:false,answerPosition:++position}}>Record fictional answer</button><button onclick={()=>question={...question,pending:false,problem:'The answer was not taken: fictional refusal',refusalPosition:++position}}>Record fictional refusal</button></div>{/if}
{#if question.open}<button onclick={()=>question={...question,open:false,pending:false}}>Close fictional question</button>{/if}
