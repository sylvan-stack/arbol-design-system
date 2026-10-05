import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import NotificationComunicadoStoryPreview from './NotificationComunicadoStoryPreview.svelte'

type PreviewProps = {
  title: string
  content: string
}

/** React is only Storybook's adapter; the canvas mounts the real Svelte test page. */
function Preview(props: PreviewProps) {
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!target.current) return
    const component = mount(NotificationComunicadoStoryPreview, {
      target: target.current,
      props: { ...props },
    })
    return () => { void unmount(component) }
  }, [props.title, props.content])

  return <div ref={target} />
}

const meta = {
  title: 'Comunicados/Notification Comunicado',
  component: Preview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Manual integration harness for the first Comunicado Species. The button calls the shipping deliverNotificationComunicado contract and reports the native bridge result instead of swallowing failures. A real macOS banner requires Storybook to run inside an Arbol native WKWebView.',
      },
    },
  },
  args: {
    title: 'Notification Comunicado test',
    content: 'This notification was triggered manually from the Arbol Storybook.',
  },
  argTypes: {
    title: { control: 'text', description: 'Native notification title.' },
    content: { control: 'text', description: 'Native notification body.' },
  },
} satisfies Meta<typeof Preview>

export default meta
type Story = StoryObj<typeof meta>

export const DeliveryHarness: Story = {}
