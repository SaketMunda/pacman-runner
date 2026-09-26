const ENDPOINT = '/api/v1/jev-move'

/**
 * A classified network failure. `reason` is one of `backend-down`, `timeout`,
 * `bad-response` -- decisionScheduler reads it directly, so callers never see
 * a generic Error and have to re-derive what went wrong.
 */
export class DecisionError extends Error {
  constructor(reason, cause) {
    super(`jev decision failed: ${reason}`)
    this.name = 'DecisionError'
    this.reason = reason
    this.cause = cause
  }
}

/** POST the snapshot to the backend and return the parsed JevMoveOut, or throw a DecisionError. */
export async function fetchDecision(snapshot, { signal } = {}) {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new DecisionError('timeout', err)
    throw new DecisionError('backend-down', err)
  }

  if (response.status >= 500) {
    throw new DecisionError('backend-down', new Error(`HTTP ${response.status}`))
  }
  if (!response.ok) {
    throw new DecisionError('bad-response', new Error(`HTTP ${response.status}`))
  }

  let data
  try {
    data = await response.json()
  } catch (err) {
    throw new DecisionError('bad-response', err)
  }

  if (!data || typeof data.move !== 'string') {
    throw new DecisionError('bad-response', new Error('response missing move'))
  }

  return data
}

/**
 * GET /api/v1/health -> `{ mode, model, keyConfigured }`, or null when the
 * backend is unreachable or answers with something unusable. Never throws.
 */
export async function fetchHealth({ signal } = {}) {
  try {
    const response = await fetch('/api/v1/health', { signal })
    if (!response.ok) return null
    const data = await response.json()
    if (data?.mode !== 'stub' && data?.mode !== 'live') return null
    return { mode: data.mode, model: data.model ?? null, keyConfigured: data.keyConfigured === true }
  } catch {
    return null
  }
}
