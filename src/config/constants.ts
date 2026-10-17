/**
 * @file src/config/constants.ts
 * @description Centralized, strongly typed configuration constants for QBR Intelligence Studio.
 *
 * Integrates with and references domain types defined in `src/types/qbr.ts`.
 * All constants are pure configurations without runtime side-effects or external dependencies.
 */

import type {
  QuarterPeriod,
  KPIDirection,
  AnomalySeverity,
  KPICategory,
} from '../types/qbr';

// ============================================================================
// 1. Application Metadata Configuration
// ============================================================================

export const APP_CONFIG = {
  applicationName: 'QBR Intelligence Studio',
  shortName: 'QBR Studio',
  version: '0.1.0',
  description: 'AI-powered Quarterly Business Review intelligence platform',
  defaultLocale: 'en-IN',
  defaultCurrency: 'INR',
  defaultTimezone: 'Asia/Kolkata',
  supportedFileExtensions: ['.xlsx', '.xls', '.csv'] as const,
  maxUploadSizeMB: 20,
} as const;

export type AppConfig = typeof APP_CONFIG;

// ============================================================================
// 2. KPI Categories Configuration
// ============================================================================

export interface KPICategoryDefinition {
  id: string;
  label: string;
  description: string;
  /**
   * Corresponding core domain KPICategory from `src/types/qbr.ts`.
   * Maps granular ITIL/ITSM operational areas to standard QBR classification groups.
   */
  domainGroup: KPICategory;
}

export const KPI_CATEGORIES: readonly KPICategoryDefinition[] = [
  {
    id: 'service_availability',
    label: 'Service Availability',
    description: 'System uptime, service availability percentages, and core infrastructure readiness.',
    domainGroup: 'system_availability',
  },
  {
    id: 'sla_compliance',
    label: 'SLA Compliance',
    description: 'Contractual service level agreement adherence, target thresholds, and breach tracking.',
    domainGroup: 'sla_compliance',
  },
  {
    id: 'incident_management',
    label: 'Incident Management',
    description: 'Mean time to resolve (MTTR), mean time to detect (MTTD), and ticket resolution rates.',
    domainGroup: 'incident_management',
  },
  {
    id: 'major_incident_management',
    label: 'Major Incident Management',
    description: 'P1/P2 critical outages, major incident duration, escalation cadence, and post-mortem SLA.',
    domainGroup: 'incident_management',
  },
  {
    id: 'change_management',
    label: 'Change Management',
    description: 'Change request volume, emergency change frequency, and change success/rollback percentages.',
    domainGroup: 'operational_efficiency',
  },
  {
    id: 'problem_management',
    label: 'Problem Management',
    description: 'Known error database (KEDB) entries, root cause analysis (RCA) turnarounds, and recurring bugs.',
    domainGroup: 'operational_efficiency',
  },
  {
    id: 'service_requests',
    label: 'Service Requests',
    description: 'Standard request fulfillment times, user provisioning delays, and catalog SLA compliance.',
    domainGroup: 'operational_efficiency',
  },
  {
    id: 'monitoring_and_alerting',
    label: 'Monitoring and Alerting',
    description: 'Synthetic monitoring coverage, false-positive alert ratios, and APM health checks.',
    domainGroup: 'infrastructure_capacity',
  },
  {
    id: 'infrastructure_performance',
    label: 'Infrastructure Performance',
    description: 'CPU/Memory/Storage saturation, network latency, database throughput, and cluster capacity.',
    domainGroup: 'infrastructure_capacity',
  },
  {
    id: 'customer_satisfaction',
    label: 'Customer Satisfaction',
    description: 'CSAT ratings, Net Promoter Scores (NPS), and stakeholder survey evaluations.',
    domainGroup: 'customer_satisfaction',
  },
  {
    id: 'operational_efficiency',
    label: 'Operational Efficiency',
    description: 'Automation coverage, first-contact resolution (FCR), and team operational throughput.',
    domainGroup: 'operational_efficiency',
  },
  {
    id: 'financial_performance',
    label: 'Financial Performance',
    description: 'Cloud consumption cost, SLA penalty exposure, license utilization, and budget run rate.',
    domainGroup: 'financial_cost',
  },
  {
    id: 'custom_metrics',
    label: 'Custom Metrics',
    description: 'Client-specific bespoke metrics, hybrid measurements, and project-specific milestones.',
    domainGroup: 'custom',
  },
] as const;

export type KPICategoryId = (typeof KPI_CATEGORIES)[number]['id'];

// ============================================================================
// 3. Reporting Quarters Configuration
// ============================================================================

export interface QuarterDefinition {
  quarter: QuarterPeriod;
  label: string;
  startMonth: string;
  endMonth: string;
  startMonthNumber: number; // 1-based (1 = Jan, 4 = Apr, 7 = Jul, 10 = Oct)
  endMonthNumber: number;   // 1-based (3 = Mar, 6 = Jun, 9 = Sep, 12 = Dec)
}

