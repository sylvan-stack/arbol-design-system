import type { Preview } from '@storybook/react-vite'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import '../packages/design-system/src/tokens.css'

const themes = ['ironbark', 'bloodwood', 'redwood', 'mahogany', 'cedar', 'evergreen', 'driftwood', 'amber', 'sandstone', 'oat', 'birch', 'paper']
const preview: Preview = {
  decorators: [withThemeByDataAttribute({
    themes: Object.fromEntries(themes.map(theme => [theme, theme])),
    defaultTheme: 'redwood',
    attributeName: 'data-theme',
    parentSelector: 'html',
  })],
}
export default preview
