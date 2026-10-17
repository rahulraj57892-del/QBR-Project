/**
 * @file src/utils/anomalyDetection.ts
 * @description Strongly typed, deterministic rule-based anomaly detection engine for QBR Intelligence Studio.
 *
 * Implements:
 * - Target breach detection using performance classification rules.
 * - Sudden unfavorable quarter-on-quarter change detection (percentage-point vs relative variance).
 * - Comprehensive data quality validation for uploaded and ingested KPI records.
 * - Deterministic severity scoring (critical, high, medium, low).
 * - Stable, collision-free anomaly identifier generation and reproducible timestamps.
 * - Domain-tailored, evidence-grounded ITSM operational recommendations.
 * - Filtering, severity sorting, and anomaly summary aggregation.
 */

import type {
  KPI,
  Anomaly,
  AnomalyType,
  AnomalySeverity,
  ISODateString,
} from '../types/qbr';
import {
  evaluateTarget,
  getPerformanceStatus,
} from './kpiAnalytics';

// ============================================================================
// 1. Anomaly Detection Configuration
// ============================================================================

export const ANOMALY_DETECTION_CONFIG = {
  /** Relative percentage variance threshold for count/duration metrics triggering warning (medium) severity */
  relativeChangeWarningPercent: 15,
  /** Relative percentage variance threshold for count/duration metrics triggering critical (high) severity */
  relativeChangeCriticalPercent: 30,
  /** Minimum absolute difference required before count/duration metrics trigger sudden change alarms */
  minimumAbsoluteChange: 1,
  /** Absolute percentage points drop triggering warning (medium) severity for percentage-based KPIs */
  percentagePointWarningThreshold: 2,
  /** Absolute percentage points drop triggering critical (high) severity for percentage-based KPIs */
  percentagePointCriticalThreshold: 5,
  /** Minimum absolute increase required to trigger sudden change on zero-baseline count metrics */
  zeroBaselineAbsoluteWarningThreshold: 3,
  /** Feature toggles */
  enableTargetBreachDetection: true,
  enableSuddenChangeDetection: true,
  enableDataQualityChecks: true,
} as const;

export type AnomalyDetectionConfig = typeof ANOMALY_DETECTION_CONFIG;

/**
 * Summary scorecard of detected anomalies across a dataset.
 */
export interface AnomalySummary {
  totalAnomalies: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  affectedKPICount: number;
  targetBreachCount: number;
  suddenChangeCount: number;
  dataQualityIssueCount: number;
}

// ============================================================================
// Internal Deterministic Helpers
// ============================================================================

/**
 * Generates a stable ISO 8601 timestamp based deterministically on the quarter identifier.
 * Avoids Date.now() to ensure reproducible test runs.
 *
 * @param quarterId - Quarter identifier (e.g., 'quarter-apex-2026-q1')
 * @returns Standardized ISO 8601 string
 */
export function getDeterministicTimestamp(quarterId: string): ISODateString {
  const match = quarterId.match(/(\d{4})-(q[1-4])/i);
  if (match) {
    const year = match[1];
    const q = match[2].toLowerCase();
    switch (q) {
      case 'q1':
        return `${year}-03-31T23:59:59.000Z`;
      case 'q2':
        return `${year}-06-30T23:59:59.000Z`;
      case 'q3':
        return `${year}-09-30T23:59:59.000Z`;
      case 'q4':
        return `${year}-12-31T23:59:59.000Z`;
    }
  }
  // Default fixed deterministic dataset reference timestamp
  return '2026-09-30T23:59:59.000Z';
}

/**
 * Maps known operational KPI metrics to deterministic remediation actions.
 */
