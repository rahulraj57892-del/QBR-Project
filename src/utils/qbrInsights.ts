/**
 * @file src/utils/qbrInsights.ts
 * @description Deterministic, evidence-grounded QBR intelligence and insight engine for QBR Intelligence Studio.
 *
 * Implements:
 * - Synthesis of KPI analysis and anomaly findings into structured executive insights (`AIInsight`).
 * - Cross-metric correlation observations without fabricated causal claims.
 * - Concise, professional executive summary generation (100–180 words).
 * - Actionable, deduplicated operational recommendation lists.
 * - Multi-tiered business operational risk classification (low, moderate, high, critical, unknown).
 * - Evidence-completeness confidence scoring heuristic.
 * - Strict customer and reporting period isolation.
 */

import type {
  KPI,
  KPIAnalysis,
  Anomaly,
  ReportingQuarter,
  AIInsight,
  InsightCategory,
  ConfidenceLevel,
} from '../types/qbr';
import { AI_INSIGHT_CONFIG } from '../config/constants';
import {
  analyzeKPIs,
  generateDashboardSummary,
  roundTo,
} from './kpiAnalytics';
import {
  detectAnomalies,
  getRecommendationForKPI,
} from './anomalyDetection';

// ============================================================================
// 1. Insight Engine Configuration
// ============================================================================

export const QBR_INSIGHT_RULES = {
  maximumInsights: AI_INSIGHT_CONFIG.maxInsightsPerReport, // 15
  maximumRecommendations: AI_INSIGHT_CONFIG.maxRecommendationsPerReport, // 10
  minimumConfidence: AI_INSIGHT_CONFIG.minimumConfidenceForDisplay, // 0.6
  prioritizeCriticalFindings: true,
  includePositiveTrends: true,
  includeOperationalRisks: true,
  includeImprovementOpportunities: true,
  includeDataQualityWarnings: true,
} as const;

export type QBRInsightRules = typeof QBR_INSIGHT_RULES;

// ============================================================================
// 2. Input Interface & Validation
// ============================================================================

export interface QBRInsightInput {
  customerId: string;
  quarterId: string;
  kpis: readonly KPI[] | KPI[];
  kpiAnalyses?: readonly KPIAnalysis[] | KPIAnalysis[];
  anomalies?: readonly Anomaly[] | Anomaly[];
  reportingQuarter?: ReportingQuarter;
  customerName?: string;
}

export type BusinessImpactLevel = 'low' | 'moderate' | 'high' | 'critical' | 'unknown';

export interface BusinessImpactAssessment {
  level: BusinessImpactLevel;
  primaryDrivers: string[];
  riskSummary: string;
}

/**
 * Validates that all supplied records belong strictly to the requested customer and quarter.
 * Prevents cross-customer data leakage and cross-period contamination.
 */
function validateInputIsolation(input: QBRInsightInput): { valid: boolean; error?: string } {
  if (!input.customerId || !input.quarterId) {
    return { valid: false, error: 'Both customerId and quarterId are required.' };
  }

  for (const kpi of input.kpis) {
    if (kpi.customerId !== input.customerId || kpi.quarterId !== input.quarterId) {
      return {
        valid: false,
        error: `Customer isolation violation: KPI ${kpi.id} belongs to ${kpi.customerId}/${kpi.quarterId}, expected ${input.customerId}/${input.quarterId}.`,
      };
    }
  }

  if (input.anomalies) {
    const kpiIds = new Set(input.kpis.map((k) => k.id));
    for (const anomaly of input.anomalies) {
      if (!kpiIds.has(anomaly.kpiId)) {
        return {
          valid: false,
          error: `Isolation violation: Anomaly ${anomaly.id} references KPI ${anomaly.kpiId} which is not in the supplied dataset.`,
        };
      }
    }
  }

  return { valid: true };
}

// ============================================================================
// 3. Evidence-Completeness Confidence Scoring
// ============================================================================

