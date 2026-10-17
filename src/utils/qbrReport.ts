/**
 * @file src/utils/qbrReport.ts
 * @description Deterministic assembly, validation, and serialization engine for QBR reports.
 *
 * Implements:
 * - Complete QBRReport assembly conforming strictly to `src/types/qbr.ts`.
 * - Defensive validation of input data (customer isolation, quarter matching, KPI uniqueness).
 * - Deterministic, collision-resistant report ID and title generation.
 * - Integration of KPI analysis, anomaly detection, executive narrative, and actionable recommendations.
 * - Safe error-boundary generation wrapper (`tryGenerateQBRReport`).
 * - High-level executive scorecard summary (`getQBRReportSummary`).
 * - Deterministic JSON serialization ensuring numeric validity without data leakage.
 */

import type {
  Customer,
  ReportingQuarter,
  KPI,
  KPIAnalysis,
  Anomaly,
  AIInsight,
  ActionableRecommendation,
  QBRReport,
  ReportStatus,
  ISODateString,
} from '../types/qbr';
import { QBR_REPORT_CONFIG, AI_INSIGHT_CONFIG } from '../config/constants';
import { analyzeKPIs } from './kpiAnalytics';
import {
  detectAnomalies,
  sortAnomaliesBySeverity,
  getDeterministicTimestamp,
} from './anomalyDetection';
import {
  generateQBRInsights,
  generateExecutiveSummary,
  generateRecommendations,
} from './qbrInsights';

// ============================================================================
// 1. Report Input Types & Configuration
// ============================================================================

export interface ReportOptions {
  includeExecutiveSummary?: boolean;
  includeKPIAnalysis?: boolean;
  includeAnomalies?: boolean;
  includeInsights?: boolean;
  includeRecommendations?: boolean;
  maximumInsights?: number;
  maximumRecommendations?: number;
  reportTitle?: string;
  status?: ReportStatus;
}

export interface ReportGenerationInput {
  customer: Customer;
  quarter: ReportingQuarter;
  kpis: readonly KPI[] | KPI[];
  kpiAnalyses?: readonly KPIAnalysis[] | KPIAnalysis[];
  anomalies?: readonly Anomaly[] | Anomaly[];
  insights?: readonly AIInsight[] | AIInsight[];
  reportTitle?: string;
  reportingTimestamp?: ISODateString;
  options?: ReportOptions;
}

export interface ReportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface QBRReportSummary {
  reportId: string;
  customerId: string;
  quarterId: string;
  title: string;
  generatedAt: ISODateString;
  totalKPIs: number;
  totalAnomalies: number;
  totalInsights: number;
  totalRecommendations: number;
  reportStatus: ReportStatus;
}

export type SafeReportResult =
  | { success: true; report: QBRReport; warnings: string[] }
  | { success: false; errors: string[]; warnings: string[] };

/**
 * Standard default options derived from application configuration.
 */
export const DEFAULT_QBR_REPORT_OPTIONS: Required<ReportOptions> = {
  includeExecutiveSummary: QBR_REPORT_CONFIG.includeExecutiveSummary,
  includeKPIAnalysis: QBR_REPORT_CONFIG.includeKPIAnalysis,
  includeAnomalies: QBR_REPORT_CONFIG.includeAnomalies,
  includeInsights: true,
  includeRecommendations: QBR_REPORT_CONFIG.includeRecommendations,
  maximumInsights: AI_INSIGHT_CONFIG.maxInsightsPerReport,
  maximumRecommendations: AI_INSIGHT_CONFIG.maxRecommendationsPerReport,
  reportTitle: '',
  status: 'finalized',
};

// ============================================================================
// 2. Custom Error Class
// ============================================================================

export class ReportGenerationError extends Error {
  public readonly errors: string[];

  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = 'ReportGenerationError';
    this.errors = errors.length > 0 ? errors : [message];
  }
}

// ============================================================================
// 3. Report Input Validation
// ============================================================================

/**
 * Defensively validates input parameters prior to report compilation.
 *
 * Checks:
 * - Presence and structural validity of Customer and ReportingQuarter.
 * - Quarter customer association (quarter.customerId === customer.id).
 * - Non-empty KPI dataset (empty produces fatal error to prevent misleading empty reports).
 * - Customer and quarter alignment on every KPI.
 * - Uniqueness of KPI IDs.
 * - Finiteness of all numerical values and targets.
 * - Supported KPI optimization directions.
 * - Precomputed arrays referential integrity.
 *
 * @param input - The report generation parameters
 * @returns Strongly typed ReportValidationResult
 */
