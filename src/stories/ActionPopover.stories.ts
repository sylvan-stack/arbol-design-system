import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../patterns/ActionPopover.svelte';
const meta = {
  title: 'Patterns/ActionPopover',
  component: Component,
  tags: ['autodocs'],
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
