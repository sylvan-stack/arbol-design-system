import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../patterns/WorkspaceShell.svelte';
const meta = {
  title: 'Patterns/WorkspaceShell',
  component: Component,
  tags: ['autodocs'],
  args: {},
  parameters: {
    docs: {
      description: {
        component:
          'The Root name opens an anchored dropdown. Canopy is the window’s Root, Nursery shows why it is unavailable, and Grove refuses the first open so it can be retried. Elma Chat and Seqoya Lab both render WorkspaceHeader with the same title, Root selector and navigation layout. AppKit handles window movement.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    workspace: 'Seqoya',
    headerTitle: 'Seqoya Lab',
    root: { root: 'canopy', name: 'Canopy', status: 'working' },
  },
  render: (args) => {
    let refused = false;
    return {
      Component,
      props: {
        ...args,
        rootSelector: {
          load: async () => [
            { root: 'canopy', name: 'Canopy', status: 'working' as const },
            { root: 'grove', name: 'Grove', status: 'working' as const },
            { root: 'nursery', name: 'Nursery', status: 'preparing' as const, unavailable: 'No renderer is available.' },
          ],
          open: async () => {
            if (refused) return;
            refused = true;
            throw new Error('Grove is temporarily unavailable. Try again.');
          },
        },
      },
    };
  },
};