/**
 * Calculates evidence completeness confidence for an insight.
 * Heuristic based on data validity, baseline availability, and benchmark presence.
 *
 * Scoring model (0.0 to 1.0):
 * - Base score: 0.50
 * - Has valid target benchmark: +0.25
 * - Has historical quarter baseline: +0.20
 * - Supported by detected anomaly: +0.10
 * - Contains non-finite or out-of-range value: -0.40
 *
 * Strictly clamped between 0.0 and 1.0.
 */
export function calculateInsightConfidence(
  kpi: KPI,
  hasAnomalyEvidence: boolean = false
): number {
  let score = 0.5;

  if (typeof kpi.value !== 'number' || !Number.isFinite(kpi.value)) {
    return 0.1;
  }

  if (kpi.unit === 'percentage' && (kpi.value < 0 || kpi.value > 100)) {
    return 0.2;
  }

  if (kpi.target !== null && Number.isFinite(kpi.target)) {
    score += 0.25;
  }

  if (kpi.previousQuarterValue !== null && Number.isFinite(kpi.previousQuarterValue)) {
    score += 0.2;
  }

  if (hasAnomalyEvidence) {
    score += 0.1;
  }

  return roundTo(Math.max(0.0, Math.min(1.0, score)), 2);
}

/**
 * Maps numerical confidence score to the domain ConfidenceLevel union in `src/types/qbr.ts`.
 */
export function toConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

// ============================================================================
// 4. KPI Performance Insights (Target Breaches & Deteriorations)
// ============================================================================

/**
 * Generates evidence-grounded insights from individual KPI analyses.
 */
export function generateKPIInsights(input: QBRInsightInput): AIInsight[] {
  const isolation = validateInputIsolation(input);
  if (!isolation.valid) {
    return [];
  }

  if (!input.kpis || input.kpis.length === 0) {
    return [];
  }

  const analyses = input.kpiAnalyses ?? analyzeKPIs(input.kpis);
  const analysisMap = new Map(analyses.map((a) => [a.kpiId, a]));
  const insights: AIInsight[] = [];

  for (const kpi of input.kpis) {
    // Skip invalid numerical data
    if (typeof kpi.value !== 'number' || !Number.isFinite(kpi.value)) {
      continue;
    }
    if (kpi.unit === 'percentage' && (kpi.value < 0 || kpi.value > 100)) {
      continue;
    }

    const analysis = analysisMap.get(kpi.id);
    if (!analysis) continue;

    const unitSuffix = kpi.unit === 'percentage' ? '%' : ` ${kpi.unit.replace(/_/g, ' ')}`;

    // A. Target Breach Insight
    if (analysis.targetMet === false && kpi.target !== null) {
      const isHigherBetter = kpi.direction === 'higher_is_better';
      const breachType = isHigherBetter ? 'Fell Short of' : 'Exceeded Maximum';
      const category: InsightCategory =
        kpi.category === 'sla_compliance' ? 'sla_achievement' : 'operational_risk';

      const changeClause =
        kpi.previousQuarterValue !== null && analysis.absoluteChange !== null
          ? ` Previous quarter stood at ${kpi.previousQuarterValue}${unitSuffix} (a quarter-on-quarter movement of ${analysis.absoluteChange > 0 ? '+' : ''}${analysis.absoluteChange}${unitSuffix}).`
          : '';

      const confidence = calculateInsightConfidence(kpi, true);

      insights.push({
        id: `insight-${input.quarterId}-${kpi.id}-target-breach`,
        customerId: input.customerId,
        quarterId: input.quarterId,
        category,
        title: `${kpi.name} ${breachType} Target`,
        summary: `Recorded ${kpi.value}${unitSuffix} against the agreed target threshold of ${kpi.target}${unitSuffix}.${changeClause}`,
        businessImpact:
          isHigherBetter
            ? `Underperformance in ${kpi.name.toLowerCase()} may adversely impact contractual SLA compliance and customer satisfaction.`
            : `Elevated ${kpi.name.toLowerCase()} introduces operational friction and strains service delivery capacity.`,
        recommendation: getRecommendationForKPI(kpi.name, 'target_divergence'),
        confidenceLevel: toConfidenceLevel(confidence),
      });
    }

    // B. Significant QoQ Deterioration without target breach (e.g., target still met but sharply slipping)
    if (
      analysis.targetMet === true &&
      analysis.trendDirection === 'degrading' &&
      kpi.previousQuarterValue !== null &&
      analysis.absoluteChange !== null
    ) {
      const isMeaningfulDrop =
        kpi.unit === 'percentage'
          ? Math.abs(analysis.absoluteChange) >= 1.0
          : Math.abs(analysis.absoluteChange) >= 10;

      if (isMeaningfulDrop) {
        const confidence = calculateInsightConfidence(kpi, false);
        insights.push({
          id: `insight-${input.quarterId}-${kpi.id}-degrading-trend`,
          customerId: input.customerId,
          quarterId: input.quarterId,
          category: 'operational_risk',
          title: `${kpi.name} Performance Slipped Quarter-on-Quarter`,
          summary: `${kpi.name} met its target of ${kpi.target}${unitSuffix} with ${kpi.value}${unitSuffix}, but degraded from ${kpi.previousQuarterValue}${unitSuffix} in the prior quarter.`,
          businessImpact: `While compliant for the current quarter, the downward trend presents forward-looking operational risk if left unaddressed.`,
          recommendation: getRecommendationForKPI(kpi.name, 'sudden_drop'),
          confidenceLevel: toConfidenceLevel(confidence),
        });
      }
    }
  }

  return insights;
}

