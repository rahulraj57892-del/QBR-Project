/**
 * @file src/utils/kpiAnalytics.ts
 * @description Pure, deterministic, strongly typed KPI analytics engine for QBR Intelligence Studio.
 *
 * Implements:
 * - Precision-safe numeric calculations (absolute change, percentage change, percentage-point change).
 * - SLA and target compliance evaluations (higher_is_better vs lower_is_better).
 * - Relative shortfall calculation with configurable performance status thresholds (met, warning, critical, unrated).
 * - Mathematical trend vs business performance trend separation.
 * - Single and bulk KPI evaluations producing validated `KPIAnalysis` objects.
 * - Executive dashboard scorecard aggregation (`DashboardSummary`).
 * - Deterministic cross-quarter KPI comparison (`compareQuarters`).
 */

import type {
  KPI,
  KPIAnalysis,
  DashboardSummary,
  KPIDirection,
  KPIPerformanceStatus,
  TrendDirection,
  QoQComparison,
  ComparisonUnavailableReason,
} from '../types/qbr';
import { KPI_PERFORMANCE_THRESHOLDS } from '../config/constants';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Raw numerical movement between two quarters.
 */
export type NumericTrendDirection = 'increasing' | 'decreasing' | 'unchanged' | 'unknown';

/**
 * Business operational sentiment trend, taking KPI direction into account.
 */
export type PerformanceTrend = 'improving' | 'declining' | 'stable' | 'unknown';

/**
 * Result of comparing a single KPI between two quarter datasets.
 */
export interface KPIComparisonRecord {
  kpiId: string;
  name: string;
  unit: string;
  currentValue: number;
  previousValue: number | null;
  target: number | null;
  direction: KPIDirection;
  absoluteChange: number | null;
  percentageChange: number | null;
  percentagePointChange: number | null;
  targetMet: boolean | null;
  performanceStatus: KPIPerformanceStatus;
  rawTrend: NumericTrendDirection;
  performanceTrend: PerformanceTrend;
  analysis: KPIAnalysis;
  matchStatus: 'matched' | 'missing_previous' | 'ambiguous_previous';
}

/**
 * Consolidated result of comparing two quarter datasets.
 */
export interface QuarterComparisonResult {
  customerId: string;
  currentQuarterKPIsCount: number;
  previousQuarterKPIsCount: number;
  matchedKPIsCount: number;
  unmatchedCurrentKPIsCount: number;
  comparisons: KPIComparisonRecord[];
  summary: DashboardSummary;
}

// ============================================================================
// 1. Numeric Utility Functions
// ============================================================================

/**
 * Rounds a finite numerical value to the requested decimal precision.
 *
 * Invalid-input policy:
 * - If value is NaN or infinite, throws a TypeError.
 * - Precision is clamped between 0 and 15 decimal places.
 * - Uses Number.EPSILON to avoid binary floating-point representation rounding artifacts.
 *
 * @param value - The numerical value to round
 * @param decimals - The number of decimal places (integer between 0 and 15)
 * @returns Precision-rounded number
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`roundTo: expected a finite number, received ${value}`);
  }
  const safeDecimals = Math.max(0, Math.min(15, Math.floor(decimals)));
  const factor = 10 ** safeDecimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Calculates absolute difference between current and previous values.
 * Formula: current - previous
 *
 * @param current - Current quarter numerical value
 * @param previous - Previous quarter value, or null if unavailable
 * @returns The difference or null if either value is non-finite or unavailable
 */
export function calculateAbsoluteChange(
  current: number,
  previous: number | null
): number | null {
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return null;
  }
  return roundTo(current - previous, 4);
}

/**
 * Calculates the relative percentage change between current and previous values.
 * Formula: ((current - previous) / Math.abs(previous)) * 100
 *
 * Requirements:
 * - Returns null if previous is null.
 * - Returns null if previous is zero (division by zero avoided).
 * - Never returns NaN or Infinity.
 * - Supports negative baseline values via Math.abs(previous).
 * - Returns numerical percentage (e.g., -2.8 for -2.8%), not a formatted string.
 *
 * @param current - Current quarter value
 * @param previous - Previous quarter baseline value
 * @returns Relative percentage change, or null if mathematically undefined
 */
