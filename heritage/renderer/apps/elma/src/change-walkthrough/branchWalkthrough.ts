/** Branches whose Command-click opens an uncommitted-change walkthrough. */
const WALKTHROUGH_BRANCH = /^(?:sub|feature|trc|fix)\/[^/\s]+$/

export function isWalkthroughBranch(branch: string | null | undefined): boolean {
  return Boolean(branch && WALKTHROUGH_BRANCH.test(branch))
}

export function isWalkthroughBranchCommandClick(event: MouseEvent, branch: string | null | undefined): boolean {
  return event.metaKey && isWalkthroughBranch(branch)
}