// ============================================================================
// 5. Positive Performance Insights
// ============================================================================

/**
 * Identifies confirmed operational achievements and improvements.
 */
export function generatePositiveInsights(input: QBRInsightInput): AIInsight[] {
  const isolation = validateInputIsolation(input);
  if (!isolation.valid || !input.kpis || input.kpis.length === 0) {
    return [];
  }

  const analyses = input.kpiAnalyses ?? analyzeKPIs(input.kpis);
  const analysisMap = new Map(analyses.map((a) => [a.kpiId, a]));
  const insights: AIInsight[] = [];

  for (const kpi of input.kpis) {
    // Validate value bounds
    if (typeof kpi.value !== 'number' || !Number.isFinite(kpi.value)) continue;
    if (kpi.unit === 'percentage' && (kpi.value < 0 || kpi.value > 100)) continue;

    const analysis = analysisMap.get(kpi.id);
    if (!analysis) continue;

    const unitSuffix = kpi.unit === 'percentage' ? '%' : ` ${kpi.unit.replace(/_/g, ' ')}`;

    // Achievement 1: Met target and improved compared to previous quarter
    if (
      analysis.targetMet === true &&
      analysis.trendDirection === 'improving' &&
      kpi.previousQuarterValue !== null &&
      analysis.absoluteChange !== null
    ) {
      const confidence = calculateInsightConfidence(kpi, false);
      const category: InsightCategory =
        kpi.category === 'sla_compliance'
          ? 'sla_achievement'
          : kpi.category === 'system_availability'
          ? 'service_quality'
          : 'strategic_growth';

      const changeAbs = Math.abs(analysis.absoluteChange);
      const changeText =
        kpi.unit === 'percentage'
          ? `improved by ${changeAbs.toFixed(2)} percentage points`
          : `improved by ${changeAbs}${unitSuffix}`;

      insights.push({
        id: `insight-${input.quarterId}-${kpi.id}-positive-recovery`,
        customerId: input.customerId,
        quarterId: input.quarterId,
        category,
        title: `${kpi.name} Performance Improved and Met Target`,
        summary: `${kpi.name} ${changeText} from ${kpi.previousQuarterValue}${unitSuffix} to ${kpi.value}${unitSuffix}, satisfying the agreed target of ${kpi.target}${unitSuffix}.`,
        businessImpact: `Consistent operational adherence reinforces client trust, stabilizes service continuity, and minimizes outage risks.`,
        recommendation: `Maintain existing preventative controls, monitor capacity thresholds, and document process improvements as team best practices.`,
        confidenceLevel: toConfidenceLevel(confidence),
      });
    }

    // Achievement 2: Flawless milestone (e.g., 0 P1 incidents)
    if (
      kpi.name.toLowerCase().includes('p1') &&
      kpi.value === 0 &&
      kpi.direction === 'lower_is_better'
    ) {
      const confidence = calculateInsightConfidence(kpi, false);
      insights.push({
        id: `insight-${input.quarterId}-${kpi.id}-zero-p1`,
        customerId: input.customerId,
        quarterId: input.quarterId,
        category: 'service_quality',
        title: `Zero Critical Outages Achieved`,
        summary: `Zero P1 major incidents were logged during the quarter, satisfying the zero-outage stability objective.`,
        businessImpact: `Zero severe outages ensured continuous business workflow and protected core customer operations.`,
        recommendation: `Continue disciplined change review procedures and automated resilience health checks.`,
        confidenceLevel: toConfidenceLevel(confidence),
      });
    }
  }

  return insights;
}

