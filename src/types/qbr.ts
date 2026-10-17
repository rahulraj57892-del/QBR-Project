/**
 * @file src/types/qbr.ts
 * @description Core TypeScript definitions and domain models for QBR Intelligence Studio.
 *
 * Data conventions:
 * 1. Dates: Formatted as ISO 8601 strings (e.g., "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss.sssZ").
 * 2. Missing vs. Zero: Legitimate 0 values are represented as `0`. Missing or non-applicable values are `null` (never undefined or coerced to 0).
 * 3. Percentages: Stored as decimals from -1.0 to 1.0 (or >1.0 / <-1.0 for >100% variance) where 0.05 represents +5.0%, unless the unit itself is 'percent', in which case absolute value may be 0-100.
 * 4. IDs: Unique identifier strings (UUID v4 or nanoid).
 */

// ============================================================================
// Primitive & Utility Types
// ============================================================================

/** ISO 8601 string representation of date or datetime */
export type ISODateString = string;

/** Standard calendar quarter literal */
export type QuarterPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4';

/** Status of a quarter's data intake and review lifecycle */
export type QuarterStatus = 'draft' | 'processing' | 'completed' | 'failed';

/** Direction of KPI metric optimization */
export type KPIDirection = 'higher_is_better' | 'lower_is_better';

/** Standard KPI functional categories */
export type KPICategory =
  | 'sla_compliance'
  | 'incident_management'
  | 'system_availability'
  | 'operational_efficiency'
  | 'financial_cost'
  | 'customer_satisfaction'
  | 'security_governance'
  | 'infrastructure_capacity'
  | 'custom';

/** KPI Unit of measure */
export type KPIUnit =
  | 'percentage'
  | 'milliseconds'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'count'
  | 'currency_usd'
  | 'currency_eur'
  | 'currency_gbp'
  | 'ratio'
  | 'score_out_of_5'
  | 'score_out_of_10'
  | 'nps'
  | 'custom';

/** Evaluated performance status against target and baseline */
export type KPIPerformanceStatus =
  | 'exceeded'
  | 'met'
  | 'underperforming'
  | 'critical'
  | 'unrated';

/** Directional trend quarter-on-quarter */
export type TrendDirection =
  | 'improving'
  | 'degrading'
  | 'neutral'
  | 'inconclusive';

/** Why a QoQ comparison might not be mathematically computable */
export type ComparisonUnavailableReason =
  | 'no_previous_data'
  | 'previous_value_zero'
  | 'different_units'
  | 'baseline_quarter';

/** Uploaded document processing status */
export type FileProcessingStatus =
  | 'pending'
  | 'validating'
  | 'parsed'
  | 'failed'
  | 'archived';

/** Uploaded file MIME/extension classification */
export type SupportedFileType = 'xlsx' | 'xls' | 'csv';

/** Anomaly classification types */
export type AnomalyType =
  | 'sudden_spike'
  | 'sudden_drop'
  | 'repeated_breach'
  | 'target_divergence'
  | 'stale_variance'
  | 'outlier';

/** Anomaly or risk severity level */
export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';

/** AI Insight thematic categories */
export type InsightCategory =
  | 'operational_risk'
  | 'cost_optimization'
  | 'service_quality'
  | 'strategic_growth'
  | 'governance'
  | 'sla_achievement';

/** Confidence grade of AI generated insights or recommendations */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** QBR Report publishing/generation lifecycle status */
export type ReportStatus = 'draft' | 'generating' | 'finalized' | 'archived';

// ============================================================================
// Core Domain Models
// ============================================================================

/**
 * 1. Customer
 * Represents a client account receiving Quarterly Business Reviews.
 */
