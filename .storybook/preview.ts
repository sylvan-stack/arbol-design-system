import type { Preview } from '@storybook/svelte-vite';
import '@fontsource/hanken-grotesk/latin-400.css';
import '@fontsource/hanken-grotesk/latin-500.css';
import '@fontsource/hanken-grotesk/latin-600.css';
import '@fontsource/hanken-grotesk/latin-700.css';
import '@fontsource/spline-sans-mono/latin-400.css';
import '../src/styles/tokens.css';
import '../src/styles/system.css';
import { THEMES } from '../src/themes';
const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Wood theme',
      toolbar: {
        icon: 'paintbrush',
        dynamicTitle: true,
        items: THEMES.map((t) => ({ value: t.id, title: t.name })),
      },
    },
    density: {
      description: 'Density',
      toolbar: { icon: 'listunordered', items: ['comfortable', 'compact'] },
    },
    scale: {
      description: 'Text size',
      toolbar: {
        icon: 'zoom',
        items: [
          { value: '1', title: '100%' },
          { value: '1.25', title: '125%' },
          { value: '1.5', title: '150%' },
        ],
      },
    },
  },
  initialGlobals: { theme: 'redwood', density: 'comfortable', scale: 1 },
  decorators: [
    (story, context) => {
      document.documentElement.dataset.theme = context.globals.theme;
      document.documentElement.dataset.density = context.globals.density;
      document.documentElement.style.setProperty('--font-scale', String(context.globals.scale));
      return story();
    },
  ],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    options: {
      storySort: {
        order: [
          'Start here',
          'Foundations',
          'Design contracts',
          'Components',
          'Patterns',
          'Sections',
          'Pages',
          'Native adapters',
          'Heritage',
        ],
      },
    },
    a11y: { test: 'todo' },
  },
};
export default preview;
