import { mount } from 'svelte'
import ResponseAutoscrollFixture from './ResponseAutoscrollFixture.svelte'

const fixture = mount(ResponseAutoscrollFixture, {
  target: document.getElementById('root')!,
})
Object.assign(window, { __responseAutoscrollFixture: fixture })