export function calculatePercentageChange(
  current: number,
  previous: number | null
): number | null {
  if (
    previous === null ||
    !Number.isFinite(previous) ||
    !Number.isFinite(current) ||
    previous === 0
  ) {
    return null;
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return Number.isFinite(pct) ? roundTo(pct, 2) : null;
}

/**
 * Calculates the percentage-point change between two percentage metrics.
 * Formula: current - previous
 *
 * Specifically intended for KPIs measured directly on a 0-100% scale (e.g., SLA compliance,
 * Service Availability). Differentiates absolute percentage points from relative percentage change.
 *
 * @param current - Current percentage value (0-100)
 * @param previous - Previous percentage value (0-100), or null
 * @returns Percentage point difference or null if previous is unavailable
 */
export function calculatePercentagePointChange(
  current: number,
  previous: number | null
): number | null {
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return null;
  }
  return roundTo(current - previous, 4);
}

// ============================================================================
// 2. Target Compliance Evaluation
// ============================================================================

/**
 * Evaluates whether a metric satisfies its defined SLA or target benchmark.
 *
 * Rules:
 * - higher_is_better: value >= target
 * - lower_is_better: value <= target
 * - If target is null or either number is non-finite, returns null (cannot evaluate).
 *
 * @param value - Actual recorded KPI value
 * @param target - Target benchmark, or null if no target defined
 * @param direction - Optimization direction ('higher_is_better' | 'lower_is_better')
 * @returns boolean indicating compliance, or null if target is unspecified
 */
export function evaluateTarget(
  value: number,
  target: number | null,
  direction: KPIDirection
): boolean | null {
  if (target === null || !Number.isFinite(target) || !Number.isFinite(value)) {
    return null;
  }
  return direction === 'higher_is_better' ? value >= target : value <= target;
}

// ============================================================================
// 3. KPI Performance Status
// ============================================================================

/**
 * Classifies KPI performance status against targets using the configured 5% tolerance policy.
 *
 * Policy:
 * 1. Target Met: Returns 'met' (meets or exceeds target).
 * 2. Target Missed:
 *    - Shortfall is computed relative to the absolute target value.
 *    - Shortfall <= 5% (warningToleranceRatio): returns 'underperforming' (Warning).
 *    - Shortfall > 5% (criticalToleranceRatio): returns 'critical'.
 * 3. Special Case: target = 0:
 *    - If met (e.g. value <= 0 for lower_is_better), returns 'met'.
 *    - If missed (value > 0), returns 'critical' because relative deviation is undefined.
 * 4. Missing/Invalid target or value: returns 'unrated'.
 *
 * @param value - Actual recorded metric value
 * @param target - Benchmark target, or null
 * @param direction - 'higher_is_better' | 'lower_is_better'
 * @returns KPIPerformanceStatus ('met' | 'underperforming' | 'critical' | 'unrated')
 */
export function getPerformanceStatus(
  value: number,
  target: number | null,
  direction: KPIDirection
): KPIPerformanceStatus {
  if (target === null || !Number.isFinite(target) || !Number.isFinite(value)) {
    return 'unrated';
  }

  const isMet = evaluateTarget(value, target, direction);
  if (isMet === true) {
    return 'met';
  }

  // Handle target = 0 division edge-case
  if (target === 0) {
    return 'critical';
  }

  // Calculate relative shortfall percentage
  const absTarget = Math.abs(target);
  let shortfallPct: number;
  if (direction === 'higher_is_better') {
    shortfallPct = ((target - value) / absTarget) * 100;
  } else {
    shortfallPct = ((value - target) / absTarget) * 100;
  }

  const warningLimitPct = KPI_PERFORMANCE_THRESHOLDS.warningToleranceRatio * 100;

  if (shortfallPct <= warningLimitPct) {
    return 'underperforming'; // Warning status in domain model
  }

  return 'critical';
}

// ============================================================================
// 4. Trend Analysis
// ============================================================================

/**
 * Determines raw numerical movement between current and previous values.
 * Uses exact floating-point tolerance (1e-9) to avoid jitter.
 *
 * @param current - Current period value
 * @param previous - Previous period value, or null
 * @returns 'increasing' | 'decreasing' | 'unchanged' | 'unknown'
 */
