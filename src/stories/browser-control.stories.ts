import type { Meta, StoryObj } from '@storybook/svelte-vite';
import type { ComponentProps } from 'svelte';
import BrowserControl from '../components/BrowserControl.svelte';
import ArbolBrowser from '../pages/ArbolBrowser.svelte';
import type { BrowserControlState } from '../sections/browser-control';
const state: BrowserControlState = { tabs: [{ tab: 'example-tab', generation: 1,
  controller: { kind: 'user' }, handoff: 'idle', inputReady: true, pageAvailability: 'ready', visibleTo: [] }],
  selected: 'example-tab', attachments: [{ id: 'example-agent', label: 'Example agent' }], connection: 'ready' };
const meta = { title: 'Components/BrowserControl', component: BrowserControl, tags: ['autodocs'],
  args: { state, onaction: () => {} }, parameters: { docs: { description: { component:
    'Controlled trusted-shell presentation. Fictional local previews do not implement native input, process authority, IPC, persistence or production health.' } } } } satisfies Meta<typeof BrowserControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Private: Story = {};
const preview = (variant: ComponentProps<typeof ArbolBrowser>['variant'], controlsOnly = true): StoryObj<typeof ArbolBrowser> => ({
  render: () => ({ Component: ArbolBrowser, props: { variant, controlsOnly } }),
});
export const Selecting = preview('selecting');
export const SharedPrivate = preview('shared');
export const AgentControl = preview('agent');
export const TakingControl = preview('taking');
export const Unresponsive = preview('unresponsive');
export const Crashed = preview('crashed');
export const Unavailable = preview('unavailable');
export const NoAgents = preview('no-agents');
export const BusyRefusal = preview('busy');
export const RequestRefused = preview('error');
export const Loading = preview('loading');
export const Empty = preview('empty');
export const ConcurrentTabs = preview('concurrent', false);
export const LongLabel = preview('long-label');
export const BrowserPage = {
  ...preview('private', false),
  parameters: { docs: { description: { story:
    'Copy and Cut are unavailable throughout the preview. Cut leaves the selected note text in place. Paste and ordinary editing remain available.' } } },
} satisfies StoryObj<typeof ArbolBrowser>;
