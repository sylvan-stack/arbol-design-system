import '@arbol/design-system/tokens.css'
import { mount } from 'svelte'
import { installGlobalLinks, installGlobalErrorReporting } from '@arbol/design-system'
import App from './App.svelte'
installGlobalErrorReporting('seqoya')
installGlobalLinks('seqoya')
mount(App, { target: document.getElementById('root')! })
