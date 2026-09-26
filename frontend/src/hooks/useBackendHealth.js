import { useEffect, useState } from 'react'
import { fetchHealth } from '../ai/jevClient.js'

/**
 * Backend mode from /api/v1/health: fetched once on mount, and again whenever
 * `refreshKey` changes (useJevDecisions bumps it when a request succeeds after
 * a backend-down streak). `health` is undefined while loading, null when the
 * backend is unreachable.
 */
export function useBackendHealth(refreshKey) {
  const [health, setHealth] = useState(undefined)

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setHealth(result)
    })
    return () => controller.abort()
  }, [refreshKey])

  return health
}
