import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';
addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'Arbol Design System',
    brandUrl: 'https://github.com/sylvan-stack/arbol-design-system',
    colorPrimary: '#e67943',
    colorSecondary: '#e67943',
    appBg: '#241d19',
    appContentBg: '#241d19',
    appBorderColor: '#493b32',
    textColor: '#f4ece4',
    barBg: '#2c241f',
  }),
});
