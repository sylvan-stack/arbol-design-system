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
    trayNewBuild: '4',
    trayRendererState: 'available',
  },
  argTypes: {
    trayRunningBuild: { control: 'text' },
    trayNewBuild: { control: 'text' },
    trayCurrentRoot: {
      control: 'text',
      description: 'Initial catalogue selection. Use Orchard to show a current Root that requires a newer App Build.',
    },
    trayRendererState: {
      control: 'select',
      options: ['available', 'missing', 'load-failed'],
      description: 'Missing disables the Grove open action. Load-failed opens a native error with Retry.',
    },
    trayCatalogueState: { control: 'select', options: ['available', 'loading', 'empty', 'unavailable'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'The header shows the current Root and running Build number. Start new version names the prepared Build and updates the header after the preview handoff. Choose a working Root to make it current for the App and CLI. Use newest working Root returns to automatic selection. Open Elma Chat uses the current Root, and Roots also offers an explicit open. Reopening raises the existing Root window. Close returns to the resident tray.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
