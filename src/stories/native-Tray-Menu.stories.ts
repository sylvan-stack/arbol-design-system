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
    trayCatalogueState: { control: 'select', options: ['available', 'loading', 'empty', 'unavailable'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'The tray starts with the current Root and the running App’s build time. Start new version is the first action when a newer Build is available. The controls show the loading, empty, and unavailable states with fictional data.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