export function getTrendDirection(
  current: number,
  previous: number | null
): NumericTrendDirection {
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return 'unknown';
  }
  const diff = current - previous;
  if (Math.abs(diff) < 1e-9) {
    return 'unchanged';
  }
  return diff > 0 ? 'increasing' : 'decreasing';
}

/**
 * Determines operational business performance trend, combining numerical movement with KPI direction.
 *
 * Rules:
 * - higher_is_better: increasing = improving, decreasing = declining
 * - lower_is_better: decreasing = improving, increasing = declining
 * - unchanged: stable
 * - previous unavailable/invalid: unknown
 *
 * @param current - Current period value
 * @param previous - Previous period value, or null
 * @param direction - 'higher_is_better' | 'lower_is_better'
 * @returns 'improving' | 'declining' | 'stable' | 'unknown'
 */
export function getPerformanceTrend(
  current: number,
  previous: number | null,
  direction: KPIDirection
): PerformanceTrend {
  const rawTrend = getTrendDirection(current, previous);
  if (rawTrend === 'unknown') {
    return 'unknown';
  }
  if (rawTrend === 'unchanged') {
    return 'stable';
  }

  if (direction === 'higher_is_better') {
    return rawTrend === 'increasing' ? 'improving' : 'declining';
  }

  // lower_is_better
  return rawTrend === 'decreasing' ? 'improving' : 'declining';
}

/**
 * Maps internal PerformanceTrend to the domain TrendDirection union in `src/types/qbr.ts`.
 */
export function toDomainTrendDirection(trend: PerformanceTrend): TrendDirection {
  switch (trend) {
    case 'improving':
      return 'improving';
    case 'declining':
      return 'degrading';
    case 'stable':
      return 'neutral';
    case 'unknown':
    default:
      return 'inconclusive';
  }
}

// ============================================================================
// 5. Individual KPI Analysis
// ============================================================================

/**
 * Generates deterministic, human-readable commentary for a KPI based strictly on actual data.
 */
function generateDeterministicNotes(
  kpi: KPI,
  targetMet: boolean | null,
  performanceTrend: PerformanceTrend,
  absoluteChange: number | null,
  percentageChange: number | null
): string {
  const unitSuffix = kpi.unit === 'percentage' ? '%' : ` ${kpi.unit.replace(/_/g, ' ')}`;
  const targetText =
    kpi.target !== null
      ? `the ${kpi.target}${unitSuffix} target`
      : 'no formal target';

  // Format compliance clause
  let complianceClause: string;
  if (targetMet === null) {
    complianceClause = 'has no target benchmark set';
  } else if (targetMet) {
    complianceClause = `meets ${targetText}`;
  } else {
    complianceClause = `is below ${targetText}`;
  }

  // Format trend clause
  if (kpi.previousQuarterValue === null || absoluteChange === null) {
    return `${kpi.name} is currently recorded at ${kpi.value}${unitSuffix} and ${complianceClause}. Baseline data from previous quarter is unavailable.`;
  }

  const changeVerb = absoluteChange > 0 ? 'increased' : absoluteChange < 0 ? 'decreased' : 'remained steady';
  const absDiff = Math.abs(absoluteChange);

  let changeDescription: string;
  if (kpi.unit === 'percentage') {
    changeDescription = `${changeVerb} by ${absDiff} percentage points`;
  } else {
    const pctPart = percentageChange !== null ? ` (${percentageChange > 0 ? '+' : ''}${percentageChange}%)` : '';
    changeDescription = `${changeVerb} by ${absDiff}${unitSuffix}${pctPart}`;
  }

  const sentimentClause =
    performanceTrend === 'improving'
      ? 'representing an operational improvement'
      : performanceTrend === 'declining'
      ? 'indicating performance degradation'
      : 'showing stable operational performance';

  return `${kpi.name} ${changeDescription} compared with the previous quarter (${sentimentClause}) and ${complianceClause}.`;
}

/**
 * Analyzes a single KPI record, producing a fully populated KPIAnalysis object conforming to `src/types/qbr.ts`.
 *
 * @param kpi - The KPI record to evaluate
 * @returns Fully populated KPIAnalysis
 */
