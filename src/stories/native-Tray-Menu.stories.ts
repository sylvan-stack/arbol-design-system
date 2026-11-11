import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/NativeSurface.svelte';
const meta = {
  title: 'Native adapters/Tray Menu',
  component: Component,
  tags: ['autodocs'],
  args: { surface: 'Tray Menu' },
  parameters: {
    docs: {
      description: {
        component:
          'The first Arbol menu-bar state. Open the oak icon to see Quit. Quit removes the icon from the preview.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
