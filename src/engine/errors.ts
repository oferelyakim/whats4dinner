/** Sentinel error: a Stage was aborted by the user (e.g. via cancelSlot). */
export class AbortedByUserError extends Error {
  constructor() {
    super('Aborted by user')
    this.name = 'AbortedByUserError'
  }
}