export function analyzeKPI(kpi: KPI): KPIAnalysis {
  const absChange = calculateAbsoluteChange(kpi.value, kpi.previousQuarterValue);
  const pctChange = calculatePercentageChange(kpi.value, kpi.previousQuarterValue);
  const targetMet = evaluateTarget(kpi.value, kpi.target, kpi.direction);
  const performanceStatus = getPerformanceStatus(kpi.value, kpi.target, kpi.direction);
  const perfTrend = getPerformanceTrend(kpi.value, kpi.previousQuarterValue, kpi.direction);
  const domainTrend = toDomainTrendDirection(perfTrend);

  // Construct QoQ comparison metadata
  let unavailableReason: ComparisonUnavailableReason | null = null;
  if (kpi.previousQuarterValue === null) {
    unavailableReason = 'no_previous_data';
  } else if (kpi.previousQuarterValue === 0) {
    unavailableReason = 'previous_value_zero';
  }

  const comparisonMetadata: QoQComparison = {
    isAvailable: unavailableReason === null,
    unavailableReason,
    percentageChange: pctChange,
    absoluteChange: absChange,
  };

  const analysisNotes = generateDeterministicNotes(
    kpi,
    targetMet,
    perfTrend,
    absChange,
    pctChange
  );

  return {
    kpiId: kpi.id,
    currentValue: kpi.value,
    previousValue: kpi.previousQuarterValue,
    absoluteChange: absChange,
    percentageChange: pctChange,
    comparisonMetadata,
    target: kpi.target,
    targetMet,
    performanceStatus,
    trendDirection: domainTrend,
    analysisNotes,
  };
}

// ============================================================================
// 6. Bulk KPI Analysis
// ============================================================================

/**
 * Evaluates an array of KPI records, preserving order and immutability.
 *
 * @param kpis - Array of KPI records
 * @returns Array of KPIAnalysis results
 */
export function analyzeKPIs(kpis: readonly KPI[] | KPI[]): KPIAnalysis[] {
  if (!Array.isArray(kpis) || kpis.length === 0) {
    return [];
  }
  return kpis.map((kpi) => analyzeKPI(kpi));
}

// ============================================================================
// 7. Dashboard Summary Generator
// ============================================================================

/**
 * Aggregates high-level scorecard metrics for a set of KPI records.
 *
 * Formula:
 * - overallPerformanceScore = (targetsMet / evaluableKPIs) * 100
 * - KPIs without targets are excluded from the evaluable denominator.
 * - If no KPIs have targets, overallPerformanceScore is null.
 *
 * @param kpis - KPI records for a specific quarter
 * @param criticalAnomaliesCount - Count of critical anomalies supplied by the caller (default 0).
 *        Note: 0 indicates zero supplied critical anomalies, not proof that none exist.
 * @returns DashboardSummary conforming to `src/types/qbr.ts`
 */
export function generateDashboardSummary(
  kpis: readonly KPI[] | KPI[],
  criticalAnomaliesCount: number = 0
): DashboardSummary {
  if (!Array.isArray(kpis) || kpis.length === 0) {
    return {
      totalKPIs: 0,
      targetsMet: 0,
      targetsMissed: 0,
      improvingKPIs: 0,
      decliningKPIs: 0,
      criticalAnomalies: Math.max(0, Math.floor(criticalAnomaliesCount)),
      overallPerformanceScore: null,
    };
  }

  let targetsMet = 0;
  let targetsMissed = 0;
  let evaluableKPIs = 0;
  let improvingKPIs = 0;
  let decliningKPIs = 0;

  for (const kpi of kpis) {
    // Target evaluation
    const met = evaluateTarget(kpi.value, kpi.target, kpi.direction);
    if (met !== null) {
      evaluableKPIs++;
      if (met) {
        targetsMet++;
      } else {
        targetsMissed++;
      }
    }

    // Performance trend evaluation
    const trend = getPerformanceTrend(kpi.value, kpi.previousQuarterValue, kpi.direction);
    if (trend === 'improving') {
      improvingKPIs++;
    } else if (trend === 'declining') {
      decliningKPIs++;
    }
  }

  const overallScore =
    evaluableKPIs > 0
      ? roundTo((targetsMet / evaluableKPIs) * 100, 2)
      : null;

  return {
    totalKPIs: kpis.length,
    targetsMet,
    targetsMissed,
    improvingKPIs,
    decliningKPIs,
    criticalAnomalies: Math.max(0, Math.floor(criticalAnomaliesCount)),
    overallPerformanceScore: overallScore,
  };
}

