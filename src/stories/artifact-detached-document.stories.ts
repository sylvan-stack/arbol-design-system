import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Artifact/Detached Document',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'artifact-detached-document' },
  parameters: {
    docs: {
      description: {
        component:
          'The same document behavior in a dedicated window. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
