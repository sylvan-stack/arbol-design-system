<script lang="ts">
  import Button from '../components/Button.svelte';
  import TextArea from '../components/TextArea.svelte';
  let answer = $state('Comfortable');
  let other = $state('');
  let submitted = $state(false);
</script>

<section class="panel stack" aria-label="Question">
  <h2>Which density should this workspace use?</h2>
  <p class="muted">You can change this later in preferences.</p>
  {#each ['Comfortable', 'Compact', 'Custom'] as option}<label class="row"
      ><input
        type="radio"
        name="density-answer"
        value={option}
        bind:group={answer}
        disabled={submitted}
      />{option}</label
    >{/each}{#if answer === 'Custom'}<TextArea label="Your preference" bind:value={other} />{/if}
  <div>
    <Button
      label={submitted ? 'Answer submitted' : 'Submit answer'}
      tone="primary"
      disabled={submitted || (answer === 'Custom' && !other.trim())}
      onclick={() => (submitted = true)}
    />
  </div>
  {#if submitted}<p role="status">{answer === 'Custom' ? other : answer}</p>{/if}
</section>
