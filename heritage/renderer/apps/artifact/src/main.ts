import '@arbol/design-system/tokens.css'
import { mount } from 'svelte'
import { installGlobalLinks } from '@arbol/design-system'
import App from './App.svelte'

installGlobalLinks('artifact')
mount(App, { target: document.getElementById('root')! })
