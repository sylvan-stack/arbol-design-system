import { useArgs } from 'storybook/preview-api';
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
          'Elma Chat and Seqoya Lab share this header, including the Trunk, text size, theme and navigation controls. The native Tray Menu story shows both windows. AppKit handles window movement.',
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
    headerAppearance: 'enabled',
    trunk: 'trivial',
  },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return {
      Component,
      props: {
        ...args,
        trunkSelector: {
          load: async () => ['trivial', 'research'],
          select: async (trunk: string) => updateArgs({ trunk }),
        },
      },
    };
  },
};
