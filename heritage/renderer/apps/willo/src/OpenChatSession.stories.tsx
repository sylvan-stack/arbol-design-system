import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import OpenChatSessionPreview from './OpenChatSessionPreview.svelte'

type Props = { variant: 'all' | 'current' | 'badge' | 'frame' | 'band'; compact: boolean; paused: boolean }
function Preview(props: Props) {
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!target.current) return
    const component = mount(OpenChatSessionPreview, { target: target.current, props })
    return () => { void unmount(component) }
  }, [props.variant, props.compact, props.paused])
  return <div ref={target} />
}
const meta = {
  title: 'Willo/Open Chat Session',
  component: Preview,
  parameters: { layout: 'fullscreen' },
  args: { variant: 'all', compact: false, paused: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['all', 'current', 'badge', 'frame', 'band'] },
    compact: { control: 'boolean' },
    paused: { control: 'boolean' },
  },
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>
export const Compare: Story = {}
export const Badge: Story = { args: { variant: 'badge' } }
export const CoolFrame: Story = { args: { variant: 'frame' } }
export const HeaderBand: Story = { args: { variant: 'band' } }
export const CompactComparison: Story = { args: { compact: true } }
