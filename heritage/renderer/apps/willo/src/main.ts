import '@arbol/design-system/tokens.css'
import './willo.css'
import { mount } from 'svelte'
import { installGlobalLinks, installGlobalErrorReporting } from '@arbol/design-system'
import App from './App.svelte'
installGlobalErrorReporting('willo')
installGlobalLinks('willo')
mount(App, { target: document.getElementById('root')! })
