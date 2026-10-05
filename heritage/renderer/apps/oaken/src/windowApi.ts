import { callNative } from '@arbol/design-system'
import { hasBridge } from './data'

async function callWindowMethod(method: string, params: Record<string, unknown> = {}): Promise<void> {
  if (!hasBridge()) return
  const result = await callNative(method, params)
  if (!result?.ok) throw new Error(result?.error || `Native window method failed: ${method}`)
}

export function restoreOakenBoardWindow(): Promise<void> {
  return callWindowMethod('app.setAlwaysOnTop', { on: false })
}

export function showCompactSwimlanesPanel(): Promise<void> {
  return callWindowMethod('app.showOakenSwimlanesPanel')
}

export function closeCompactSwimlanesPanel(): Promise<void> {
  return callWindowMethod('app.closeOakenSwimlanesPanel')
}

export function openSwimlaneInBoard(swimlaneId: string): Promise<void> {
  return callWindowMethod('app.openOakenSwimlane', { swimlane_id: swimlaneId })
}

export async function beginWindowDrag(): Promise<void> {
  if (!hasBridge()) return
  await callNative('app.beginWindowDrag', {})
}