export function getRecommendationForKPI(
  kpiName: string,
  anomalyType: AnomalyType
): string {
  const normalized = kpiName.trim().toLowerCase();

  if (anomalyType === 'outlier') {
    return 'Verify the raw source spreadsheet formatting, column mappings, and value boundaries.';
  }

  if (normalized.includes('availability') || normalized.includes('uptime')) {
    return 'Investigate availability degradation, service outages, and infrastructure dependencies.';
  }
  if (normalized.includes('sla compliance') || normalized.includes('first response')) {
    return 'Review SLA breach drivers, affected incidents, response delays, and resolution bottlenecks.';
  }
  if (normalized.includes('p1') || normalized.includes('major incident')) {
    return 'Review major incident records, recovery procedures, and problem management follow-ups.';
  }
  if (normalized.includes('incident')) {
    return 'Analyze incident categories, recurring failures, and preventive action opportunities.';
  }
  if (normalized.includes('mean time to resolve') || normalized.includes('mttr')) {
    return 'Examine resolution bottlenecks, escalation delays, and operational runbooks.';
  }
  if (normalized.includes('false positive')) {
    return 'Review monitoring rules, alert correlation, and threshold tuning.';
  }
  if (normalized.includes('alert')) {
    return 'Review alert thresholds, event correlation, and monitoring noise.';
  }
  if (normalized.includes('change')) {
    return 'Review failed changes, rollback outcomes, and change validation procedures.';
  }
  if (normalized.includes('satisfaction') || normalized.includes('csat')) {
    return 'Review negative customer feedback themes, communication cadences, and service expectations.';
  }
  if (normalized.includes('service request')) {
    return 'Analyze request fulfillment queues, approval bottlenecks, and catalog automation.';
  }

  return 'Review operational drivers, historical patterns, and resource allocation for this metric.';
}

// ============================================================================
// 2. Data Quality Validation
// ============================================================================

/**
 * Validates a KPI record against schema and domain consistency rules.
 *
 * Checks:
 * - NaN, Infinity, -Infinity in value, target, or previousQuarterValue
 * - Percentage values outside 0-100 range
 * - Customer satisfaction scores outside 0-5 range
 * - Negative counts or non-integer count values
 * - Missing KPI name, customerId, or quarterId
 *
 * @param kpi - The KPI record to validate
 * @returns Array of data quality anomalies (empty if valid)
 */
