import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/NativeSurface.svelte';
const meta = {
  title: 'Native adapters/Tray Menu',
  component: Component,
  tags: ['autodocs'],
  args: { surface: 'Tray Menu', trayCatalogueState: 'available', trayNewBuild: '10' },
  argTypes: {
    trayNewBuild: { control: 'text' },
    trayCatalogueState: { control: 'select', options: ['available', 'loading', 'empty', 'unavailable'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Start new version sits above Roots when a newer working Build is available. The preview uses a fictional Build and Roots. Clear the Build control to see the tray with no update.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
