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
    trayCurrentRoot: {
      control: 'text',
      description: 'Initial catalogue selection. Use Orchard to show a current Root that requires a newer App Build.',
    },
    trayCatalogueState: { control: 'select', options: ['available', 'loading', 'empty', 'unavailable'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Choose a working Root to make it current for the App and CLI. Use newest working Root returns to automatic selection. The header and checkmark show the same Root. Start new version is the first action when a newer Build is available.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