export function validateKPIData(kpi: KPI): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const timestamp = getDeterministicTimestamp(kpi.quarterId || '');

  // 1. Missing Identifiers
  if (!kpi.name || kpi.name.trim() === '') {
    anomalies.push({
      id: `anomaly-${kpi.id || 'unknown'}-missing-name`,
      kpiId: kpi.id,
      anomalyType: 'outlier',
      severity: 'high',
      description: 'KPI record is missing a required name or title.',
      detectedAt: timestamp,
      recommendedAction: getRecommendationForKPI('', 'outlier'),
    });
  }

  if (!kpi.customerId || !kpi.quarterId) {
    anomalies.push({
      id: `anomaly-${kpi.id || 'unknown'}-missing-refs`,
      kpiId: kpi.id,
      anomalyType: 'outlier',
      severity: 'high',
      description: 'KPI record is missing required customer or quarter foreign references.',
      detectedAt: timestamp,
      recommendedAction: getRecommendationForKPI('', 'outlier'),
    });
  }

  // 2. Value finiteness
  if (typeof kpi.value !== 'number' || !Number.isFinite(kpi.value)) {
    anomalies.push({
      id: `anomaly-${kpi.id}-invalid-value`,
      kpiId: kpi.id,
      anomalyType: 'outlier',
      severity: 'high',
      description: `KPI "${kpi.name}" contains an invalid non-finite value (${String(kpi.value)}).`,
      detectedAt: timestamp,
      recommendedAction: getRecommendationForKPI(kpi.name, 'outlier'),
    });
  }

  // 3. Target finiteness
  if (kpi.target !== null && (typeof kpi.target !== 'number' || !Number.isFinite(kpi.target))) {
    anomalies.push({
      id: `anomaly-${kpi.id}-invalid-target`,
      kpiId: kpi.id,
      anomalyType: 'outlier',
      severity: 'medium',
      description: `KPI "${kpi.name}" has an invalid non-finite target (${String(kpi.target)}).`,
      detectedAt: timestamp,
      recommendedAction: getRecommendationForKPI(kpi.name, 'outlier'),
    });
  }

  // 4. Previous value finiteness
  if (
    kpi.previousQuarterValue !== null &&
    (typeof kpi.previousQuarterValue !== 'number' || !Number.isFinite(kpi.previousQuarterValue))
  ) {
    anomalies.push({
      id: `anomaly-${kpi.id}-invalid-previous`,
      kpiId: kpi.id,
      anomalyType: 'outlier',
      severity: 'medium',
      description: `KPI "${kpi.name}" has an invalid non-finite previous quarter value (${String(kpi.previousQuarterValue)}).`,
      detectedAt: timestamp,
      recommendedAction: getRecommendationForKPI(kpi.name, 'outlier'),
    });
  }

  // If value is finite, perform domain range checks
  if (typeof kpi.value === 'number' && Number.isFinite(kpi.value)) {
    // Percentage range: 0 to 100
    if (kpi.unit === 'percentage' && (kpi.value < 0 || kpi.value > 100)) {
      anomalies.push({
        id: `anomaly-${kpi.id}-percentage-out-of-range`,
        kpiId: kpi.id,
        anomalyType: 'outlier',
        severity: 'high',
        description: `Percentage KPI "${kpi.name}" has an out-of-range value of ${kpi.value}%. Must be between 0% and 100%.`,
        detectedAt: timestamp,
        recommendedAction: getRecommendationForKPI(kpi.name, 'outlier'),
      });
    }

    // CSAT 5-point scale range: 0 to 5
    if (kpi.unit === 'score_out_of_5' && (kpi.value < 0 || kpi.value > 5)) {
      anomalies.push({
        id: `anomaly-${kpi.id}-csat-out-of-range`,
        kpiId: kpi.id,
        anomalyType: 'outlier',
        severity: 'high',
        description: `CSAT KPI "${kpi.name}" has an out-of-range score of ${kpi.value} (expected 0 to 5 scale).`,
        detectedAt: timestamp,
        recommendedAction: getRecommendationForKPI(kpi.name, 'outlier'),
      });
    }

    // Count non-negative
    if (kpi.unit === 'count' && kpi.value < 0) {
      anomalies.push({
        id: `anomaly-${kpi.id}-negative-count`,
        kpiId: kpi.id,
        anomalyType: 'outlier',
        severity: 'high',
        description: `Count metric "${kpi.name}" cannot have a negative value (${kpi.value}).`,
        detectedAt: timestamp,
        recommendedAction: getRecommendationForKPI(kpi.name, 'outlier'),
      });
    }

    // Count integer check
    if (kpi.unit === 'count' && !Number.isInteger(kpi.value)) {
      anomalies.push({
        id: `anomaly-${kpi.id}-fractional-count`,
        kpiId: kpi.id,
        anomalyType: 'outlier',
        severity: 'low',
        description: `Count metric "${kpi.name}" contains a fractional count (${kpi.value}). Counts should be whole integers.`,
        detectedAt: timestamp,
        recommendedAction: getRecommendationForKPI(kpi.name, 'outlier'),
      });
    }
  }

  return anomalies;
}

// ============================================================================
// 3. Target Breach Detection
// ============================================================================

/**
 * Evaluates whether a KPI has breached its SLA or target benchmark.
 *
 * Severity mapping:
 * - Warning performance shortfall (<= 5% relative variance) -> 'medium' anomaly severity.
 * - Critical performance shortfall (> 5% relative variance) -> 'high' anomaly severity.
 * - Catastrophic shortfall (> 30% relative variance or target = 0 breach) -> 'critical' anomaly severity.
 *
 * @param kpi - The KPI record
 * @returns Anomaly record if target is breached, or null if target is met or unconfigured
 */
