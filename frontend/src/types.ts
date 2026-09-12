export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export interface Findings { crown_condition: string; crown_loss: boolean; dead_branches: boolean; broken_limbs: boolean; trunk_damage: boolean; possible_cavity: boolean; leaning: string; fungal_growth: string; base_or_root_damage: boolean; other_anomalies: string[]; confidence: number; summary: string }
export interface StreetView { source: string; captureDate?: string; copyright?: string }
export interface AerialContext { imageUrl: string; source: string; captureDate?: string; bbox: number[] }
export interface ApproximateAddress { address: string; label: string }
export interface Result { location: { latitude: number; longitude: number }; submitted_at: string; aerial?: { image_url: string; source: string; capture_date?: string; bbox: number[] }; street_view?: { source: string; capture_date?: string; copyright?: string }; findings: Findings; warning_signs: string[]; score: number; priority: Priority; recommendation: string; disclaimer: string }
export interface AreaCandidate { asset_id?: string; location: { latitude: number; longitude: number }; priority: Priority; score: number; warning_signs: string[]; summary: string; confidence: number; street_view_date?: string }
export interface AreaScreening { bounds: { south: number; west: number; north: number; east: number }; candidates_found: number; candidate_source: string; screened: AreaCandidate[]; disclaimer: string }