// ============================================================================
// 6. Anomaly-Based Insights
// ============================================================================

/**
 * Converts detected anomalies into executive insights, consolidating multi-anomaly findings on the same KPI.
 */
export function generateAnomalyInsights(input: QBRInsightInput): AIInsight[] {
  const isolation = validateInputIsolation(input);
  if (!isolation.valid || !input.kpis || input.kpis.length === 0) {
    return [];
  }

  const anomalies = input.anomalies ?? detectAnomalies(input.kpis);
  if (anomalies.length === 0) {
    return [];
  }

  const kpiMap = new Map(input.kpis.map((k) => [k.id, k]));
  const insights: AIInsight[] = [];

  // Group anomalies by KPI ID
  const grouped = new Map<string, Anomaly[]>();
  for (const anomaly of anomalies) {
    const list = grouped.get(anomaly.kpiId) || [];
    list.push(anomaly);
    grouped.set(anomaly.kpiId, list);
  }

  for (const [kpiId, kpiAnomalies] of grouped.entries()) {
    const kpi = kpiMap.get(kpiId);
    if (!kpi) continue;

    // Check if any anomaly is a data quality issue
    const qualityAnomaly = kpiAnomalies.find((a) => a.anomalyType === 'outlier');
    if (qualityAnomaly) {
      insights.push({
        id: `insight-${input.quarterId}-${kpi.id}-data-quality`,
        customerId: input.customerId,
        quarterId: input.quarterId,
        category: 'governance',
        title: `Data Quality Alert for ${kpi.name}`,
        summary: qualityAnomaly.description,
        businessImpact: `Unvalidated metric entries compromise reporting accuracy and impair data-driven executive decision-making.`,
        recommendation: qualityAnomaly.recommendedAction,
        confidenceLevel: 'high',
      });
      continue;
    }

    const hasBreach = kpiAnomalies.some((a) => a.anomalyType === 'target_divergence');
    const suddenChange = kpiAnomalies.find(
      (a) => a.anomalyType === 'sudden_spike' || a.anomalyType === 'sudden_drop'
    );

    // If both breach and sudden change occurred on same KPI, consolidate into one insight
    if (hasBreach && suddenChange) {
      const confidence = calculateInsightConfidence(kpi, true);
      const isHigherBetter = kpi.direction === 'higher_is_better';
      const unitSuffix = kpi.unit === 'percentage' ? '%' : ` ${kpi.unit.replace(/_/g, ' ')}`;

      insights.push({
        id: `insight-${input.quarterId}-${kpi.id}-consolidated-anomaly`,
        customerId: input.customerId,
        quarterId: input.quarterId,
        category: kpi.category === 'sla_compliance' ? 'sla_achievement' : 'operational_risk',
        title: `${kpi.name} Breached Target Following Sharp Deterioration`,
        summary: `Performance dropped from ${kpi.previousQuarterValue}${unitSuffix} to ${kpi.value}${unitSuffix}, violating the agreed quarterly target of ${kpi.target}${unitSuffix}.`,
        businessImpact:
          isHigherBetter
            ? `Rapid decline below contractual standards directly threatens service level guarantees and operational continuity.`
            : `Sharp increase above agreed limits signals mounting operational pressure and capacity constraints.`,
        recommendation: suddenChange.recommendedAction,
        confidenceLevel: toConfidenceLevel(confidence),
      });
      continue;
    }

    // Single sudden change without breach (e.g., target still met or unconfigured)
    if (suddenChange && !hasBreach) {
      const confidence = calculateInsightConfidence(kpi, true);
      insights.push({
        id: `insight-${input.quarterId}-${kpi.id}-sudden-change`,
        customerId: input.customerId,
        quarterId: input.quarterId,
        category: 'operational_risk',
        title: `Sudden Variance Detected in ${kpi.name}`,
        summary: suddenChange.description,
        businessImpact: `Unusual quarterly volatility may indicate operational instability or external dependency shifts.`,
        recommendation: suddenChange.recommendedAction,
        confidenceLevel: toConfidenceLevel(confidence),
      });
    }
  }

  return insights;
}