/**
 * Standard calendar quarter definitions.
 * Follows calendar quarters (Jan-Dec), compatible with `QuarterPeriod` in `ReportingQuarter`.
 */
export const REPORTING_QUARTERS: readonly QuarterDefinition[] = [
  {
    quarter: 'Q1',
    label: 'Q1 — January to March',
    startMonth: 'January',
    endMonth: 'March',
    startMonthNumber: 1,
    endMonthNumber: 3,
  },
  {
    quarter: 'Q2',
    label: 'Q2 — April to June',
    startMonth: 'April',
    endMonth: 'June',
    startMonthNumber: 4,
    endMonthNumber: 6,
  },
  {
    quarter: 'Q3',
    label: 'Q3 — July to September',
    startMonth: 'July',
    endMonth: 'September',
    startMonthNumber: 7,
    endMonthNumber: 9,
  },
  {
    quarter: 'Q4',
    label: 'Q4 — October to December',
    startMonth: 'October',
    endMonth: 'December',
    startMonthNumber: 10,
    endMonthNumber: 12,
  },
] as const;

// ============================================================================
// 4. KPI Direction Configuration
// ============================================================================

export interface KPIDirectionDefinition {
  direction: KPIDirection;
  label: string;
  explanation: string;
  examples: readonly string[];
}

export const KPI_DIRECTIONS: Record<KPIDirection, KPIDirectionDefinition> = {
  higher_is_better: {
    direction: 'higher_is_better',
    label: 'Higher is Better',
    explanation: 'A higher numeric value represents improved performance or superior service delivery.',
    examples: [
      'Availability percentage (e.g., 99.99%)',
      'SLA compliance percentage',
      'Customer satisfaction (CSAT) score',
      'First Contact Resolution rate',
    ],
  },
  lower_is_better: {
    direction: 'lower_is_better',
    label: 'Lower is Better',
    explanation: 'A lower numeric value indicates superior performance, reduced friction, or fewer incidents.',
    examples: [
      'Incident resolution time (MTTR in minutes)',
      'Major incident (P1/P2) count',
      'SLA breach occurrences',
      'Change failure rate percentage',
    ],
  },
} as const;

// ============================================================================
// 5. KPI Performance Thresholds Configuration
// ============================================================================

/**
 * Initial default policy for target compliance checks.
 *
 * Evaluation conventions:
 * - On target: Metric meets or exceeds SLA/target in the favorable direction.
 * - Warning: Metric misses target by <= warningToleranceRatio (5% relative variance).
 * - Critical: Metric misses target by > criticalToleranceRatio (greater than 5% relative variance).
 * - Unknown: Metric lacks a target or benchmark to evaluate compliance.
 *
 * Note: Targets with value 0 must be handled via absolute divergence rules in analytics engines.
 */
export const KPI_PERFORMANCE_THRESHOLDS = {
  warningToleranceRatio: 0.05, // 5% relative variance tolerance
  criticalToleranceRatio: 0.05, // > 5% relative shortfall triggers critical status
  statusDefinitions: {
    on_target: {
      status: 'met',
      label: 'On Target',
      description: 'Performance meets or exceeds the KPI target according to its direction.',
    },
    warning: {
      status: 'underperforming',
      label: 'Warning',
      description: 'Performance misses the target by no more than 5% relative to the target benchmark.',
    },
    critical: {
      status: 'critical',
      label: 'Critical',
      description: 'Performance misses the target by more than 5% relative to the target benchmark.',
    },
    unknown: {
      status: 'unrated',
      label: 'Unknown',
      description: 'Insufficient benchmark information or missing target to determine compliance.',
    },
  },
} as const;

export type KPIPerformanceThresholds = typeof KPI_PERFORMANCE_THRESHOLDS;

// ============================================================================
// 6. Trend and Anomaly Configuration
// ============================================================================

/**
 * Mathematical trajectory of a metric across reporting periods.
 * Note: Mathematical trajectory ('increasing' | 'decreasing') is orthogonal to business sentiment
 * ('improving' | 'degrading'), which depends on KPIDirection.
 */
export const TREND_DIRECTIONS = {
  increasing: {
    id: 'increasing',
    label: 'Increasing',
    description: 'Current quarter value is mathematically higher than the previous quarter value.',
  },
  decreasing: {
    id: 'decreasing',
    label: 'Decreasing',
    description: 'Current quarter value is mathematically lower than the previous quarter value.',
  },
  unchanged: {
    id: 'unchanged',
    label: 'Unchanged',
    description: 'Current quarter value is identical to the previous quarter value.',
  },
  unknown: {
    id: 'unknown',
    label: 'Unknown',
    description: 'Previous quarter value is missing, zero, or baseline comparison is unavailable.',
  },
} as const;

