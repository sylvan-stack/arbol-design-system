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
    trayGroveBackendAvailable: true,
    trayShortcutAvailable: true,
    traySeqoyaShortcutAvailable: true,
  },
  argTypes: {
    trayRunningBuild: { control: 'text' },
    trayNewBuild: { control: 'text' },
    trayShortcutAvailable: { control: 'boolean', description: 'Models macOS accepting or refusing the shortcut.' },
    traySeqoyaShortcutAvailable: { control: 'boolean', description: 'Models macOS accepting or refusing Control+Option+Shift+Command+S.' },
    traySelectionProblem: {
      control: 'text',
      description: 'Supply a catalogue refusal to show it on the Current Root row after a selection.',
    },
    trayCurrentRoot: {
      control: 'text',
      description: 'Initial catalogue selection. Use Orchard to show a current Root that requires a newer App Build.',
    },
    trayRendererState: {
      control: 'select',
      options: ['available', 'load-failed'],
      description: 'Models a verification failure of the App’s shared renderer. The window offers Retry.',
    },
    trayGroveBackendAvailable: {
      control: 'boolean',
      description: 'Disable to show a Root without a runnable backend in the window header dropdown.',
    },
    trayCatalogueState: { control: 'select', options: ['available', 'loading', 'empty', 'unavailable'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Press Option+E with the preview focused to open or raise Elma Chat for the current Root. Press Control+Option+Shift+Command+S to open Seqoya Lab. Roots lists available Roots and marks the current one. Use either window header to open that UI for another Root. The header shows the current Root and running Build number. Start new version names the prepared Build and updates the header after the preview handoff. Close returns to the resident tray. In the App, drag the passive shared header to move its window. The Root dropdown and preferences keep their click actions.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