// ============================================================================
// 7. Cross-KPI Observations
// ============================================================================

/**
 * Detects multi-metric operational correlations without claiming unverified causal links.
 */
function generateCrossKPIObservations(
  input: QBRInsightInput,
  analyses: readonly KPIAnalysis[] | KPIAnalysis[]
): AIInsight[] {
  const analysisMap = new Map(analyses.map((a) => [a.kpiId, a]));
  const kpiByName = new Map(input.kpis.map((k) => [k.name.trim().toLowerCase(), k]));

  const slaKPI = kpiByName.get('sla compliance');
  const incidentsKPI = kpiByName.get('total incidents');
  const mttrKPI = kpiByName.get('mean time to resolve');

  if (!slaKPI || !incidentsKPI || !mttrKPI) {
    return [];
  }

  const slaAnalysis = analysisMap.get(slaKPI.id);
  const incAnalysis = analysisMap.get(incidentsKPI.id);
  const mttrAnalysis = analysisMap.get(mttrKPI.id);

  if (!slaAnalysis || !incAnalysis || !mttrAnalysis) {
    return [];
  }

  // Check correlation: Incidents up, MTTR up, SLA down
  const incidentsWorse = incAnalysis.trendDirection === 'degrading';
  const mttrWorse = mttrAnalysis.trendDirection === 'degrading';
  const slaWorse = slaAnalysis.trendDirection === 'degrading';

  if (incidentsWorse && mttrWorse && slaWorse) {
    return [
      {
        id: `insight-${input.quarterId}-cross-kpi-operational-strain`,
        customerId: input.customerId,
        quarterId: input.quarterId,
        category: 'operational_risk',
        title: 'Multi-Metric Operational Strain Observed',
        summary: `Incident volume increased (from ${incidentsKPI.previousQuarterValue} to ${incidentsKPI.value}) and mean resolution time lengthened (from ${mttrKPI.previousQuarterValue}h to ${mttrKPI.value}h), while SLA compliance declined (from ${slaKPI.previousQuarterValue}% to ${slaKPI.value}%).`,
        businessImpact: `Concurrently rising ticket volume and elongated resolution cycles correlate with SLA degradation, compounding delivery team overhead.`,
        recommendation: `Conduct a joint review between Incident Management and Service Delivery to address resolution bottlenecks and peak-volume triage.`,
        confidenceLevel: 'high',
      },
    ];
  }

  return [];
}

