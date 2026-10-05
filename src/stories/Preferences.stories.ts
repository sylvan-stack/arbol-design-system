import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../patterns/Preferences.svelte';
const meta = {
  title: 'Patterns/Preferences',
  component: Component,
  tags: ['autodocs'],
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