export type TrendDirectionId = keyof typeof TREND_DIRECTIONS;

/**
 * Anomaly severity classifications.
 * Fully compatible with `AnomalySeverity` in `src/types/qbr.ts`.
 */
export const ANOMALY_SEVERITIES: Record<
  AnomalySeverity,
  {
    id: AnomalySeverity;
    label: string;
    description: string;
    priorityOrder: number; // 1 = highest priority
  }
> = {
  critical: {
    id: 'critical',
    label: 'Critical',
    description: 'Severe SLA breach or catastrophic variance requiring immediate executive remediation.',
    priorityOrder: 1,
  },
  high: {
    id: 'high',
    label: 'High',
    description: 'Substantial metric degradation with direct operational impact or SLA risk.',
    priorityOrder: 2,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    description: 'Moderate performance deviation or anomalous pattern warranting monitoring.',
    priorityOrder: 3,
  },
  low: {
    id: 'low',
    label: 'Low',
    description: 'Minor variance within acceptable operational bounds.',
    priorityOrder: 4,
  },
} as const;

/**
 * Anomaly type configurations covering operational detection modes.
 */
export const ANOMALY_TYPES = {
  sudden_increase: {
    id: 'sudden_increase',
    label: 'Sudden Increase',
    description: 'Unusual, rapid upward spike compared to historical quarterly averages.',
    correlatedDomainType: 'sudden_spike' as const,
  },
  sudden_decrease: {
    id: 'sudden_decrease',
    label: 'Sudden Decrease',
    description: 'Unusual, rapid downward drop compared to historical quarterly averages.',
    correlatedDomainType: 'sudden_drop' as const,
  },
  target_breach: {
    id: 'target_breach',
    label: 'Target Breach',
    description: 'Metric violated formal SLA or operational target benchmark.',
    correlatedDomainType: 'target_divergence' as const,
  },
  unusual_variance: {
    id: 'unusual_variance',
    label: 'Unusual Variance',
    description: 'Variance exceeds standard deviation thresholds across historical periods.',
    correlatedDomainType: 'outlier' as const,
  },
  missing_data: {
    id: 'missing_data',
    label: 'Missing Data',
    description: 'Expected metric data points or required quarterly entries were absent.',
    correlatedDomainType: 'outlier' as const,
  },
  data_quality_issue: {
    id: 'data_quality_issue',
    label: 'Data Quality Issue',
    description: 'Format mismatch, corrupt value, negative duration, or impossible percentage detected.',
    correlatedDomainType: 'outlier' as const,
  },
} as const;

export type AnomalyTypeId = keyof typeof ANOMALY_TYPES;

// ============================================================================
// 7. File Upload Configuration
// ============================================================================

export const FILE_UPLOAD_CONFIG = {
  acceptedExtensions: ['.xlsx', '.xls', '.csv'] as const,
  supportedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel',                                         // .xls
    'text/csv',                                                         // .csv
    'application/csv',                                                  // .csv alternative
  ] as const,
  maxFileSizeBytes: 20 * 1024 * 1024, // 20 MB (20,971,520 bytes)
  maxFilesPerBatch: 10,
  maxRowsPerFile: 50000,
  allowMultipleFiles: true,
} as const;

export type FileUploadConfig = typeof FILE_UPLOAD_CONFIG;

// ============================================================================
// 8. Dashboard Configuration
// ============================================================================

export const DASHBOARD_CONFIG = {
  defaultQuarter: 'current' as const,
  defaultComparison: 'previous_quarter' as const,
  defaultChartType: 'line' as const,
  defaultPageSize: 10,
  refreshIntervalSeconds: 300,
  showAnomalies: true,
  showAIInsights: true,
  showTargetStatus: true,
} as const;

export type DashboardConfig = typeof DASHBOARD_CONFIG;

// ============================================================================
// 9. QBR Report Configuration
// ============================================================================

export const QBR_REPORT_CONFIG = {
  defaultTitle: 'Quarterly Business Review',
  defaultLanguage: 'en' as const,
  includeExecutiveSummary: true,
  includeKPIAnalysis: true,
  includeTrendCharts: true,
  includeAnomalies: true,
  includeRecommendations: true,
  includeCustomerQnA: true,
  supportedExportFormats: ['pdf', 'pptx'] as const,
} as const;

export type QBRReportConfig = typeof QBR_REPORT_CONFIG;

// ============================================================================
// 10. AI Insight Configuration
// ============================================================================

export const AI_INSIGHT_CONFIG = {
  maxInsightsPerReport: 15,
  maxRecommendationsPerReport: 10,
  minimumConfidenceForDisplay: 0.6,
  requireEvidence: true,
  allowHumanReview: true,
} as const;

export type AIInsightConfig = typeof AI_INSIGHT_CONFIG;