// ============================================================================
// 8. Business Impact Classification
// ============================================================================

/**
 * Classifies operational business impact into low, moderate, high, critical, or unknown.
 */
export function classifyBusinessImpact(input: QBRInsightInput): BusinessImpactAssessment {
  const isolation = validateInputIsolation(input);
  if (!isolation.valid || !input.kpis || input.kpis.length === 0) {
    return {
      level: 'unknown',
      primaryDrivers: [],
      riskSummary: 'Insufficient metric data to assess business impact.',
    };
  }

  const anomalies = input.anomalies ?? detectAnomalies(input.kpis);
  const summary = generateDashboardSummary(input.kpis, anomalies.filter((a) => a.severity === 'critical').length);

  const drivers: string[] = [];
  const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical');
  const highAnomalies = anomalies.filter((a) => a.severity === 'high');

  if (criticalAnomalies.length > 0) {
    for (const ca of criticalAnomalies) {
      drivers.push(ca.description);
    }
    return {
      level: 'critical',
      primaryDrivers: drivers.slice(0, 3),
      riskSummary: `Critical operational risk detected with ${criticalAnomalies.length} severe incident or target violation(s).`,
    };
  }

  if (highAnomalies.length > 0 || (summary.targetsMissed >= 3 && summary.overallPerformanceScore !== null && summary.overallPerformanceScore < 75)) {
    for (const ha of highAnomalies) {
      drivers.push(ha.description);
    }
    return {
      level: 'high',
      primaryDrivers: drivers.slice(0, 3),
      riskSummary: `Substantial operational strain characterized by multiple high-severity metric shortfalls.`,
    };
  }

  if (summary.targetsMissed > 0 || summary.decliningKPIs > summary.improvingKPIs) {
    return {
      level: 'moderate',
      primaryDrivers: [`${summary.targetsMissed} target benchmark(s) missed`],
      riskSummary: `Moderate operational risk requiring targeted performance monitoring.`,
    };
  }

  if (summary.targetsMet > 0) {
    return {
      level: 'low',
      primaryDrivers: ['All evaluable performance targets satisfied'],
      riskSummary: `Stable service delivery performance with all evaluated targets maintained.`,
    };
  }

  return {
    level: 'unknown',
    primaryDrivers: [],
    riskSummary: 'No evaluable targets available to determine operational impact.',
  };
}

// ============================================================================
// 9. Recommendations Generator
// ============================================================================

/**
 * Generates an actionable, deduplicated list of operational recommendations.
 */
export function generateRecommendations(input: QBRInsightInput): string[] {
  const isolation = validateInputIsolation(input);
  if (!isolation.valid || !input.kpis || input.kpis.length === 0) {
    return [];
  }

  const recommendations = new Set<string>();
  const anomalies = input.anomalies ?? detectAnomalies(input.kpis);

  // 1. High and Critical Anomalies first
  for (const anomaly of anomalies) {
    if (anomaly.severity === 'critical' || anomaly.severity === 'high') {
      recommendations.add(anomaly.recommendedAction);
    }
  }

  // 2. Target Breaches
  const analyses = input.kpiAnalyses ?? analyzeKPIs(input.kpis);
  for (const analysis of analyses) {
    if (analysis.targetMet === false) {
      const kpi = input.kpis.find((k) => k.id === analysis.kpiId);
      if (kpi) {
        recommendations.add(getRecommendationForKPI(kpi.name, 'target_divergence'));
      }
    }
  }

  // 3. Medium severity anomalies
  for (const anomaly of anomalies) {
    if (anomaly.severity === 'medium') {
      recommendations.add(anomaly.recommendedAction);
    }
  }

  // 4. Positive maintenance recommendation if empty
  if (recommendations.size === 0) {
    recommendations.add(
      'Maintain regular automated system health checks, monitor infrastructure thresholds, and sustain current operational disciplines.'
    );
  }

  return Array.from(recommendations).slice(0, QBR_INSIGHT_RULES.maximumRecommendations);
}

