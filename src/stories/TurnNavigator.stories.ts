import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/TurnNavigator.svelte';
const meta = {
  title: 'Sections/TurnNavigator',
  component: Component,
  tags: ['autodocs'],
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
