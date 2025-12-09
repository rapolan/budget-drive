/**
 * Zip Code Utilities
 * Utilities for extracting and comparing zip codes for proximity-based scheduling
 */

/**
 * Extract a 5-digit zip code from a string
 * @param text - Any text that might contain a zip code (address, etc.)
 * @returns The first 5-digit zip code found, or null
 */
export function extractZipCode(text: string | null | undefined): string | null {
  if (!text) return null;
  
  // Match 5-digit zip code, optionally followed by -XXXX
  // Common patterns: "90210", "90210-1234", "CA 90210"
  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return zipMatch ? zipMatch[1] : null;
}

/**
 * Get the effective zip code for a student/pickup location
 * Priority: 1) Pickup address zip (parsed) 2) Student's stored zipCode field
 * 
 * @param pickupAddress - Free-form pickup address string (from lesson)
 * @param studentZipCode - Structured zip code from student profile
 * @returns The best available zip code, or null
 */
export function getEffectiveZipCode(
  pickupAddress: string | null | undefined,
  studentZipCode: string | null | undefined
): string | null {
  // First try to extract from pickup address (most specific to the lesson)
  const pickupZip = extractZipCode(pickupAddress);
  if (pickupZip) return pickupZip;
  
  // Fall back to student's stored zip code
  if (studentZipCode) return studentZipCode;
  
  return null;
}

/**
 * California zip code to region mapping
 * This provides rough geographic grouping for proximity matching
 */
const CA_ZIP_REGIONS: Record<string, string> = {
  // Los Angeles Area
  '900': 'LA_CENTRAL',
  '901': 'LA_SOUTH',
  '902': 'LA_CENTRAL',
  '903': 'LA_EAST',
  '904': 'LA_SOUTH',
  '905': 'LA_SOUTH',
  '906': 'LA_CENTRAL',
  '907': 'LA_WEST',
  '908': 'LA_SOUTH',
  '910': 'LA_EAST',
  '911': 'LA_EAST',
  '912': 'LA_NORTH',
  '913': 'LA_NORTH',
  '914': 'LA_WEST',
  '915': 'LA_SOUTH',
  '916': 'LA_SOUTH',
  '917': 'LA_EAST',
  '918': 'LA_EAST',
  
  // Orange County
  '926': 'OC_NORTH',
  '927': 'OC_NORTH',
  '928': 'OC_SOUTH',
  
  // San Diego
  '919': 'SD_NORTH',
  '920': 'SD_CENTRAL',
  '921': 'SD_SOUTH',
  '922': 'SD_EAST',
  
  // San Francisco Bay Area
  '940': 'SF',
  '941': 'SF',
  '942': 'SF',
  '943': 'SF',
  '944': 'SF',
  '945': 'EAST_BAY',
  '946': 'EAST_BAY',
  '947': 'EAST_BAY',
  '948': 'PENINSULA',
  '949': 'PENINSULA',
  '950': 'SOUTH_BAY',
  '951': 'SOUTH_BAY',
  
  // Central Valley
  '932': 'FRESNO',
  '933': 'FRESNO',
  '934': 'FRESNO',
  '935': 'BAKERSFIELD',
  '936': 'FRESNO',
  '937': 'FRESNO',
  '938': 'FRESNO',
  '939': 'FRESNO',
  
  // Sacramento
  '956': 'SACRAMENTO',
  '957': 'SACRAMENTO',
  '958': 'SACRAMENTO',
  
  // Inland Empire
  '923': 'RIVERSIDE',
  '924': 'SAN_BERNARDINO',
  '925': 'RIVERSIDE',
};

/**
 * Get the region for a zip code
 * @param zipCode - 5-digit zip code
 * @returns Region identifier or 'UNKNOWN'
 */
export function getZipRegion(zipCode: string | null | undefined): string {
  if (!zipCode || zipCode.length < 3) return 'UNKNOWN';
  const prefix = zipCode.substring(0, 3);
  return CA_ZIP_REGIONS[prefix] || 'UNKNOWN';
}

/**
 * Calculate a simple proximity score between two zip codes
 * Higher score = closer proximity (0-100)
 * 
 * Scoring:
 * - Same zip code: 100
 * - Same region: 70
 * - Unknown: 50 (neutral)
 * - Different regions: 30
 * 
 * @param zip1 - First zip code
 * @param zip2 - Second zip code
 * @returns Proximity score (0-100)
 */
export function calculateProximityScore(
  zip1: string | null | undefined,
  zip2: string | null | undefined
): number {
  // If either is missing, return neutral score
  if (!zip1 || !zip2) return 50;
  
  // Same zip code = highest score
  if (zip1 === zip2) return 100;
  
  const region1 = getZipRegion(zip1);
  const region2 = getZipRegion(zip2);
  
  // If either region is unknown, return neutral score
  if (region1 === 'UNKNOWN' || region2 === 'UNKNOWN') return 50;
  
  // Same region = high score
  if (region1 === region2) return 70;
  
  // Adjacent regions (simplified - could be expanded)
  const adjacentRegions: Record<string, string[]> = {
    'LA_CENTRAL': ['LA_WEST', 'LA_EAST', 'LA_NORTH', 'LA_SOUTH'],
    'LA_WEST': ['LA_CENTRAL', 'LA_NORTH', 'LA_SOUTH'],
    'LA_EAST': ['LA_CENTRAL', 'LA_NORTH', 'LA_SOUTH', 'SAN_BERNARDINO'],
    'LA_NORTH': ['LA_CENTRAL', 'LA_WEST', 'LA_EAST'],
    'LA_SOUTH': ['LA_CENTRAL', 'LA_WEST', 'LA_EAST', 'OC_NORTH'],
    'OC_NORTH': ['LA_SOUTH', 'OC_SOUTH'],
    'OC_SOUTH': ['OC_NORTH', 'SD_NORTH'],
    'SF': ['EAST_BAY', 'PENINSULA'],
    'EAST_BAY': ['SF', 'PENINSULA', 'SOUTH_BAY'],
    'PENINSULA': ['SF', 'EAST_BAY', 'SOUTH_BAY'],
    'SOUTH_BAY': ['EAST_BAY', 'PENINSULA'],
    'RIVERSIDE': ['SAN_BERNARDINO'],
    'SAN_BERNARDINO': ['RIVERSIDE', 'LA_EAST'],
  };
  
  // Check if regions are adjacent
  if (adjacentRegions[region1]?.includes(region2)) return 50;
  
  // Different, non-adjacent regions
  return 30;
}

/**
 * Sort instructors by proximity to a target zip code
 * @param instructors - Array of instructors with optional lastLessonZip
 * @param targetZip - Target zip code to compare against
 * @returns Sorted array with highest proximity first
 */
export function sortByProximity<T extends { lastLessonZip?: string | null }>(
  items: T[],
  targetZip: string | null | undefined
): T[] {
  if (!targetZip) return items; // No sorting if no target zip
  
  return [...items].sort((a, b) => {
    const scoreA = calculateProximityScore(a.lastLessonZip, targetZip);
    const scoreB = calculateProximityScore(b.lastLessonZip, targetZip);
    return scoreB - scoreA; // Higher score first
  });
}
