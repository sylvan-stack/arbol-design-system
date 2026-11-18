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
export const Compact: Story = { globals: { viewport: { value: 'mobile2', isRotated: false } } };
export const BrowserProfilesPage: StoryObj<typeof WorkspacePage> = {
  render: () => ({ Component: WorkspacePage, props: { pageId: 'browser-profiles' } }),
};