export function validateReportInput(input: ReportGenerationInput): ReportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Customer validation
  if (!input.customer || typeof input.customer !== 'object') {
    errors.push('Customer profile object is required.');
  } else {
    if (!input.customer.id || input.customer.id.trim() === '') {
      errors.push('Customer ID must be a non-empty string.');
    }
    if (!input.customer.name || input.customer.name.trim() === '') {
      errors.push('Customer name must be a non-empty string.');
    }
  }

  // 2. Reporting quarter validation
  if (!input.quarter || typeof input.quarter !== 'object') {
    errors.push('Reporting quarter object is required.');
  } else {
    if (!input.quarter.id || input.quarter.id.trim() === '') {
      errors.push('Reporting quarter ID must be a non-empty string.');
    }
    if (!input.quarter.year || typeof input.quarter.year !== 'number') {
      errors.push('Reporting quarter year must be a valid number.');
    }
    if (!input.quarter.quarter || !['Q1', 'Q2', 'Q3', 'Q4'].includes(input.quarter.quarter)) {
      errors.push('Reporting quarter must be one of Q1, Q2, Q3, or Q4.');
    }
  }

  // 3. Customer-Quarter link
  if (input.customer?.id && input.quarter?.customerId) {
    if (input.quarter.customerId !== input.customer.id) {
      errors.push(
        `Quarter customer mismatch: Quarter ${input.quarter.id} is assigned to customer "${input.quarter.customerId}", but customer "${input.customer.id}" was supplied.`
      );
    }
  }

  // 4. KPI Dataset validation
  if (!Array.isArray(input.kpis) || input.kpis.length === 0) {
    errors.push('KPI dataset is empty. A valid QBR report requires at least one evaluable KPI.');
    return { isValid: false, errors, warnings };
  }

  const seenKpiIds = new Set<string>();
  const customerId = input.customer?.id;
  const quarterId = input.quarter?.id;

  for (let i = 0; i < input.kpis.length; i++) {
    const kpi = input.kpis[i];
    const prefix = `KPI[${i}] ("${kpi.name || kpi.id || 'unknown'}")`;

    // ID uniqueness
    if (!kpi.id || kpi.id.trim() === '') {
      errors.push(`${prefix}: Missing KPI identifier.`);
    } else {
      if (seenKpiIds.has(kpi.id)) {
        errors.push(`${prefix}: Duplicate KPI identifier "${kpi.id}" detected.`);
      }
      seenKpiIds.add(kpi.id);
    }

    // Customer association
    if (customerId && kpi.customerId !== customerId) {
      errors.push(
        `${prefix}: Customer ID mismatch. Expected "${customerId}", found "${kpi.customerId}".`
      );
    }

    // Quarter association
    if (quarterId && kpi.quarterId !== quarterId) {
      errors.push(
        `${prefix}: Quarter ID mismatch. Expected "${quarterId}", found "${kpi.quarterId}".`
      );
    }

    // Value finiteness
    if (typeof kpi.value !== 'number' || !Number.isFinite(kpi.value)) {
      errors.push(`${prefix}: Contains non-finite value (${String(kpi.value)}).`);
    }

    // Target finiteness
    if (kpi.target !== null && (typeof kpi.target !== 'number' || !Number.isFinite(kpi.target))) {
      errors.push(`${prefix}: Target is non-null but not a finite number (${String(kpi.target)}).`);
    }

    // Direction check
    if (kpi.direction !== 'higher_is_better' && kpi.direction !== 'lower_is_better') {
      errors.push(`${prefix}: Direction must be "higher_is_better" or "lower_is_better".`);
    }
  }

  // 5. Precomputed Analyses check (if provided)
  if (input.kpiAnalyses !== undefined) {
    if (!Array.isArray(input.kpiAnalyses)) {
      errors.push('Precomputed kpiAnalyses must be an array.');
    } else {
      for (const analysis of input.kpiAnalyses) {
        if (!seenKpiIds.has(analysis.kpiId)) {
          errors.push(
            `Precomputed analysis references unknown KPI ID "${analysis.kpiId}".`
          );
        }
      }
    }
  }

  // 6. Precomputed Anomalies check (if provided)
  if (input.anomalies !== undefined) {
    if (!Array.isArray(input.anomalies)) {
      errors.push('Precomputed anomalies must be an array.');
    } else {
      for (const anomaly of input.anomalies) {
        if (!seenKpiIds.has(anomaly.kpiId)) {
          errors.push(
            `Precomputed anomaly references unknown KPI ID "${anomaly.kpiId}".`
          );
        }
      }
    }
  }

  // 7. Precomputed Insights check (if provided)
  if (input.insights !== undefined) {
    if (!Array.isArray(input.insights)) {
      errors.push('Precomputed insights must be an array.');
    } else {
      for (const insight of input.insights) {
        if (customerId && insight.customerId !== customerId) {
          errors.push(
            `Precomputed insight "${insight.id}" has customerId "${insight.customerId}", expected "${customerId}".`
          );
        }
        if (quarterId && insight.quarterId !== quarterId) {
          errors.push(
            `Precomputed insight "${insight.id}" has quarterId "${insight.quarterId}", expected "${quarterId}".`
          );
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// 4. Report ID & Title Generators
// ============================================================================

/**
 * Generates an unambiguous, deterministic report identifier.
 * Uses length-prefixed compound formatting to prevent collisions.
 *
 * @param customerId - Customer identifier string
 * @param quarterId - Quarter identifier string
 * @returns Deterministic report ID
 */
export function generateReportId(customerId: string, quarterId: string): string {
  const cleanCustomer = customerId.trim();
  const cleanQuarter = quarterId.trim();
  return `qbr-${cleanCustomer}--${cleanQuarter}`;
}

/**
 * Generates an executive-friendly title for the Quarterly Business Review.
 *
 * Format:
 * "${Customer Name} — ${Quarter} ${Year} Quarterly Business Review"
 *
 * @param customer - Customer profile
 * @param quarter - Reporting quarter metadata
 * @param customTitle - Optional user-defined title override
 * @returns Final report title string
 */
export function generateReportTitle(
  customer: Customer,
  quarter: ReportingQuarter,
  customTitle?: string
): string {
  if (customTitle && customTitle.trim() !== '') {
    return customTitle.trim();
  }
  return `${customer.name} — ${quarter.quarter} ${quarter.year} Quarterly Business Review`;
}

// ============================================================================
// 5. Assembly Utilities
// ============================================================================

/**
 * Compiles KPI analyses for all supplied KPI records.
 * Reuses `analyzeKPIs` from `kpiAnalytics.ts`.
 */
export function buildReportKPIAnalysis(kpis: readonly KPI[] | KPI[]): KPIAnalysis[] {
  if (!Array.isArray(kpis) || kpis.length === 0) {
    return [];
  }
  return analyzeKPIs(kpis);
}

/**
 * Scans KPI records and produces sorted, deduplicated anomalies.
 * Reuses `detectAnomalies` and `sortAnomaliesBySeverity` from `anomalyDetection.ts`.
 */
export function buildReportAnomalies(kpis: readonly KPI[] | KPI[]): Anomaly[] {
  if (!Array.isArray(kpis) || kpis.length === 0) {
    return [];
  }
  const anomalies = detectAnomalies(kpis);
  return sortAnomaliesBySeverity(anomalies);
}

/**
 * Generates prioritized QBR executive insights.
 * Reuses `generateQBRInsights` from `qbrInsights.ts`.
 */
export function buildReportInsights(
  input: ReportGenerationInput,
  analyses?: readonly KPIAnalysis[] | KPIAnalysis[],
  anomalies?: readonly Anomaly[] | Anomaly[]
): AIInsight[] {
  if (input.insights !== undefined) {
    return [...input.insights];
  }

  return generateQBRInsights({
    customerId: input.customer.id,
    quarterId: input.quarter.id,
    kpis: input.kpis,
    kpiAnalyses: analyses,
    anomalies,
    reportingQuarter: input.quarter,
    customerName: input.customer.name,
  });
}

/**
 * Assembles the executive summary narrative.
 * Reuses `generateExecutiveSummary` from `qbrInsights.ts`.
 */
export function buildReportExecutiveSummary(
  input: ReportGenerationInput,
  analyses?: readonly KPIAnalysis[] | KPIAnalysis[],
  anomalies?: readonly Anomaly[] | Anomaly[]
): string {
  if (input.options?.includeExecutiveSummary === false) {
    return '';
  }

  return generateExecutiveSummary({
    customerId: input.customer.id,
    quarterId: input.quarter.id,
    kpis: input.kpis,
    kpiAnalyses: analyses,
    anomalies,
    reportingQuarter: input.quarter,
    customerName: input.customer.name,
  });
}

/**
 * Generates an array of operational recommendation strings.
 * Reuses `generateRecommendations` from `qbrInsights.ts`.
 */
export function buildReportRecommendations(
  input: ReportGenerationInput,
  analyses?: readonly KPIAnalysis[] | KPIAnalysis[],
  anomalies?: readonly Anomaly[] | Anomaly[]
): string[] {
  if (input.options?.includeRecommendations === false) {
    return [];
  }

  const recs = generateRecommendations({
    customerId: input.customer.id,
    quarterId: input.quarter.id,
    kpis: input.kpis,
    kpiAnalyses: analyses,
    anomalies,
    reportingQuarter: input.quarter,
    customerName: input.customer.name,
  });

  const maxRecs = input.options?.maximumRecommendations ?? DEFAULT_QBR_REPORT_OPTIONS.maximumRecommendations;
  return recs.slice(0, maxRecs);
}

/**
 * Converts string recommendation items into structured ActionableRecommendation objects
 * conforming to `src/types/qbr.ts`.
 */
function toActionableRecommendations(
  recStrings: string[],
  reportId: string,
  anomalies: readonly Anomaly[] | Anomaly[]
): ActionableRecommendation[] {
  const hasCritical = anomalies.some((a) => a.severity === 'critical');
  const hasHigh = anomalies.some((a) => a.severity === 'high');

  return recStrings.map((recText, idx) => {
    let priority: ActionableRecommendation['priority'] = 'medium';
    if (idx === 0 && hasCritical) priority = 'critical';
    else if (idx < 2 && hasHigh) priority = 'high';

    // Extract first clause as title
    const firstPeriod = recText.indexOf('.');
    const firstComma = recText.indexOf(',');
    const splitIndex = firstPeriod !== -1 ? firstPeriod : firstComma !== -1 ? firstComma : 40;
    const rawTitle = recText.substring(0, splitIndex).trim();
    const title = rawTitle.length > 5 ? rawTitle : `Operational Action ${idx + 1}`;

    return {
      id: `rec-${reportId}-${idx + 1}`,
      title,
      action: recText,
      priority,
      estimatedEffort: 'medium',
    };
  });
}

// ============================================================================
// 6. Main Report Generator
// ============================================================================

/**
 * Generates a complete, validated, presentation-ready QBRReport object.
 *
 * @param input - The validated input parameters
 * @returns Fully populated QBRReport
 * @throws ReportGenerationError if fatal validation errors are present
 */
export function generateQBRReport(input: ReportGenerationInput): QBRReport {
  // 1. Validation
  const validation = validateReportInput(input);
  if (!validation.isValid) {
    throw new ReportGenerationError(
      `QBR Report generation failed with ${validation.errors.length} validation error(s).`,
      validation.errors
    );
  }

  const options: Required<ReportOptions> = {
    ...DEFAULT_QBR_REPORT_OPTIONS,
    ...(input.options || {}),
  };

  // 2. Report Identifiers & Title
  const reportId = generateReportId(input.customer.id, input.quarter.id);
  const title = generateReportTitle(
    input.customer,
    input.quarter,
    options.reportTitle || input.reportTitle
  );

  // 3. Assemble KPI Analyses (use precomputed if explicitly supplied, else compute)
  const kpiAnalyses: KPIAnalysis[] =
    options.includeKPIAnalysis
      ? input.kpiAnalyses !== undefined
        ? [...input.kpiAnalyses]
        : buildReportKPIAnalysis(input.kpis)
      : [];

  // 4. Assemble Anomalies (use precomputed if explicitly supplied, else detect)
  const anomalies: Anomaly[] =
    options.includeAnomalies
      ? input.anomalies !== undefined
        ? [...input.anomalies]
        : buildReportAnomalies(input.kpis)
      : [];

  // 5. Assemble Insights (use precomputed if explicitly supplied, else generate)
  const insights: AIInsight[] =
    options.includeInsights
      ? input.insights !== undefined
        ? [...input.insights]
        : buildReportInsights(input, kpiAnalyses, anomalies)
      : [];

  // 6. Assemble Executive Summary
  const executiveSummary = options.includeExecutiveSummary
    ? buildReportExecutiveSummary(input, kpiAnalyses, anomalies)
    : '';

  // 7. Assemble Recommendations
  const recStrings = options.includeRecommendations
    ? buildReportRecommendations(input, kpiAnalyses, anomalies)
    : [];
  const recommendations = toActionableRecommendations(recStrings, reportId, anomalies);

  // 8. Deterministic Timestamp
  const generatedAt =
    input.reportingTimestamp ||
    input.quarter.endDate ||
    getDeterministicTimestamp(input.quarter.id);

  return {
    id: reportId,
    customerId: input.customer.id,
    quarterId: input.quarter.id,
    title,
    executiveSummary,
    kpiAnalyses,
    anomalies,
    insights,
    recommendations,
    generatedAt,
    status: options.status ?? 'finalized',
  };
}

// ============================================================================
// 7. Safe Report Generation Wrapper
// ============================================================================

/**
 * Safe generation entry point that catches expected errors and returns a discriminated union.
 * Does not expose internal stack traces.
 *
 * @param input - The report generation parameters
 * @returns SafeReportResult ({ success: true, report, warnings } | { success: false, errors, warnings })
 */
export function tryGenerateQBRReport(input: ReportGenerationInput): SafeReportResult {
  try {
    const validation = validateReportInput(input);
    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    const report = generateQBRReport(input);
    return {
      success: true,
      report,
      warnings: validation.warnings,
    };
  } catch (error) {
    if (error instanceof ReportGenerationError) {
      return {
        success: false,
        errors: error.errors,
        warnings: [],
      };
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred during report assembly.';
    return {
      success: false,
      errors: [message],
      warnings: [],
    };
  }
}

// ============================================================================
// 8. Report Summary & Post-Validation
// ============================================================================

/**
 * Extracts a lightweight executive scorecard summary from an assembled QBRReport.
 */
export function getQBRReportSummary(report: QBRReport): QBRReportSummary {
  return {
    reportId: report.id,
    customerId: report.customerId,
    quarterId: report.quarterId,
    title: report.title,
    generatedAt: report.generatedAt,
    totalKPIs: report.kpiAnalyses.length,
    totalAnomalies: report.anomalies.length,
    totalInsights: report.insights.length,
    totalRecommendations: report.recommendations.length,
    reportStatus: report.status,
  };
}

/**
 * Validates the internal consistency and completeness of an assembled QBRReport object.
 */
export function validateGeneratedReport(report: QBRReport): ReportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!report.id || report.id.trim() === '') {
    errors.push('Report missing valid identifier.');
  }
  if (!report.customerId || report.customerId.trim() === '') {
    errors.push('Report missing customer identifier.');
  }
  if (!report.quarterId || report.quarterId.trim() === '') {
    errors.push('Report missing quarter identifier.');
  }
  if (!report.title || report.title.trim() === '') {
    errors.push('Report missing title.');
  }
  if (!Array.isArray(report.kpiAnalyses)) {
    errors.push('Report kpiAnalyses must be an array.');
  }
  if (!Array.isArray(report.anomalies)) {
    errors.push('Report anomalies must be an array.');
  }
  if (!Array.isArray(report.insights)) {
    errors.push('Report insights must be an array.');
  }
  if (!Array.isArray(report.recommendations)) {
    errors.push('Report recommendations must be an array.');
  }
  if (!report.generatedAt || report.generatedAt.trim() === '') {
    errors.push('Report missing generatedAt timestamp.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// 9. Report Data Serialization
// ============================================================================

/**
 * Serializes a QBRReport object to deterministic, standard JSON.
 *
 * Requirements:
 * - Guarantees all numbers are finite.
 * - Does not serialize undefined or circular structures.
 * - Throws a TypeError if invalid non-finite numbers are detected.
 *
 * @param report - Assembled QBRReport object
 * @returns Formatted JSON string
 */
export function serializeQBRReport(report: QBRReport): string {
  // Validate that the report contains no non-finite numbers before serializing
  for (const analysis of report.kpiAnalyses) {
    if (!Number.isFinite(analysis.currentValue)) {
      throw new TypeError(`Serialization error: Non-finite currentValue detected in KPI analysis ${analysis.kpiId}.`);
    }
    if (analysis.previousValue !== null && !Number.isFinite(analysis.previousValue)) {
      throw new TypeError(`Serialization error: Non-finite previousValue detected in KPI analysis ${analysis.kpiId}.`);
    }
  }

  return JSON.stringify(report, null, 2);
}
