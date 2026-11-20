import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WilloStation.svelte';
import WorkspacePage from '../pages/WorkspacePage.svelte';
import { recentChatSessions } from '../fixtures/willo-chat-sessions';

const meta = {
  title: 'Pages/Willo/Stations',
  component: Component,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { rows: recentChatSessions },
} satisfies Meta<typeof Component>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
export const Interactive = {
  render: () => ({ Component: WorkspacePage, props: { pageId: 'willo-stations' } }),
} satisfies StoryObj<typeof WorkspacePage>;
export const Loading: Story = { args: { rows: [], loading: true } };
export const Empty: Story = { args: { rows: [] } };
export const Unavailable: Story = {
  args: { rows: [], problem: 'Could not load recent Chat Sessions.', onRetry: () => {} },
};
export const OlderPageUnavailable: Story = {
  args: { problem: 'Could not load older Chat Sessions.', onRetry: () => {} },
};
export const MoreAvailable: Story = { args: { more: true, onLoadOlder: () => {} } };
