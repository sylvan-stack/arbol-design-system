import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/PinnedMessage.svelte';
const meta = {
  title: 'Sections/PinnedMessage',
  component: Component,
  tags: ['autodocs'],
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