export function detectTargetBreach(kpi: KPI): Anomaly | null {
  if (!ANOMALY_DETECTION_CONFIG.enableTargetBreachDetection) {
    return null;
  }

  // Must have a valid target and valid value
  if (
    kpi.target === null ||
    !Number.isFinite(kpi.target) ||
    !Number.isFinite(kpi.value)
  ) {
    return null;
  }

  const isMet = evaluateTarget(kpi.value, kpi.target, kpi.direction);
  if (isMet !== false) {
    return null; // Target is met or cannot be evaluated
  }

  const perfStatus = getPerformanceStatus(kpi.value, kpi.target, kpi.direction);
  const timestamp = getDeterministicTimestamp(kpi.quarterId);
  const unitSuffix = kpi.unit === 'percentage' ? '%' : ` ${kpi.unit.replace(/_/g, ' ')}`;

  // Determine anomaly severity
  let severity: AnomalySeverity = 'medium';
  if (perfStatus === 'critical') {
    // Differentiate high from catastrophic critical severity
    if (kpi.target === 0) {
      severity = 'critical';
    } else {
      const absTarget = Math.abs(kpi.target);
      const shortfallPct =
        kpi.direction === 'higher_is_better'
          ? ((kpi.target - kpi.value) / absTarget) * 100
          : ((kpi.value - kpi.target) / absTarget) * 100;

      severity = shortfallPct >= 30 ? 'critical' : 'high';
    }
  } else if (perfStatus === 'underperforming') {
    severity = 'medium';
  }

  const comparisonVerb = kpi.direction === 'higher_is_better' ? 'fell short of' : 'exceeded maximum threshold of';

  return {
    id: `anomaly-${kpi.id}-target-breach`,
    kpiId: kpi.id,
    anomalyType: 'target_divergence',
    severity,
    description: `Target breach: "${kpi.name}" recorded ${kpi.value}${unitSuffix}, which ${comparisonVerb} the target of ${kpi.target}${unitSuffix}.`,
    detectedAt: timestamp,
    recommendedAction: getRecommendationForKPI(kpi.name, 'target_divergence'),
  };
}

// ============================================================================
// 4. Sudden Unfavorable Change Detection
// ============================================================================

/**
 * Detects sudden unfavorable quarter-on-quarter performance degradation.
 *
 * Rules:
 * - If previousQuarterValue is null: returns null (Q1 or missing baseline is not an anomaly).
 * - If trend is improving or stable: returns null.
 * - Percentage-scale KPIs: evaluated using absolute percentage-point drop.
 *   - >= 2 points -> 'medium' severity
 *   - >= 5 points -> 'high' severity
 * - Count/duration KPIs: evaluated using relative percentage change with minimum absolute movement filter.
 *   - >= 15% -> 'medium' severity
 *   - >= 30% -> 'high' severity
 * - Zero-baseline edge case:
 *   - Avoids divide-by-zero.
 *   - Only flags if absolute increase exceeds zeroBaselineAbsoluteWarningThreshold.
 *
 * @param kpi - The KPI record
 * @returns Anomaly if sudden degradation detected, or null
 */
