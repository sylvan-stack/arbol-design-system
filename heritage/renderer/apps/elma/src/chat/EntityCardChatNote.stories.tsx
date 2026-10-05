import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import EntityCardChatNoteStoryPreview from './EntityCardChatNoteStoryPreview.svelte'

type Scenario = 'new-chat' | 'existing-chat' | 'pinned-message'
type PreviewProps = { scenario: Scenario }

function Preview(props: PreviewProps) {
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!target.current) return
    const component = mount(EntityCardChatNoteStoryPreview, { target: target.current, props })
    return () => { void unmount(component) }
  }, [props.scenario])
  return <div ref={target} />
}

const meta = {
  title: 'Elma/Entity Card Chat Note',
  component: Preview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Entity Card attachments represented as Chat Notes before and after an Elma message is sent. Expand a card to inspect the same content that is supplied to the agent.',
      },
    },
  },
  args: { scenario: 'new-chat' },
  argTypes: {
    scenario: {
      control: 'select',
      options: ['new-chat', 'existing-chat', 'pinned-message'],
      description: 'Where the Entity Card Chat Note appears in the chat lifecycle.',
    },
  },
} satisfies Meta<typeof Preview>

export default meta
type Story = StoryObj<typeof meta>

export const FirstMessageInNewChat: Story = {
  name: '1. First message in new chat',
  args: { scenario: 'new-chat' },
}

export const MessageInExistingChat: Story = {
  name: '2. Message in existing chat',
  args: { scenario: 'existing-chat' },
}

export const ExistingPinnedUserMessage: Story = {
  name: '3. Existing pinned user message',
  args: { scenario: 'pinned-message' },
}
