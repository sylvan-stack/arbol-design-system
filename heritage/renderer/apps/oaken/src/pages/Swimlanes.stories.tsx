import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import SwimlanesStoryPreview from './SwimlanesStoryPreview.svelte'
import { allElementsBoard, emptyStatesBoard, BOARD_REFERENCE_NOW_MS } from '../stories.fixtures'
import type { Swimlane } from '../data'
import '../oaken.css'

type PreviewProps = {
  swimlanes: Swimlane[]
  referenceNowMs: number
  initialView: 'natural' | 'fit'
}

/** React is only Storybook's adapter; the canvas mounts the shipping Svelte board. */
function Preview(props: PreviewProps) {
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!target.current) return
    const component = mount(SwimlanesStoryPreview, { target: target.current, props: { ...props } })
    return () => { void unmount(component) }
  }, [props.swimlanes, props.referenceNowMs, props.initialView])

  return <div ref={target} />
}

const meta = {
  title: 'Oaken/Swimlanes Board',
  component: Preview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The shipping Swimlanes board mounted as an interactive workshop. Its clock is frozen at 13:30 so active, planned, overdue, blocked, unwalled, and cross-day tracks stay visually stable. Use the toolbar, pan the board, ⌘/Ctrl-wheel to zoom, open titles and menus, and switch Storybook themes.',
      },
    },
  },
  args: {
    swimlanes: allElementsBoard(),
    referenceNowMs: BOARD_REFERENCE_NOW_MS,
    initialView: 'natural',
  },
  argTypes: {
    swimlanes: { control: false },
    referenceNowMs: { control: false },
    initialView: {
      control: 'inline-radio',
      options: ['natural', 'fit'],
      description: 'Natural layout keeps scrollable column widths; Fit hides placeholders and compresses all occupied lanes.',
    },
  },
} satisfies Meta<typeof Preview>

export default meta
type Story = StoryObj<typeof meta>

/** Primary design-review catalogue: all eight lanes and sixteen varied swimmers. */
export const AllElements: Story = {}

/** Same coverage board compressed into one viewport for hierarchy comparison. */
export const AllElementsFit: Story = { args: { initialView: 'fit' } }

/** Empty-state contrast: one persisted empty lane and seven uncreated placeholders. */
export const EmptyAndPlaceholderSlots: Story = { args: { swimlanes: emptyStatesBoard() } }

/** First-run scaffold, before any Swimlane has been created. */
export const EmptyBoard: Story = { args: { swimlanes: [] } }
