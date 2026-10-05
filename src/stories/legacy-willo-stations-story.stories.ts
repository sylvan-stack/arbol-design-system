import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from './Heritage.svelte';
const meta = {
  title: 'Heritage/Willo station study',
  component: Component,
  tags: ['autodocs'],
  args: { image: 'legacy-willo-stations-story', title: 'Willo station study' },
  parameters: {
    docs: {
      description: {
        component:
          'Captured source UI evidence. A static screenshot, not a reconstructed interactive component. See capture provenance.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