// ============================================================================
// 10. Executive Summary Generation
// ============================================================================

/**
 * Generates a concise, deterministic executive summary (100–180 words when data permits).
 */
export function generateExecutiveSummary(input: QBRInsightInput): string {
  const isolation = validateInputIsolation(input);
  if (!isolation.valid || !input.kpis || input.kpis.length === 0) {
    return 'Executive Summary: Insufficient quarterly KPI and operational data is available to generate a performance review for this reporting period.';
  }

  const clientName = input.customerName || (input.customerId ? `Customer ${input.customerId}` : 'Client Organization');
  const quarterLabel = input.reportingQuarter
    ? `${input.reportingQuarter.quarter} ${input.reportingQuarter.year}`
    : input.quarterId.toUpperCase().replace('QUARTER-', '').replace(/-/g, ' ');

  const analyses = input.kpiAnalyses ?? analyzeKPIs(input.kpis);
  const anomalies = input.anomalies ?? detectAnomalies(input.kpis);
  const summary = generateDashboardSummary(input.kpis, anomalies.filter((a) => a.severity === 'critical').length);
  const impact = classifyBusinessImpact(input);

  const targetsMet = summary.targetsMet;
  const targetsMissed = summary.targetsMissed;
  const totalEvaluable = targetsMet + targetsMissed;

  // Key highlights
  const improvingCount = summary.improvingKPIs;
  const decliningCount = summary.decliningKPIs;

  let performanceSentence: string;
  if (totalEvaluable > 0) {
    const complianceRate = roundTo((targetsMet / totalEvaluable) * 100, 1);
    performanceSentence = `During this period, ${clientName} attained a ${complianceRate}% compliance rate, successfully meeting ${targetsMet} of ${totalEvaluable} evaluable contractual targets.`;
  } else {
    performanceSentence = `During this period, ${summary.totalKPIs} operational metrics were monitored across infrastructure, service delivery, and incident management domains.`;
  }

  let trendClause: string;
  if (improvingCount > decliningCount && targetsMissed === 0) {
    trendClause = `Operational trends reflect strong performance stability, with ${improvingCount} metrics demonstrating positive quarter-on-quarter momentum across core platform operations.`;
  } else if (targetsMissed > 0 || decliningCount > improvingCount) {
    trendClause = `The review identified ${targetsMissed} missed target(s) and ${decliningCount} declining performance indicator(s), presenting operational risks that warrant targeted remediation.`;
  } else {
    trendClause = `Quarterly metrics remained predominantly stable with balanced performance across operational domains.`;
  }

  let riskActionSentence: string;
  if (impact.level === 'critical' || impact.level === 'high') {
    riskActionSentence = `Given the ${impact.level} operational risk profile, priority actions must focus on investigating incident volume drivers, resolving MTTR bottlenecks, and reinforcing SLA adherence.`;
  } else {
    riskActionSentence = `Key focus areas include sustaining preventive maintenance cadences, tracking capacity headroom, and institutionalizing operational best practices.`;
  }

  return `Executive Summary for ${clientName} (${quarterLabel}): ${performanceSentence} ${trendClause} ${riskActionSentence}`;
}

// ============================================================================
// 11. Main QBR Insight Generator
// ============================================================================

/**
 * Primary entry point for generating deterministic, evidence-grounded QBR insights.
 */
