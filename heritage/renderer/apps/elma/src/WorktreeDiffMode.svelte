<script lang="ts">
  import { DiffViewSwitcher } from '@arbol/design-system'
  import type { WorktreeDiffMode } from './change-walkthrough/types'
  let { mode = 'uncommitted', parentBranch = null, parentAvailable = false, masterBranch = null, masterAvailable = true, masterIsCurrent = false, busy = false, compact = false, onChange }: {
    mode?: WorktreeDiffMode; parentBranch?: string | null; parentAvailable?: boolean; masterBranch?: string | null; masterAvailable?: boolean; masterIsCurrent?: boolean; busy?: boolean; compact?: boolean; onChange: (mode: WorktreeDiffMode) => void
  } = $props()
</script>
<DiffViewSwitcher view={mode} {parentBranch} {parentAvailable} {masterBranch} {masterAvailable} {masterIsCurrent} {busy} {compact} onChange={onChange} />
