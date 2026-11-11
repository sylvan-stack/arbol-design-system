import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/NativeSurface.svelte';
const meta = {
  title: 'Native adapters/Tray Menu',
  component: Component,
  tags: ['autodocs'],
  args: {
    surface: 'Tray Menu',
    trayCatalogueState: 'available',
    trayRunningBuild: '3',
    trayBuiltAt: '11 Nov 2026, 14:25:00',
    trayNewBuild: '4',
  },
  argTypes: {
    trayBuiltAt: { control: 'text' },
    trayRunningBuild: { control: 'text' },
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
          'The header shows the running Build number and timestamp. Start new version names the prepared Build and updates the header after the preview handoff. Choose a working Root to make it current for the App and CLI. Use newest working Root returns to automatic selection.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
