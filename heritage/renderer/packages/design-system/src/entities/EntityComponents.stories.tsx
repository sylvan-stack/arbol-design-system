import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import EntityComponentsStoryPreview from './EntityComponentsStoryPreview.svelte'

type PreviewProps = {
  mode: 'all' | 'chips' | 'cards'
  resolverDelayMs: number
}

/** React is only Storybook's adapter; the canvas mounts the shipping Svelte components. */
function Preview(props: PreviewProps) {
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!target.current) return
    const component = mount(EntityComponentsStoryPreview, {
      target: target.current,
      props: { ...props },
    })
    return () => { void unmount(component) }
  }, [props.mode, props.resolverDelayMs])

  return <div ref={target} />
}

const meta = {
  title: 'Design System/Entity References',
  component: Preview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The shipping EntityChip and EntityCard Svelte components. The catalogue covers request-free title rendering, all 15 kind-specific icon/color treatments, constrained and malformed Chips, persisted Markdown and plain Card content, lazy resolution, loading, errors, retry, and collapsed/expanded states. Cmd-click a valid Chip to exercise its Go to contract without calling Core.',
      },
    },
  },
  args: {
    mode: 'all',
    resolverDelayMs: 700,
  },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['all', 'chips', 'cards'],
      description: 'Show the complete catalogue or focus on one Entity component.',
    },
    resolverDelayMs: {
      control: { type: 'range', min: 0, max: 3000, step: 100 },
      description: 'Artificial delay used by the Card resolver examples so loading and cancellation can be inspected.',
    },
  },
} satisfies Meta<typeof Preview>

export default meta
type Story = StoryObj<typeof meta>

/** Primary design-review board for both Entity components and their important states. */
export const AllComponents: Story = {}

/** Focused Chip board, including every Entity Kind, icons, vibrant color treatments, title decoding, truncation, UTF-8, invalid input, and Go to. */
export const EntityChips: Story = { args: { mode: 'chips' } }

/** Focused Card board, including persisted content and use-case-specific resolvers. */
export const EntityCards: Story = { args: { mode: 'cards' } }
