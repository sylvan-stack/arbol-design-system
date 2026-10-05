import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import HunkReviewStoryPreview from './HunkReviewStoryPreview.svelte'

/** Storybook's React canvas mounts the shipping Svelte HunkReview component. */
function Preview() {
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!target.current) return
    const component = mount(HunkReviewStoryPreview, { target: target.current })
    return () => { void unmount(component) }
  }, [])

  return <div ref={target} />
}

const meta = {
  title: 'Design System/Hunk Review',
  component: Preview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'The shipping renderer-only HunkReview surface. Use the Hunk Definition selector to inspect durable examples for worktree vs master, worktree vs parent, uncommitted changes, and last commit. Each snapshot contains already-fetched diffs and optional read-only GitLab discussions; the component makes no fetches.',
      },
    },
  },
} satisfies Meta<typeof Preview>

export default meta
type Story = StoryObj<typeof meta>

/** Durable Hunk snapshots across the initial hardcoded Hunk Definitions. */
export const Definitions: Story = {}
