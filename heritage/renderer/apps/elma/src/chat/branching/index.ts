/* Elma Chat — branching layer (conversation tree). Pure tree helpers + the
 * branch-specific UI that sits on top of the unchanged single-turn surface. */
export { TREE, pathToNode, activePath, activeChildFor, descendants, siblings } from './tree'
export { buildTreeFromView, hiddenTurns } from './fromFold'
export { default as BranchIcon } from './BranchIcon.svelte'
export { default as TrashIcon } from './TrashIcon.svelte'
export { default as PencilIcon } from './PencilIcon.svelte'
export { default as PinIconBtn } from './PinIconBtn.svelte'
export { default as BranchSwitcher } from './BranchSwitcher.svelte'
export { default as BranchComposeBanner } from './BranchComposeBanner.svelte'
export { default as ConfirmDialog } from './ConfirmDialog.svelte'
