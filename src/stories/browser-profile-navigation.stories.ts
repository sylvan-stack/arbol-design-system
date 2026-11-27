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
        story: 'Open Usage plan to see its subscription dashboard as the first tab. Switch to Personal and return to Studio to see its selected tab and draft in the same window.',
      },
    },
  },
};
export const AppOwnedStartup: Story = { args: { presentation: 'starting' } };
export const Compact: Story = { args: { presentation: 'signed' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
export const BrowserProfilesPage: StoryObj<typeof WorkspacePage> = {
  render: () => ({ Component: WorkspacePage, props: { pageId: 'browser-profiles' } }),
};
