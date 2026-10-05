import { callNative } from './bridge/arbol'
import type { ArbolUI } from './links'

/** Where the user goes after clicking a Comunicado Presentation. */
export type ComunicadoDescriptor =
  | { type: 'app'; ui: Exclude<ArbolUI, 'artifact'>; query?: Record<string, unknown> }
  | { type: 'link'; kind: 'http' | 'file'; target: string }

/** Instance input for the first Comunicado Species. */
export type NotificationComunicado = {
  id?: string
  title: string
  content: string
  descriptor: ComunicadoDescriptor
  /** @deprecated Retained for callers built against the former macOS-notification delivery. */
  soundVolume?: number
}

/**
 * Instantiate and deliver a Notification Comunicado through the native shell.
 *
 * Its sole Presentation is Willo's Comunicado Feed. The native shell does not
 * create a macOS UserNotification; clicking the feed card dismisses the instance
 * and follows its descriptor (normally the originating Elma Chat Session).
 */
export async function deliverNotificationComunicado(comunicado: NotificationComunicado): Promise<{ ok: boolean; id?: string }> {
  // Pass the typed instance through unchanged. Apart from avoiding redundant
  // serialization code, this keeps the browser/native contract identical to the
  // public NotificationComunicado shape (the bridge performs its own JSON round-trip).
  const result = await callNative('comunicado.notification.deliver', comunicado)
  if (!result?.ok) throw new Error(result?.error || 'Could not deliver Notification Comunicado')
  return result
}

/** Deliver a Priority Notification Comunicado. It has the same instance
 * contract and Feed presentation as Notification, while retaining an
 * independent Willo Species setting. */
export async function deliverPriorityNotificationComunicado(comunicado: NotificationComunicado): Promise<{ ok: boolean; id?: string }> {
  const result = await callNative('comunicado.priority-notification.deliver', comunicado)
  if (!result?.ok) throw new Error(result?.error || 'Could not deliver Priority Notification Comunicado')
  return result
}