export function detectSuddenChange(kpi: KPI): Anomaly | null {
  if (!ANOMALY_DETECTION_CONFIG.enableSuddenChangeDetection) {
    return null;
  }

  const { value: current, previousQuarterValue: previous, direction, unit } = kpi;

  // Missing or non-finite previous value cannot trigger sudden change
  if (previous === null || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return null;
  }

  const timestamp = getDeterministicTimestamp(kpi.quarterId);

  // Check if direction is unfavorable
  const isUnfavorable =
    direction === 'higher_is_better' ? current < previous : current > previous;

  if (!isUnfavorable) {
    return null; // Improving or unchanged
  }

  const anomalyType: AnomalyType = direction === 'higher_is_better' ? 'sudden_drop' : 'sudden_spike';

  // Branch A: Percentage-unit metrics (use percentage point delta)
  if (unit === 'percentage') {
    const ptDrop = Math.abs(current - previous);

    if (ptDrop < ANOMALY_DETECTION_CONFIG.percentagePointWarningThreshold) {
      return null;
    }

    const severity: AnomalySeverity =
      ptDrop >= ANOMALY_DETECTION_CONFIG.percentagePointCriticalThreshold
        ? 'high'
        : 'medium';

    return {
      id: `anomaly-${kpi.id}-sudden-change`,
      kpiId: kpi.id,
      anomalyType,
      severity,
      description: `Sudden performance drop: "${kpi.name}" deteriorated by ${ptDrop.toFixed(2)} percentage points compared with the previous quarter (${previous}% to ${current}%).`,
      detectedAt: timestamp,
      recommendedAction: getRecommendationForKPI(kpi.name, anomalyType),
    };
  }

  // Branch B: Count / Duration / Non-percentage metrics
  const absDiff = Math.abs(current - previous);

  // Filter out negligible absolute movements
  if (absDiff < ANOMALY_DETECTION_CONFIG.minimumAbsoluteChange) {
    return null;
  }

  // Handle zero-baseline edge case
  if (previous === 0) {
    // If target is met, do not alarm on zero baseline unless absolute jump is large
    const isTargetMet = evaluateTarget(current, kpi.target, direction);
    if (isTargetMet === true) {
      return null;
    }

    if (absDiff >= ANOMALY_DETECTION_CONFIG.zeroBaselineAbsoluteWarningThreshold) {
      return {
        id: `anomaly-${kpi.id}-sudden-change`,
        kpiId: kpi.id,
        anomalyType,
        severity: 'medium',
        description: `Sudden increase from zero baseline: "${kpi.name}" increased by +${absDiff} compared with previous quarter baseline of 0.`,
        detectedAt: timestamp,
        recommendedAction: getRecommendationForKPI(kpi.name, anomalyType),
      };
    }
    return null;
  }

  // Relative percentage change calculation
  const relChangePct = (absDiff / Math.abs(previous)) * 100;

  if (relChangePct < ANOMALY_DETECTION_CONFIG.relativeChangeWarningPercent) {
    return null;
  }

  const severity: AnomalySeverity =
    relChangePct >= ANOMALY_DETECTION_CONFIG.relativeChangeCriticalPercent
      ? 'high'
      : 'medium';

  const unitSuffix = ` ${unit.replace(/_/g, ' ')}`;
  const movementVerb = direction === 'higher_is_better' ? 'dropped' : 'spiked';

  return {
    id: `anomaly-${kpi.id}-sudden-change`,
    kpiId: kpi.id,
    anomalyType,
    severity,
    description: `Sudden unfavorable change: "${kpi.name}" ${movementVerb} by ${relChangePct.toFixed(1)}% (+${absDiff}${unitSuffix}) from ${previous} to ${current}.`,
    detectedAt: timestamp,
    recommendedAction: getRecommendationForKPI(kpi.name, anomalyType),
  };
}

// ============================================================================
// 5. Single KPI Anomaly Detection
// ============================================================================

/**
 * Runs all detection rules against a single KPI record, aggregating unique anomalies.
 *
 * @param kpi - The KPI record to inspect
 * @returns Array of unique Anomaly objects (empty if no anomalies detected)
 */
export function detectKPIAnomalies(kpi: KPI): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // 1. Data Quality Checks
  if (ANOMALY_DETECTION_CONFIG.enableDataQualityChecks) {
    const qualityAnomalies = validateKPIData(kpi);
    anomalies.push(...qualityAnomalies);

    // If severe data quality violations exist on value, skip business rule checks to avoid misleading alerts
    const hasFatalValueAnomaly = qualityAnomalies.some(
      (a) =>
        a.id.includes('invalid-value') ||
        a.id.includes('percentage-out-of-range') ||
        a.id.includes('csat-out-of-range')
    );
    if (hasFatalValueAnomaly) {
      return anomalies;
    }
  }

  // 2. Target Breach
  const breach = detectTargetBreach(kpi);
  if (breach) {
    anomalies.push(breach);
  }

  // 3. Sudden Unfavorable Change
  const sudden = detectSuddenChange(kpi);
  if (sudden) {
    anomalies.push(sudden);
  }

  return anomalies;
}

// ============================================================================
// 6. Bulk Anomaly Detection
// ============================================================================

/**
 * Scans an array of KPI records for anomalies, preserving deterministic order and deduplication.
 *
 * @param kpis - Array of KPI records
 * @returns Flattened array of detected Anomaly records
 */