export interface Customer {
  id: string;
  name: string;
  industry: string;
  accountManager: string;
  serviceDeliveryManager: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * 2. ReportingQuarter
 * Represents a specific 3-month reporting cycle for a given customer.
 */
export interface ReportingQuarter {
  id: string;
  customerId: string;
  year: number;
  quarter: QuarterPeriod;
  startDate: ISODateString;
  endDate: ISODateString;
  status: QuarterStatus;
}

/**
 * 3. KPI
 * Individual metric record tracked for a customer within a quarter.
 *
 * Data conventions:
 * - `value`: actual recorded value for this quarter.
 * - `target`: agreed threshold/benchmark. `null` if no formal SLA or target exists.
 * - `previousQuarterValue`: raw benchmark from prior quarter. `null` if new KPI or first quarter.
 * - `sourceFileId`: source file origin id, or `null` if manually entered.
 */
export interface KPI {
  id: string;
  customerId: string;
  quarterId: string;
  name: string;
  category: KPICategory;
  description: string;
  unit: KPIUnit;
  value: number;
  target: number | null;
  previousQuarterValue: number | null;
  direction: KPIDirection;
  sourceFileId: string | null;
}

/**
 * Comparison availability status and details for QoQ analytics.
 */
export interface QoQComparison {
  isAvailable: boolean;
  unavailableReason: ComparisonUnavailableReason | null;
  /**
   * Decimal percentage variance e.g. 0.125 for +12.5%.
   * Null when isAvailable is false (e.g. division by zero or missing previous value).
   */
  percentageChange: number | null;
  /**
   * Absolute mathematical difference: (currentValue - previousValue).
   * Null when previousValue is null.
   */
  absoluteChange: number | null;
}

/**
 * 4. KPIAnalysis
 * Quarter-on-quarter and target compliance analysis for a specific KPI.
 */
export interface KPIAnalysis {
  kpiId: string;
  currentValue: number;
  previousValue: number | null;
  /**
   * Absolute change (currentValue - previousValue). Null if previousValue was null.
   */
  absoluteChange: number | null;
  /**
   * Percentage change expressed as a decimal ratio (e.g., 0.15 = +15%, -0.05 = -5%).
   * Null if comparison is unavailable (e.g., previousValue was null or zero).
   */
  percentageChange: number | null;
  comparisonMetadata: QoQComparison;
  target: number | null;
  targetMet: boolean | null; // null if target is not specified
  performanceStatus: KPIPerformanceStatus;
  trendDirection: TrendDirection;
  analysisNotes: string;
}

/**
 * File validation error detail.
 */
export interface FileValidationError {
  row?: number;
  column?: string;
  field?: string;
  message: string;
  code: string;
}

/**
 * 5. UploadedFile
 * Represents an uploaded Excel or CSV data spreadsheet.
 */
export interface UploadedFile {
  id: string;
  customerId: string;
  quarterId: string;
  fileName: string;
  fileType: SupportedFileType;
  fileSize: number; // in bytes
  uploadedAt: ISODateString;
  processingStatus: FileProcessingStatus;
  validationErrors: FileValidationError[];
}

/**
 * 6. Anomaly
 * Automated performance anomaly or threshold breach detected in KPI trends.
 */
export interface Anomaly {
  id: string;
  kpiId: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  detectedAt: ISODateString;
  recommendedAction: string;
}

/**
 * Actionable recommendation item attached to an AI insight.
 */
export interface ActionableRecommendation {
  id: string;
  title: string;
  action: string;
  owner?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffort?: 'low' | 'medium' | 'high';
}

/**
 * 7. AIInsight
 * AI-synthesized contextual finding derived from KPI analyses and anomalies.
 */
export interface AIInsight {
  id: string;
  customerId: string;
  quarterId: string;
  category: InsightCategory;
  title: string;
  summary: string;
  businessImpact: string;
  recommendation: string;
  confidenceLevel: ConfidenceLevel;
}

/**
 * 8. QBRReport
 * Consolidated presentation-ready executive report for a client review.
 */
export interface QBRReport {
  id: string;
  customerId: string;
  quarterId: string;
  title: string;
  executiveSummary: string;
  kpiAnalyses: KPIAnalysis[];
  anomalies: Anomaly[];
  insights: AIInsight[];
  recommendations: ActionableRecommendation[];
  generatedAt: ISODateString;
  status: ReportStatus;
}

/**
 * 9. DashboardSummary
 * High-level aggregated scorecard and executive metrics for a quarter.
 */
export interface DashboardSummary {
  totalKPIs: number;
  targetsMet: number;
  targetsMissed: number;
  improvingKPIs: number;
  decliningKPIs: number;
  criticalAnomalies: number;
  /**
   * Normalized overall performance score from 0.0 to 100.0, or null if uncalculated.
   */
  overallPerformanceScore: number | null;
}
