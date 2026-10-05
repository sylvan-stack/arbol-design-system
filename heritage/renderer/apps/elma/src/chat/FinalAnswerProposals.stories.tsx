import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import FinalAnswerProposalsPreview from './FinalAnswerProposalsPreview.svelte'

type PreviewProps = { showContext: boolean }

function Preview(props: PreviewProps) {
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!target.current) return
    const component = mount(FinalAnswerProposalsPreview, { target: target.current, props })
    return () => { void unmount(component) }
  }, [props.showContext])
  return <div ref={target} />
}

const meta = {
  title: 'Elma/Final Answer Image Proposals',
  component: Preview,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'Eight original, text-free, wide-format artwork directions for the transition from visible agent work to the final answer. The motifs are also adapted to the floating jump control.' } },
  },
  args: { showContext: true },
  argTypes: { showContext: { control: 'boolean', description: 'Show each artwork between miniature activity and answer content.' } },
} satisfies Meta<typeof Preview>

export default meta
type Story = StoryObj<typeof meta>

export const WideArtwork: Story = {}
export const ArtworkOnly: Story = { args: { showContext: false } }
