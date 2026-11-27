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
        story: 'On the first click, Personal shows progress in its sidebar row. Return to Studio and switch back to see the ready profile reuse its tab and draft. Usage plan opens its subscription dashboard on the first visit.',
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
