import type { Meta, StoryObj } from '@storybook/svelte-vite';
import BrowserProfiles from '../pages/BrowserProfiles.svelte';
import WorkspacePage from '../pages/WorkspacePage.svelte';

const meta = {
  title: 'Components/Browser Profile Navigation',
  component: BrowserProfiles,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BrowserProfiles>;

export default meta;
type Story = StoryObj<typeof meta>;
export const MultipleProfiles: Story = {};
export const SignedBrowser: Story = {
  args: { presentation: 'signed' },
  parameters: {
    docs: {
      description: {
        story: 'Each profile card keeps its tab titles visible. Click a tab in Personal to switch directly to it, then return to Studio to see the same draft. The plus button pauses at seven tabs in the current profile.',
      },
    },
  },
};
export const AppOwnedStartup: Story = { args: { presentation: 'starting', foreground: true } };
export const ForegroundSubscriptionOpen: Story = {
  args: { presentation: 'signed', foreground: true },
  parameters: {
    docs: {
      description: {
        story: 'The existing Browser becomes active on the explicit subscription click. The current tab remains usable while the requested usage page is verified.',
      },
    },
  },
};
export const Compact: Story = { args: { presentation: 'signed' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
export const BrowserProfilesPage: StoryObj<typeof WorkspacePage> = {
  render: () => ({ Component: WorkspacePage, props: { pageId: 'browser-profiles' } }),
};
