import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/NativeSurface.svelte';
const meta = {
  title: 'Native adapters/Tray Menu',
  component: Component,
  tags: ['autodocs'],
  args: {
    surface: 'Tray Menu',
    trayCatalogueState: 'available',
    trayBuiltAt: '11 Nov 2026, 14:25:00',
    trayNewBuild: '10',
  },
  argTypes: {
    trayBuiltAt: { control: 'text' },
    trayNewBuild: { control: 'text' },
    traySavedRoot: {
      control: 'text',
      description: 'Initial saved Root. Use Orchard for an incompatible Root or a name outside the preview catalogue for a missing Root.',
    },
    trayCatalogueState: { control: 'select', options: ['available', 'loading', 'empty', 'unavailable'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'The tray shows the catalogue’s current Root, the default for UIs, and the running App’s build time. Select a Root or choose Use current Root to update the default row. Start new version is the first action when a newer Build is available.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
