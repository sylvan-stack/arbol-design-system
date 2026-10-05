import '@arbol/design-system/tokens.css'
import './oaken.css'
import './compact-panel.css'
import './tasks.css'
import { mount } from 'svelte'
import { installGlobalLinks, installGlobalErrorReporting } from '@arbol/design-system'
import App from './App.svelte'
import CompactApp from './CompactApp.svelte'

installGlobalErrorReporting('oaken')
installGlobalLinks('oaken')
const panel = new URLSearchParams(location.search).get('panel')
mount(panel === 'swimlanes' ? CompactApp : App, { target: document.getElementById('root')! })
