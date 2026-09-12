import type { Result } from './types'

export function makeReport(result: Result): string {
  const date = new Date(result.submitted_at).toLocaleString()
  return `HALIFAX TREE VISUAL SCREENING REPORT\n\nInspection location: ${result.location.latitude.toFixed(6)}, ${result.location.longitude.toFixed(6)}\nSubmitted: ${date}\nAerial imagery: ${result.aerial ? `${result.aerial.source} (${result.aerial.capture_date || 'capture date unavailable'})` : 'Unavailable'}\nStreet View: ${result.street_view ? `${result.street_view.source} (${result.street_view.capture_date || 'capture date unavailable'}) — historical context only` : 'Unavailable'}\n\nInspection priority: ${result.priority} (heuristic score: ${result.score})\nVisible warning signs: ${result.warning_signs.length ? result.warning_signs.join('; ') : 'No major visible warning signs identified'}\nAI confidence: ${Math.round(result.findings.confidence * 100)}%\nAI summary: ${result.findings.summary}\nRecommendation: ${result.recommendation}\n\nDisclaimer: ${result.disclaimer}`
}
