import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { action } from 'storybook/actions';
import Component from '../pages/WilloStation.svelte';
import WorkspacePage from '../pages/WorkspacePage.svelte';
import { importedChatSessions, recentChatSessions } from '../fixtures/willo-chat-sessions';

const meta = {
  title: 'Pages/Willo/Stations',
  component: Component,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    rows: recentChatSessions,
    importedView: { rows: importedChatSessions },
    onOpenChat: action('Open Chat Session in Elma'),
  },
} satisfies Meta<typeof Component>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
export const Interactive = {
  name: 'Collection and attention reference',
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
export const ElmaUnavailable: Story = {
  args: { openProblem: 'Could not open the installed Elma Chat app.' },
};
