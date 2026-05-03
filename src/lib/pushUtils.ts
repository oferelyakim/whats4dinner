/**
 * Convert a VAPID public key from base64url to Uint8Array.
 * Required by PushManager.subscribe({ applicationServerKey }).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Returns true if the current browser + device supports Web Push.
 * On iOS, push is only available when the app is installed to the Home Screen
 * (display-mode: standalone) — Safari on iOS does not support push in browser tabs.
 */
export function isPushSupported(): boolean {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (isIos) {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    return isStandalone
  }
  return true
}

/**
 * Returns true when the user is on iOS Safari but has NOT added the app to
 * their Home Screen — i.e. push is not yet available and we should show the
 * install hint.
 */
export function isIosSafariNotInstalled(): boolean {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (!isIos) return false
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  return !isStandalone
}