// ============================================================================
// 8. Quarter-on-Quarter Comparison
// ============================================================================

/**
 * Generates a stable key for matching a KPI across quarterly datasets.
 * Keys combine customerId, lowercased KPI name, and unit.
 */
function createKPIMatchKey(kpi: KPI): string {
  return `${kpi.customerId}:${kpi.name.trim().toLowerCase()}:${kpi.unit}`;
}

/**
 * Compares current quarter KPIs against previous quarter KPIs with stable identity resolution.
 *
 * Requirements:
 * - Matches by customerId, name, and unit rather than quarter-specific IDs.
 * - Never matches records across different customers.
 * - Preserves the ordering of currentKPIs.
 * - Detects missing or duplicate/ambiguous matches in previousKPIs.
 *
 * @param currentKPIs - KPIs for the current reporting period
 * @param previousKPIs - KPIs from the preceding baseline period
 * @returns Strongly typed QuarterComparisonResult
 */
export function compareQuarters(
  currentKPIs: readonly KPI[] | KPI[],
  previousKPIs: readonly KPI[] | KPI[]
): QuarterComparisonResult {
  if (!Array.isArray(currentKPIs) || currentKPIs.length === 0) {
    return {
      customerId: previousKPIs[0]?.customerId || '',
      currentQuarterKPIsCount: 0,
      previousQuarterKPIsCount: previousKPIs.length,
      matchedKPIsCount: 0,
      unmatchedCurrentKPIsCount: 0,
      comparisons: [],
      summary: generateDashboardSummary([]),
    };
  }

  const primaryCustomerId = currentKPIs[0].customerId;

  // Index previous KPIs by stable identity key
  const previousMap = new Map<string, KPI[]>();
  for (const prev of previousKPIs) {
    if (prev.customerId !== primaryCustomerId) {
      continue; // Enforce strict customer isolation
    }
    const key = createKPIMatchKey(prev);
    const existing = previousMap.get(key) || [];
    existing.push(prev);
    previousMap.set(key, existing);
  }

  const comparisons: KPIComparisonRecord[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const current of currentKPIs) {
    const key = createKPIMatchKey(current);
    const matchingPrevList = previousMap.get(key);

    let previousVal: number | null = null;
    let matchStatus: KPIComparisonRecord['matchStatus'] = 'missing_previous';

    if (matchingPrevList && matchingPrevList.length === 1) {
      previousVal = matchingPrevList[0].value;
      matchStatus = 'matched';
      matchedCount++;
    } else if (matchingPrevList && matchingPrevList.length > 1) {
      // Ambiguous multiple matches found in previous period
      previousVal = null;
      matchStatus = 'ambiguous_previous';
      unmatchedCount++;
    } else {
      unmatchedCount++;
    }

    // Build synthesized KPI for unified analysis
    const synthesizedKPI: KPI = {
      ...current,
      previousQuarterValue: previousVal,
    };

    const analysis = analyzeKPI(synthesizedKPI);
    const absChange = calculateAbsoluteChange(current.value, previousVal);
    const pctChange = calculatePercentageChange(current.value, previousVal);
    const ptChange =
      current.unit === 'percentage'
        ? calculatePercentagePointChange(current.value, previousVal)
        : null;

    const rawTrend = getTrendDirection(current.value, previousVal);
    const perfTrend = getPerformanceTrend(current.value, previousVal, current.direction);

    comparisons.push({
      kpiId: current.id,
      name: current.name,
      unit: current.unit,
      currentValue: current.value,
      previousValue: previousVal,
      target: current.target,
      direction: current.direction,
      absoluteChange: absChange,
      percentageChange: pctChange,
      percentagePointChange: ptChange,
      targetMet: analysis.targetMet,
      performanceStatus: analysis.performanceStatus,
      rawTrend,
      performanceTrend: perfTrend,
      analysis,
      matchStatus,
    });
  }

  const summary = generateDashboardSummary(currentKPIs);

  return {
    customerId: primaryCustomerId,
    currentQuarterKPIsCount: currentKPIs.length,
    previousQuarterKPIsCount: previousKPIs.length,
    matchedKPIsCount: matchedCount,
    unmatchedCurrentKPIsCount: unmatchedCount,
    comparisons,
    summary,
  };
}
