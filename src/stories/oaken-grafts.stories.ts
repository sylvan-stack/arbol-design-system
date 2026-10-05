import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Oaken/Grafts',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'oaken-grafts' },
  parameters: {
    docs: {
      description: {
        component:
          'Small, connected work items using the shared editor. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
