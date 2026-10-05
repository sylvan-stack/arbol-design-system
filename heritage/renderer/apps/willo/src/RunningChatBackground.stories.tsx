import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import RunningChatBackgroundPreview from './RunningChatBackgroundPreview.svelte'

type Props = { variant: 'all' | 'aurora' | 'tide' | 'ember'; paused: boolean; compact: boolean; minimal: boolean }
function Preview(props: Props) {
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!target.current) return
    const component = mount(RunningChatBackgroundPreview, { target: target.current, props })
    return () => { void unmount(component) }
  }, [props.variant, props.paused, props.compact, props.minimal])
  return <div ref={target} />
}
const meta = {
  title: 'Willo/Running Chat Backgrounds',
  component: Preview,
  parameters: { layout: 'fullscreen' },
  args: { variant: 'aurora', paused: false, compact: false, minimal: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['all', 'aurora', 'tide', 'ember'] },
    paused: { control: 'boolean' },
    compact: { control: 'boolean' },
    minimal: { control: 'boolean' },
  },
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>
export const Compare: Story = { args: { variant: 'all' } }
export const Aurora: Story = { args: { variant: 'aurora' } }
export const AuroraCompact: Story = { args: { variant: 'aurora', compact: true } }
export const AuroraMinimal: Story = { args: { variant: 'aurora', compact: true, minimal: true } }
export const Tide: Story = { args: { variant: 'tide' } }
export const Ember: Story = { args: { variant: 'ember' } }
export const Paused: Story = { args: { paused: true } }
