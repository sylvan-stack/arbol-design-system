import '@arbol/design-system/tokens.css'
import { mount } from 'svelte'
import { installGlobalLinks, installGlobalErrorReporting } from '@arbol/design-system'
import App from './App.svelte'
import { ELMA_THEME_KEY, ELMA_DEFAULT_THEME, ELMA_UI_SCALE_KEY, ELMA_CONTENT_SCALE_KEY } from './constants'

// Apply the persisted schema + font scales before first paint (no flash).
const root = document.documentElement
root.setAttribute('data-theme', localStorage.getItem(ELMA_THEME_KEY) || ELMA_DEFAULT_THEME)
const ui = parseFloat(localStorage.getItem(ELMA_UI_SCALE_KEY) || '1') || 1
const content = Math.max(ui, parseFloat(localStorage.getItem(ELMA_CONTENT_SCALE_KEY) || '1') || 1)
root.style.setProperty('--arbol-font-scale', String(ui))
root.style.setProperty('--arbol-content-font-scale', String(content))

installGlobalErrorReporting('elma')
installGlobalLinks('elma')
mount(App, { target: document.getElementById('root')! })
