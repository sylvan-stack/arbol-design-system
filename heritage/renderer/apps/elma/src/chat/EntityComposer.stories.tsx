import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import EntityComposerStoryPreview from './EntityComposerStoryPreview.svelte'

function Preview() {
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!target.current) return
    const component = mount(EntityComposerStoryPreview, { target: target.current })
    return () => { void unmount(component) }
  }, [])
  return <div ref={target} />
}

const meta = {
  title: 'Elma/Entity Composer',
  component: Preview,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>
export const PastedEntityUris: Story = {}
