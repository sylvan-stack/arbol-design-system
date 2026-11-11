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
    trayBackendAvailable: true,
    trayShortcutAvailable: true,
    traySeqoyaShortcutAvailable: true,
  },
  argTypes: {
    trayRunningBuild: { control: 'text' },
    trayNewBuild: { control: 'text' },
    trayShortcutAvailable: { control: 'boolean', description: 'Models macOS accepting or refusing the shortcut.' },
    traySeqoyaShortcutAvailable: { control: 'boolean', description: 'Models macOS accepting or refusing Option+Q.' },
    traySelectionProblem: {
      control: 'text',
      description: 'Supply a catalogue refusal to show it on the Current Trunk row after a selection.',
    },
    trayCurrentTrunk: {
      control: 'text',
      description: 'Initial default Trunk. Use an unknown code to show an unavailable default.',
    },
    trayRendererState: {
      control: 'select',
      options: ['available', 'load-failed'],
      description: 'Models a verification failure of the App’s shared renderer. The window offers Retry.',
    },
    trayBackendAvailable: {
      control: 'boolean',
      description: 'Disable to show a shortcut refusal when the current Root has no runnable backend.',
    },
    trayCatalogueState: { control: 'select', options: ['available', 'loading', 'empty', 'unavailable'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Press Option+E with the preview focused to open or raise Elma Chat for the current Root. Press Option+Q to open Seqoya Lab. Trunks lists available Trunks and marks the default for new windows. Each window header changes its own Trunk. The tray shows the default Trunk and running Build number. Start new version names the prepared Build and updates the header after the preview handoff. Close returns to the resident tray. In the App, drag the passive shared header to move its window. The Trunk dropdown and preferences keep their click actions.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
