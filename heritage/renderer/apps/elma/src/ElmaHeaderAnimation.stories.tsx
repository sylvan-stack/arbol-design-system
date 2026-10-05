import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import ElmaHeaderAnimationPreview from './ElmaHeaderAnimationPreview.svelte'

type PreviewProps = {
  running: boolean
  chatTitle: string
}

function Preview(props: PreviewProps) {
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!target.current) return
    const component = mount(ElmaHeaderAnimationPreview, {
      target: target.current,
      props,
    })
    return () => { void unmount(component) }
  }, [props.running, props.chatTitle])

  return <div ref={target} />
}

const meta = {
  title: 'Elma/Chat Header Animation',
  component: Preview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The actual shared Header used by Elma Chat, with Elma’s glyph and the running-header animation. This is the full-width animated header—not the status bar.',
      },
    },
  },
  args: {
    running: true,
    chatTitle: 'Header animation preview',
  },
  argTypes: {
    running: { control: 'boolean' },
    chatTitle: { control: 'text' },
  },
} satisfies Meta<typeof Preview>

export default meta
type Story = StoryObj<typeof meta>

export const Running: Story = {}

export const Idle: Story = {
  args: { running: false },
}
