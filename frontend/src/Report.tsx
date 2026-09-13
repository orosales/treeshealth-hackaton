import type { Result } from './types'

export function makeReport(result: Result): string {
  const date = new Date(result.submitted_at).toLocaleString()
  const ground = result.ground_context
    ? `${result.ground_context.source} (${result.ground_context.capture_date || 'capture date unavailable'}; ${result.ground_context.freshness.toLowerCase()})`
    : result.street_view ? `${result.street_view.source} (${result.street_view.capture_date || 'capture date unavailable'})` : 'Unavailable'
  return `HALIFAX TREE VISUAL SCREENING REPORT\n\nInspection location: ${result.location.latitude.toFixed(6)}, ${result.location.longitude.toFixed(6)}\nSubmitted: ${date}\nAerial imagery: ${result.aerial ? `${result.aerial.source} (${result.aerial.capture_date || 'capture date unavailable'})` : 'Unavailable'}\nStreet-level context: ${ground}\nCurrent confirmation: user-supplied phone/drone image\n\nInspection priority: ${result.priority} (heuristic score: ${result.score})\nVisible warning signs: ${result.warning_signs.length ? result.warning_signs.join('; ') : 'No major visible warning signs identified'}\nAI confidence: ${Math.round(result.findings.confidence * 100)}%\nAI summary: ${result.findings.summary}\nRecommendation: ${result.recommendation}\n\nDisclaimer: ${result.disclaimer}`
}