export function detectAnomalies(kpis: readonly KPI[] | KPI[]): Anomaly[] {
  if (!Array.isArray(kpis) || kpis.length === 0) {
    return [];
  }

  const results: Anomaly[] = [];
  const seenIds = new Set<string>();

  for (const kpi of kpis) {
    const kpiAnomalies = detectKPIAnomalies(kpi);
    for (const anomaly of kpiAnomalies) {
      if (!seenIds.has(anomaly.id)) {
        seenIds.add(anomaly.id);
        results.push(anomaly);
      }
    }
  }

  return results;
}

// ============================================================================
// 7. Anomaly Severity Sorting
// ============================================================================

const SEVERITY_ORDER: Record<AnomalySeverity, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

/**
 * Sorts anomalies by severity descending (critical -> high -> medium -> low) while preserving stable ordering.
 * Does not mutate the input array.
 *
 * @param anomalies - Array of anomalies
 * @returns New sorted array of anomalies
 */
export function sortAnomaliesBySeverity(
  anomalies: readonly Anomaly[] | Anomaly[]
): Anomaly[] {
  if (!Array.isArray(anomalies) || anomalies.length === 0) {
    return [];
  }
  return [...anomalies].sort((a, b) => {
    const rankA = SEVERITY_ORDER[a.severity] ?? 99;
    const rankB = SEVERITY_ORDER[b.severity] ?? 99;
    return rankA - rankB;
  });
}

// ============================================================================
// 8. Anomaly Summary
// ============================================================================

/**
 * Aggregates summary counts and statistics across an array of anomalies.
 *
 * @param anomalies - Array of detected anomalies
 * @returns AnomalySummary
 */
export function summarizeAnomalies(
  anomalies: readonly Anomaly[] | Anomaly[]
): AnomalySummary {
  if (!Array.isArray(anomalies) || anomalies.length === 0) {
    return {
      totalAnomalies: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      affectedKPICount: 0,
      targetBreachCount: 0,
      suddenChangeCount: 0,
      dataQualityIssueCount: 0,
    };
  }

  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let targetBreachCount = 0;
  let suddenChangeCount = 0;
  let dataQualityIssueCount = 0;

  const affectedKPIIds = new Set<string>();

  for (const anomaly of anomalies) {
    // Severity counts
    switch (anomaly.severity) {
      case 'critical':
        criticalCount++;
        break;
      case 'high':
        highCount++;
        break;
      case 'medium':
        mediumCount++;
        break;
      case 'low':
        lowCount++;
        break;
    }

    // Type classification counts
    if (anomaly.anomalyType === 'target_divergence' || anomaly.anomalyType === 'repeated_breach') {
      targetBreachCount++;
    } else if (anomaly.anomalyType === 'sudden_spike' || anomaly.anomalyType === 'sudden_drop') {
      suddenChangeCount++;
    } else if (anomaly.anomalyType === 'outlier') {
      dataQualityIssueCount++;
    }

    if (anomaly.kpiId) {
      affectedKPIIds.add(anomaly.kpiId);
    }
  }

  return {
    totalAnomalies: anomalies.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    affectedKPICount: affectedKPIIds.size,
    targetBreachCount,
    suddenChangeCount,
    dataQualityIssueCount,
  };
}

// ============================================================================
// 9. Filtering Helpers
// ============================================================================

/**
 * Filters anomalies by an exact severity tier.
 */
export function getAnomaliesBySeverity(
  anomalies: readonly Anomaly[] | Anomaly[],
  severity: AnomalySeverity
): Anomaly[] {
  if (!Array.isArray(anomalies)) return [];
  return anomalies.filter((a) => a.severity === severity);
}

/**
 * Filters anomalies associated with a specific KPI identifier.
 */
export function getAnomaliesByKPI(
  anomalies: readonly Anomaly[] | Anomaly[],
  kpiId: string
): Anomaly[] {
  if (!Array.isArray(anomalies)) return [];
  return anomalies.filter((a) => a.kpiId === kpiId);
}

/**
 * Retrieves only critical severity anomalies (excluding high/medium/low).
 */
export function getCriticalAnomalies(
  anomalies: readonly Anomaly[] | Anomaly[]
): Anomaly[] {
  return getAnomaliesBySeverity(anomalies, 'critical');
}
