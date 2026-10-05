import { defineConfig } from 'vite'
import { appConfig } from '../../vite.shared'

export default defineConfig(appConfig(__dirname, 'elma'))