export function generateQBRInsights(input: QBRInsightInput): AIInsight[] {
  const isolation = validateInputIsolation(input);
  if (!isolation.valid || !input.kpis || input.kpis.length === 0) {
    return [];
  }

  const analyses = input.kpiAnalyses ?? analyzeKPIs(input.kpis);
  const anomalies = input.anomalies ?? detectAnomalies(input.kpis);

  const combinedInput: QBRInsightInput = {
    ...input,
    kpiAnalyses: analyses,
    anomalies,
  };

  const candidates: AIInsight[] = [];

  // 1. Cross-KPI correlation findings
  candidates.push(...generateCrossKPIObservations(combinedInput, analyses));

  // 2. Anomaly-based insights (consolidated by KPI)
  if (QBR_INSIGHT_RULES.includeOperationalRisks) {
    candidates.push(...generateAnomalyInsights(combinedInput));
  }

  // 3. Performance analysis insights (target breaches and slips)
  candidates.push(...generateKPIInsights(combinedInput));

  // 4. Positive achievements
  if (QBR_INSIGHT_RULES.includePositiveTrends) {
    candidates.push(...generatePositiveInsights(combinedInput));
  }

  // 5. Deduplication
  const uniqueInsights: AIInsight[] = [];
  const seenKeys = new Set<string>();

  for (const candidate of candidates) {
    // Generate normalized duplicate detection key based on category, title, and summary essence
    const normalizedKey = `${candidate.category}:${candidate.title.toLowerCase().trim()}`;
    if (!seenKeys.has(normalizedKey)) {
      seenKeys.add(normalizedKey);
      uniqueInsights.push(candidate);
    }
  }

  // 6. Filter by minimum confidence threshold
  const confidenceScore = (level: ConfidenceLevel): number => {
    switch (level) {
      case 'high':
        return 0.85;
      case 'medium':
        return 0.65;
      case 'low':
        return 0.45;
    }
  };

  const qualifiedInsights = uniqueInsights.filter(
    (item) => confidenceScore(item.confidenceLevel) >= QBR_INSIGHT_RULES.minimumConfidence
  );

  // 7. Sort by priority
  const prioritized = sortInsightsByPriority(qualifiedInsights);

  // 8. Limit to maximum insights
  return prioritized.slice(0, QBR_INSIGHT_RULES.maximumInsights);
}

// ============================================================================
// 12. Sorting and Filtering Utilities
// ============================================================================

const CATEGORY_PRIORITY_WEIGHT: Record<InsightCategory, number> = {
  operational_risk: 1,
  sla_achievement: 2,
  service_quality: 3,
  governance: 4,
  cost_optimization: 5,
  strategic_growth: 6,
};

const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = {
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Sorts insights deterministically: operational risks first, then SLA achievements,
 * broken down by confidence level and title alphabetization.
 */
export function sortInsightsByPriority(insights: readonly AIInsight[] | AIInsight[]): AIInsight[] {
  if (!Array.isArray(insights) || insights.length === 0) {
    return [];
  }

  return [...insights].sort((a, b) => {
    const catA = CATEGORY_PRIORITY_WEIGHT[a.category] ?? 99;
    const catB = CATEGORY_PRIORITY_WEIGHT[b.category] ?? 99;
    if (catA !== catB) {
      return catA - catB;
    }

    const confA = CONFIDENCE_WEIGHT[a.confidenceLevel] ?? 99;
    const confB = CONFIDENCE_WEIGHT[b.confidenceLevel] ?? 99;
    if (confA !== confB) {
      return confA - confB;
    }

    return a.title.localeCompare(b.title);
  });
}

/**
 * Filters insights matching a specific functional domain category.
 */
export function getInsightsByCategory(
  insights: readonly AIInsight[] | AIInsight[],
  category: InsightCategory
): AIInsight[] {
  if (!Array.isArray(insights)) return [];
  return insights.filter((i) => i.category === category);
}

/**
 * Returns top operational risk or SLA achievement insights.
 */
export function getHighPriorityInsights(
  insights: readonly AIInsight[] | AIInsight[]
): AIInsight[] {
  if (!Array.isArray(insights)) return [];
  return insights.filter(
    (i) =>
      (i.category === 'operational_risk' || i.category === 'sla_achievement') &&
      (i.confidenceLevel === 'high' || i.confidenceLevel === 'medium')
  );
}
