import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/FinalAnswerArtwork.svelte';
const meta = {
  title: 'Sections/FinalAnswerArtwork',
  component: Component,
  tags: ['autodocs'],
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
