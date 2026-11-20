import type { Meta, StoryObj } from '@storybook/svelte-vite';
import ExchangePhasePatternGallery from '../examples/ExchangePhasePatternGallery.svelte';
import ExchangePhasePreview from '../examples/ExchangePhasePreview.svelte';

const meta = {
  title: 'Pages/Elma/Exchange Phases',
  component: ExchangePhasePreview,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'A fictional Steady Exchange with timed phase transitions in Elma.' } },
  },
} satisfies Meta<typeof ExchangePhasePreview>;

export default meta;
export const Preview: StoryObj<typeof meta> = {};

export const PatternGallery: StoryObj<typeof meta> = {
  name: 'Phase Backgrounds',
  render: () => ({ Component: ExchangePhasePatternGallery }),
};
