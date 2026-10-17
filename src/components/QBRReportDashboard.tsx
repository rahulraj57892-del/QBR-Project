/**
 * @file src/components/QBRReportDashboard.tsx
 * @description Enterprise QBR Report Generation and Preview Dashboard for QBR Intelligence Studio.
 *
 * Implements:
 * - Scoped customer and quarter context selection with controlled/uncontrolled state.
 * - Comprehensive pre-generation Report Readiness panel with validation checks.
 * - Explicit user-triggered report generation using `tryGenerateQBRReport` from `qbrReport.ts`.
 * - Full post-assembly report validation using `validateGeneratedReport`.
 * - Tabbed report preview with responsive section navigation (Summary, KPIs, Anomalies, Insights, Recommendations, Complete Document).
 * - KPI Analysis breakdown with targets, absolute/percentage movements, and status badges.
 * - Operational anomaly ledger with severity tags and recommended remediations.
 * - Executive narrative and actionable operational recommendations ledger.
 * - Native browser JSON export using `serializeQBRReport` with security checks and validation gates.
 * - Dynamic report freshness detector alerting users if selections change post-generation.
 * - Comprehensive empty, loading, error, and baseline quarter states.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Building2,
  Calendar,
  Sparkles,
  ShieldAlert,
  BarChart3,
  Layers,
  Activity,
  Check,
  Copy,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  HelpCircle,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  ListOrdered,
  XCircle,
} from 'lucide-react';
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
  AnomalySeverity,
  ConfidenceLevel,
  InsightCategory,
} from '../types/qbr';
import {
  MOCK_CUSTOMERS,
  MOCK_REPORTING_QUARTERS,
  MOCK_KPIS,
} from '../data/mockData';
import {
  tryGenerateQBRReport,
  validateReportInput,
  validateGeneratedReport,
  serializeQBRReport,
  getQBRReportSummary,
  type ReportGenerationInput,
  type ReportValidationResult,
  type QBRReportSummary,
} from '../utils/qbrReport';
import { roundTo } from '../utils/kpiAnalytics';

// ============================================================================
// Props & Contract Interface
// ============================================================================

export interface QBRReportDashboardProps {
  /** Optional customer list; defaults to mock dataset if omitted */
  customers?: readonly Customer[] | Customer[];
  /** Optional reporting quarters; defaults to mock dataset if omitted */
  reportingQuarters?: readonly ReportingQuarter[] | ReportingQuarter[];
  /** Optional KPI records; defaults to mock dataset if omitted */
  kpis?: readonly KPI[] | KPI[];
  /** Controlled selected customer identifier */
  selectedCustomerId?: string;
  /** Controlled selected quarter identifier */
  selectedQuarterId?: string;
  /** Callback fired when customer selection changes */
  onCustomerChange?: (customerId: string) => void;
  /** Callback fired when quarter selection changes */
  onQuarterChange?: (quarterId: string) => void;
  /** Indicates whether data or report operations are loading */
  isLoading?: boolean;
  /** Error message string to render in an alert banner */
  error?: string | null;
}

// ============================================================================
// UI Configurations & Label Lookups
// ============================================================================

type ReportSectionTab = 'summary' | 'kpis' | 'anomalies' | 'insights' | 'recommendations' | 'all';

interface TabConfig {
  id: ReportSectionTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const REPORT_TABS: readonly TabConfig[] = [
  { id: 'summary', label: 'Executive Summary', icon: FileText },
  { id: 'kpis', label: 'KPI Performance', icon: BarChart3 },
  { id: 'anomalies', label: 'Operational Anomalies', icon: ShieldAlert },
  { id: 'insights', label: 'Executive Insights', icon: Sparkles },
  { id: 'recommendations', label: 'Recommendations', icon: ListOrdered },
  { id: 'all', label: 'Complete Document', icon: Layers },
];

const SEVERITY_CONFIG: Record<
  AnomalySeverity,
  { label: string; bg: string; text: string; border: string }
> = {
  critical: {
    label: 'Critical',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  high: {
    label: 'High',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  low: {
    label: 'Low',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
};

const CONFIDENCE_CONFIG: Record<
  ConfidenceLevel,
  { label: string; bg: string; text: string; border: string }
> = {
  high: {
    label: 'High Confidence',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  medium: {
    label: 'Medium Confidence',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  low: {
    label: 'Low Confidence',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
  },
};

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  operational_risk: 'Operational Risk',
  sla_achievement: 'SLA Adherence',
  service_quality: 'Service Quality',
  cost_optimization: 'Resource Efficiency',
  strategic_growth: 'Strategic Alignment',
  governance: 'Governance & Compliance',
};

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatNumericValue(val: number | null | undefined, unit: string = ''): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return '—';
  }
  const cleanVal = roundTo(val, 2);
  if (unit === '%') {
    return `${cleanVal}%`;
  }
  if (unit === 'ms') {
    return `${cleanVal.toLocaleString()} ms`;
  }
  if (unit === 's') {
    return `${cleanVal.toLocaleString()} s`;
  }
  if (unit) {
    return `${cleanVal.toLocaleString()} ${unit}`;
  }
  return cleanVal.toLocaleString();
}

function formatChangeRatio(ratio: number | null, unit: string = ''): string {
  if (ratio === null || !Number.isFinite(ratio)) {
    return 'N/A';
  }
  const pct = roundTo(ratio * 100, 1);
  const sign = pct > 0 ? '+' : '';
  if (unit === '%') {
    // For percentages, indicate that it is a relative percentage change
    return `${sign}${pct}%`;
  }
  return `${sign}${pct}%`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function QBRReportDashboard({
  customers: propCustomers,
  reportingQuarters: propReportingQuarters,
  kpis: propKpis,
  selectedCustomerId: controlledCustomerId,
  selectedQuarterId: controlledQuarterId,
  onCustomerChange,
  onQuarterChange,
  isLoading = false,
  error = null,
}: QBRReportDashboardProps): React.ReactElement {
  // --------------------------------------------------------------------------
  // 1. Data Normalization with Strict Fallback Semantics
  // --------------------------------------------------------------------------
  const allCustomers = useMemo(() => {
    if (propCustomers !== undefined) return propCustomers;
    return MOCK_CUSTOMERS;
  }, [propCustomers]);

  const allQuarters = useMemo(() => {
    if (propReportingQuarters !== undefined) return propReportingQuarters;
    return MOCK_REPORTING_QUARTERS;
  }, [propReportingQuarters]);

  const allKpis = useMemo(() => {
    if (propKpis !== undefined) return propKpis;
    return MOCK_KPIS;
  }, [propKpis]);

  // --------------------------------------------------------------------------
  // 2. Selection State Management (Controlled / Uncontrolled)
  // --------------------------------------------------------------------------
  const [internalCustomerId, setInternalCustomerId] = useState<string>(
    () => allCustomers[0]?.id || ''
  );
  const [internalQuarterId, setInternalQuarterId] = useState<string>('');

  const effectiveCustomerId =
    controlledCustomerId !== undefined ? controlledCustomerId : internalCustomerId;

  const selectedCustomer = useMemo(
    () => allCustomers.find((c) => c.id === effectiveCustomerId) || null,
    [allCustomers, effectiveCustomerId]
  );

  // Chronologically sorted quarters for the active customer
  const customerQuarters = useMemo(() => {
    if (!effectiveCustomerId) return [];
    return allQuarters
      .filter((q) => q.customerId === effectiveCustomerId)
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.quarter.localeCompare(b.quarter);
      });
  }, [allQuarters, effectiveCustomerId]);

  const effectiveQuarterId = useMemo(() => {
    if (controlledQuarterId !== undefined) {
      return controlledQuarterId;
    }
    if (internalQuarterId && customerQuarters.some((q) => q.id === internalQuarterId)) {
      return internalQuarterId;
    }
    // Default to the latest quarter for this customer
    return customerQuarters[customerQuarters.length - 1]?.id || '';
  }, [controlledQuarterId, internalQuarterId, customerQuarters]);

  const selectedQuarter = useMemo(
    () => customerQuarters.find((q) => q.id === effectiveQuarterId) || null,
    [customerQuarters, effectiveQuarterId]
  );

  const isQuarterValid = useMemo(() => {
    if (!effectiveQuarterId || !effectiveCustomerId) return false;
    return customerQuarters.some((q) => q.id === effectiveQuarterId);
  }, [customerQuarters, effectiveQuarterId, effectiveCustomerId]);

  // Historical quarter preceding the selected quarter
  const previousQuarter = useMemo(() => {
    if (!selectedQuarter) return null;
    const currentIdx = customerQuarters.findIndex((q) => q.id === selectedQuarter.id);
    if (currentIdx > 0) {
      return customerQuarters[currentIdx - 1];
    }
    return null;
  }, [customerQuarters, selectedQuarter]);

  // Customer change handler
  const handleCustomerSelect = useCallback(
    (newCustId: string) => {
      const targetCustomer = allCustomers.find((c) => c.id === newCustId);
      if (!targetCustomer) return;

      const targetQuarters = allQuarters
        .filter((q) => q.customerId === newCustId)
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.quarter.localeCompare(b.quarter);
        });

      let targetQuarterId = '';
      if (effectiveQuarterId && targetQuarters.some((q) => q.id === effectiveQuarterId)) {
        targetQuarterId = effectiveQuarterId;
      } else if (targetQuarters.length > 0) {
        targetQuarterId = targetQuarters[targetQuarters.length - 1].id;
      }

      if (controlledCustomerId === undefined) {
        setInternalCustomerId(newCustId);
        setInternalQuarterId(targetQuarterId);
      }
      onCustomerChange?.(newCustId);
      if (targetQuarterId && targetQuarterId !== effectiveQuarterId) {
        onQuarterChange?.(targetQuarterId);
      }
    },
    [allCustomers, allQuarters, controlledCustomerId, effectiveQuarterId, onCustomerChange, onQuarterChange]
  );

  // Quarter change handler
  const handleQuarterSelect = useCallback(
    (newQuarterId: string) => {
      if (!customerQuarters.some((q) => q.id === newQuarterId)) return;
      if (controlledQuarterId === undefined) {
        setInternalQuarterId(newQuarterId);
      }
      onQuarterChange?.(newQuarterId);
    },
    [customerQuarters, controlledQuarterId, onQuarterChange]
  );

  // --------------------------------------------------------------------------
  // 3. Current Quarter Telemetry & Data Readiness
  // --------------------------------------------------------------------------
  const currentQuarterKPIs = useMemo(() => {
    if (!isQuarterValid || !effectiveCustomerId || !effectiveQuarterId) {
      return [];
    }
    return allKpis.filter(
      (k) => k.customerId === effectiveCustomerId && k.quarterId === effectiveQuarterId
    );
  }, [allKpis, effectiveCustomerId, effectiveQuarterId, isQuarterValid]);

  // Quick dictionary for KPI metadata lookups in report analyses
  const kpiLookup = useMemo(() => {
    const map = new Map<string, KPI>();
    for (const kpi of currentQuarterKPIs) {
      map.set(kpi.id, kpi);
    }
    return map;
  }, [currentQuarterKPIs]);

  // Readiness validation input
  const readinessCheck = useMemo((): ReportValidationResult => {
    if (!selectedCustomer || !selectedQuarter) {
      return {
        isValid: false,
        errors: ['Customer and reporting quarter must be selected.'],
        warnings: [],
      };
    }
    const input: ReportGenerationInput = {
      customer: selectedCustomer,
      quarter: selectedQuarter,
      kpis: currentQuarterKPIs,
    };
    return validateReportInput(input);
  }, [selectedCustomer, selectedQuarter, currentQuarterKPIs]);

  // Readiness warnings & statistics
  const readinessStats = useMemo(() => {
    const totalKPIs = currentQuarterKPIs.length;
    const kpisWithTarget = currentQuarterKPIs.filter((k) => k.target !== null).length;
    const missingTargets = totalKPIs - kpisWithTarget;
    const isBaseline = previousQuarter === null;
    return {
      totalKPIs,
      kpisWithTarget,
      missingTargets,
      isBaseline,
    };
  }, [currentQuarterKPIs, previousQuarter]);

  // --------------------------------------------------------------------------
  // 4. Report Generation & Post-Validation State
  // --------------------------------------------------------------------------
  const [generatedReport, setGeneratedReport] = useState<QBRReport | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [reportValidation, setReportValidation] = useState<ReportValidationResult | null>(null);
  const [activeReportTab, setActiveReportTab] = useState<ReportSectionTab>('summary');
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);
  const [copiedJsonToast, setCopiedJsonToast] = useState<boolean>(false);

  // Check report freshness relative to current selections
  const isReportFresh = useMemo(() => {
    if (!generatedReport) return false;
    return (
      generatedReport.customerId === effectiveCustomerId &&
      generatedReport.quarterId === effectiveQuarterId
    );
  }, [generatedReport, effectiveCustomerId, effectiveQuarterId]);

  // Previous report's customer and quarter metadata for stale notice
  const staleReportMetadata = useMemo(() => {
    if (!generatedReport || isReportFresh) return null;
    const oldCustomer = allCustomers.find((c) => c.id === generatedReport.customerId);
    const oldQuarter = allQuarters.find((q) => q.id === generatedReport.quarterId);
    return {
      customerName: oldCustomer?.name || generatedReport.customerId,
      quarterTitle: oldQuarter ? `${oldQuarter.quarter} ${oldQuarter.year}` : generatedReport.quarterId,
    };
  }, [generatedReport, isReportFresh, allCustomers, allQuarters]);

  // --------------------------------------------------------------------------
  // 5. Explicit Report Generation Action
  // --------------------------------------------------------------------------
  const handleGenerateReport = useCallback(() => {
    if (!selectedCustomer || !selectedQuarter) {
      setGenerationError('Please select both a valid customer and a reporting quarter.');
      return;
    }

    if (currentQuarterKPIs.length === 0) {
      setGenerationError(
        `Cannot compile QBR report: No KPI telemetry records found for ${selectedCustomer.name} in ${selectedQuarter.quarter} ${selectedQuarter.year}.`
      );
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const input: ReportGenerationInput = {
        customer: selectedCustomer,
        quarter: selectedQuarter,
        kpis: currentQuarterKPIs,
      };

      const result = tryGenerateQBRReport(input);

      if (result.success) {
        setGeneratedReport(result.report);
        setGenerationWarnings(result.warnings);

        // Validate the compiled report
        const postValidation = validateGeneratedReport(result.report);
        setReportValidation(postValidation);
        setActiveReportTab('summary');
      } else {
        setGenerationError(
          result.errors.length > 0
            ? result.errors.join('; ')
            : 'Report compilation encountered unexpected validation issues.'
        );
        setGenerationWarnings(result.warnings || []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Report generation encountered an unhandled error.';
      setGenerationError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedCustomer, selectedQuarter, currentQuarterKPIs]);

  // Clear stale report handler
  const handleClearStaleReport = useCallback(() => {
    setGeneratedReport(null);
    setReportValidation(null);
    setGenerationWarnings([]);
    setGenerationError(null);
  }, []);

  // --------------------------------------------------------------------------
  // 6. JSON Export Implementation
  // --------------------------------------------------------------------------
  const handleDownloadJSON = useCallback(() => {
    if (!generatedReport) return;
    if (reportValidation && !reportValidation.isValid) {
      setGenerationError('Cannot download JSON: Report validation contains blocking errors.');
      return;
    }

    try {
      const jsonString = serializeQBRReport(generatedReport);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Safe clean filename
      const cleanCustomer = generatedReport.customerId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanQuarter = generatedReport.quarterId.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `qbr-report-${cleanCustomer}--${cleanQuarter}.json`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadSuccessToast(`Exported ${link.download} successfully`);
      setTimeout(() => setDownloadSuccessToast(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Serialization failed.';
      setGenerationError(`Failed to serialize report to JSON: ${msg}`);
    }
  }, [generatedReport, reportValidation]);

  // Copy JSON to clipboard
  const handleCopyJSON = useCallback(() => {
    if (!generatedReport) return;
    try {
      const jsonString = serializeQBRReport(generatedReport);
      navigator.clipboard.writeText(jsonString).then(() => {
        setCopiedJsonToast(true);
        setTimeout(() => setCopiedJsonToast(false), 3000);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not copy.';
      setGenerationError(`Failed to copy report JSON: ${msg}`);
    }
  }, [generatedReport]);

  // Report Summary metadata if report is available
  const reportSummary: QBRReportSummary | null = useMemo(() => {
    if (!generatedReport) return null;
    return getQBRReportSummary(generatedReport);
  }, [generatedReport]);

  // --------------------------------------------------------------------------
  // 7. Loading & Global Error Banners
  // --------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-6">
        <header className="border-b border-slate-200 pb-5">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">QBR Report Generation</h2>
          <p className="text-sm text-slate-500 mt-1">Loading customer records and report engine parameters...</p>
        </header>
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-700">Loading telemetry data and report models...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <header className="border-b border-slate-200 pb-5">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">QBR Report Generation</h2>
          <p className="text-sm text-slate-500 mt-1">Review operational performance and export executive reviews.</p>
        </header>
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Data Access Error</h4>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // 8. Main Render
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-8 pb-16">
      {/* Page Header */}
      <header className="border-b border-slate-200 pb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            <FileText className="w-3.5 h-3.5" />
            <span>Executive Review Compiler</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            QBR Report Generation & Preview
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Deterministic report assembly combining evaluated KPIs, operational anomalies, evidence-backed insights, and executive recommendations.
          </p>
        </div>

        {/* Global Active Context Pill */}
        {selectedCustomer && selectedQuarter && (
          <div className="flex items-center space-x-3 bg-white border border-slate-200 shadow-2xs rounded-xl px-4 py-2 text-xs text-slate-600 self-start md:self-auto">
            <div className="flex items-center space-x-1.5 font-medium text-slate-900">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>{selectedCustomer.name}</span>
            </div>
            <span className="text-slate-300">•</span>
            <div className="flex items-center space-x-1.5 font-medium text-blue-700">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>
                {selectedQuarter.quarter} {selectedQuarter.year}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Toast Notifications */}
      {downloadSuccessToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{downloadSuccessToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setDownloadSuccessToast(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {copiedJsonToast && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs font-medium flex items-center space-x-2">
          <Check className="w-4 h-4 text-blue-600" />
          <span>Report JSON copied to clipboard.</span>
        </div>
      )}

      {/* Generation Failure Banner */}
      {generationError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold">Report Generation Issue</h4>
            <p className="text-xs mt-1 leading-relaxed">{generationError}</p>
          </div>
          <button
            type="button"
            onClick={() => setGenerationError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 9. Context Selector & Generation Control Panel */}
      {/* ===================================================================== */}
      <section
        aria-labelledby="controls-heading"
        className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs"
      >
        <h3 id="controls-heading" className="sr-only">
          Customer, Quarter, and Generation Controls
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
          {/* Step 1: Customer Selector */}
          <div className="md:col-span-4 space-y-1.5">
            <label
              htmlFor="qbr-customer-select"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              1. Customer Organization
            </label>
            <div className="relative">
              <select
                id="qbr-customer-select"
                value={effectiveCustomerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              >
                {allCustomers.length === 0 ? (
                  <option value="">No customers available</option>
                ) : (
                  allCustomers.map((cust) => (
                    <option key={cust.id} value={cust.id}>
                      {cust.name} ({cust.industry})
                    </option>
                  ))
                )}
              </select>
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Step 2: Quarter Selector */}
          <div className="md:col-span-4 space-y-1.5">
            <label
              htmlFor="qbr-quarter-select"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              2. Reporting Quarter
            </label>
            <div className="relative">
              <select
                id="qbr-quarter-select"
                value={effectiveQuarterId}
                onChange={(e) => handleQuarterSelect(e.target.value)}
                disabled={customerQuarters.length === 0}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-50 disabled:bg-slate-100 transition-all"
              >
                {customerQuarters.length === 0 ? (
                  <option value="">No quarters available</option>
                ) : (
                  customerQuarters.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quarter} {q.year} — ({formatDate(q.startDate)} to {formatDate(q.endDate)})
                    </option>
                  ))
                )}
              </select>
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Step 4: Primary Action Button */}
          <div className="md:col-span-4 flex items-center space-x-3">
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={isGenerating || !readinessCheck.isValid || currentQuarterKPIs.length === 0}
              className="w-full inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium text-sm rounded-lg shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Compiling Report...</span>
                </>
              ) : generatedReport && isReportFresh ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Regenerate QBR Report</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate QBR Report</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* Step 3: Report Readiness Ledger */}
        {/* =================================================================== */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-slate-600">
              <span className="font-semibold text-slate-900 flex items-center space-x-1">
                <span>3. Data Readiness:</span>
              </span>

              {/* Status Badge */}
              {readinessCheck.isValid && currentQuarterKPIs.length > 0 ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Ready to Generate ({readinessStats.totalKPIs} KPIs evaluated)
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-rose-50 text-rose-700 border border-rose-200">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Generation Blocked (Insufficient Data)
                </span>
              )}

              {/* Historical baseline indicator */}
              {readinessStats.isBaseline ? (
                <span className="inline-flex items-center text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  <Info className="w-3 h-3 mr-1 text-slate-400" />
                  Baseline Period (QoQ comparisons omitted)
                </span>
              ) : (
                <span className="inline-flex items-center text-emerald-700 bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-100">
                  <TrendingUp className="w-3 h-3 mr-1 text-emerald-600" />
                  Baseline: {previousQuarter?.quarter} {previousQuarter?.year}
                </span>
              )}

              {/* Targets coverage */}
              {readinessStats.missingTargets > 0 ? (
                <span className="inline-flex items-center text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {readinessStats.missingTargets} KPI(s) missing targets
                </span>
              ) : (
                <span className="inline-flex items-center text-slate-500">
                  100% Target Adherence Tracked
                </span>
              )}
            </div>

            {/* Quick Context helper */}
            <div className="text-slate-400 text-right">
              Deterministic QBR engine (v1.0)
            </div>
          </div>

          {/* Validation Warnings (Non-blocking) */}
          {readinessCheck.warnings.length > 0 && (
            <div className="mt-3 p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
              <span className="font-semibold">Pre-Generation Data Warnings:</span>
              <ul className="list-disc pl-4 space-y-0.5">
                {readinessCheck.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation Errors (Blocking) */}
          {readinessCheck.errors.length > 0 && (
            <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
              <span className="font-semibold">Blocking Errors:</span>
              <ul className="list-disc pl-4 space-y-0.5">
                {readinessCheck.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 10. Stale Report Notice (Section 16: Report Freshness) */}
      {/* ===================================================================== */}
      {generatedReport && !isReportFresh && staleReportMetadata && (
        <section
          aria-label="Stale Report Warning"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900"
        >
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold">Report Selection Mismatch</h4>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                The report previewed below was previously compiled for{' '}
                <strong>{staleReportMetadata.customerName}</strong> ({staleReportMetadata.quarterTitle}).
                Your current active selection is{' '}
                <strong>{selectedCustomer?.name}</strong> ({selectedQuarter?.quarter} {selectedQuarter?.year}).
                Click <strong>"Generate QBR Report"</strong> to compile fresh analytics for the current selection.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handleGenerateReport}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              Compile for {selectedQuarter?.quarter}
            </button>
            <button
              type="button"
              onClick={handleClearStaleReport}
              className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 11. Empty State: No Report Generated Yet */}
      {/* ===================================================================== */}
      {!generatedReport ? (
        <section
          aria-label="Report Generation Prompt"
          className="bg-white rounded-xl border border-slate-200 p-8 md:p-12 text-center max-w-2xl mx-auto my-6 shadow-xs"
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Ready to Compile QBR Review</h3>
          <p className="text-slate-600 text-sm max-w-md mx-auto mb-6 leading-relaxed">
            Select a client account and reporting quarter above, review data readiness, and click{' '}
            <strong>"Generate QBR Report"</strong> to assemble an executive presentation deck with deterministic analytics.
          </p>

          {selectedCustomer && selectedQuarter && (
            <div className="inline-flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-lg text-xs text-slate-600 mb-6">
              <span>Prepared Context:</span>
              <strong className="text-slate-900">{selectedCustomer.name}</strong>
              <span>•</span>
              <span className="text-blue-700 font-medium">
                {selectedQuarter.quarter} {selectedQuarter.year}
              </span>
              <span>•</span>
              <span>{currentQuarterKPIs.length} KPIs available</span>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={!readinessCheck.isValid || currentQuarterKPIs.length === 0}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              <Sparkles className="w-4 h-4" />
              <span>Compile Report Now</span>
            </button>
          </div>
        </section>
      ) : (
        /* =================================================================== */
        /* 12. Assembled Report Preview Container */
        /* =================================================================== */
        <article
          aria-label="Assembled QBR Report Preview"
          className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden"
        >
          {/* Document Masthead */}
          <header className="p-6 md:p-8 bg-slate-900 text-white border-b border-slate-800">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Status: {generatedReport.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400">
                    ID: <code className="font-mono text-slate-300">{generatedReport.id}</code>
                  </span>
                </div>

                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                  {generatedReport.title}
                </h1>

                <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-300" />
                    <span className="text-slate-200 font-medium">{selectedCustomer?.name}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-300" />
                    <span>
                      {selectedQuarter?.quarter} {selectedQuarter?.year}
                    </span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-300" />
                    <span>Compiled: {formatDate(generatedReport.generatedAt)}</span>
                  </div>
                </div>
              </div>

              {/* Document Actions: Export JSON & Copy */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadJSON}
                  disabled={reportValidation !== null && !reportValidation.isValid}
                  className="inline-flex items-center space-x-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                  title={
                    reportValidation && !reportValidation.isValid
                      ? 'Export disabled: Report contains validation errors'
                      : 'Download formatted report JSON'
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download JSON</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyJSON}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  title="Copy full JSON to clipboard"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </button>
              </div>
            </div>

            {/* Scorecard Strip in Header */}
            {reportSummary && (
              <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-slate-400">KPI Telemetry</div>
                  <div className="text-xl font-bold text-white mt-0.5">{reportSummary.totalKPIs}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Analyses Compiled</div>
                </div>

                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-slate-400">Anomalies Detected</div>
                  <div className="text-xl font-bold text-rose-300 mt-0.5">{reportSummary.totalAnomalies}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Variance Breaches</div>
                </div>

                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-slate-400">Executive Insights</div>
                  <div className="text-xl font-bold text-indigo-300 mt-0.5">{reportSummary.totalInsights}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Contextual Findings</div>
                </div>

                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-slate-400">Recommendations</div>
                  <div className="text-xl font-bold text-emerald-300 mt-0.5">{reportSummary.totalRecommendations}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Operational Actions</div>
                </div>
              </div>
            )}
          </header>

          {/* ================================================================= */}
          {/* 13. Report Post-Validation Banner (Section 14) */}
          {/* ================================================================= */}
          {reportValidation && (
            <div
              className={`px-6 py-3 border-b text-xs flex flex-wrap items-center justify-between gap-3 ${
                reportValidation.isValid
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center space-x-2">
                {reportValidation.isValid ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold">Report Schema Integrity Verified:</span>
                    <span>All sections conform strictly to deterministic QBR standards.</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="font-semibold">Validation Errors Detected:</span>
                    <span>{reportValidation.errors.join('; ')} (Export disabled).</span>
                  </>
                )}
              </div>

              {reportValidation.warnings.length > 0 && (
                <div className="text-amber-800 text-[11px]">
                  {reportValidation.warnings.length} non-blocking notice(s)
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* 14. Report Section Navigation (Section 8) */}
          {/* ================================================================= */}
          <nav
            aria-label="Report Section Tabs"
            className="flex items-center space-x-1 px-6 pt-4 border-b border-slate-200 overflow-x-auto bg-slate-50/50"
          >
            {REPORT_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeReportTab === tab.id;
              let count: number | null = null;
              if (tab.id === 'kpis') count = generatedReport.kpiAnalyses.length;
              if (tab.id === 'anomalies') count = generatedReport.anomalies.length;
              if (tab.id === 'insights') count = generatedReport.insights.length;
              if (tab.id === 'recommendations') count = generatedReport.recommendations.length;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveReportTab(tab.id)}
                  className={`inline-flex items-center space-x-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isActive
                      ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {count !== null && (
                    <span
                      className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* ================================================================= */}
          {/* 15. Report Body & Active Tab Views */}
          {/* ================================================================= */}
          <div className="p-6 md:p-8 space-y-8">
            {/* --------------------------------------------------------------- */}
            {/* Tab: Executive Summary (Section 9) */}
            {/* --------------------------------------------------------------- */}
            {(activeReportTab === 'summary' || activeReportTab === 'all') && (
              <section aria-labelledby="section-summary-heading" className="space-y-4">
                <div className="flex items-center space-x-2 text-slate-900 border-b border-slate-200 pb-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 id="section-summary-heading" className="text-lg font-bold">
                    Executive Summary
                  </h3>
                </div>

                {generatedReport.executiveSummary && generatedReport.executiveSummary.trim() !== '' ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 md:p-6 text-slate-800 text-sm leading-relaxed space-y-3">
                    <p className="font-serif text-base italic text-slate-700 border-l-4 border-blue-500 pl-4 py-1">
                      {generatedReport.executiveSummary}
                    </p>
                    <div className="text-[11px] text-slate-500 pt-2 flex items-center space-x-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>
                        Derived deterministically from evaluated KPI compliance scores, anomaly detections, and trend directions.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No executive summary narrative was assembled for this report.
                  </div>
                )}
              </section>
            )}

            {/* --------------------------------------------------------------- */}
            {/* Tab: KPI Performance (Section 10) */}
            {/* --------------------------------------------------------------- */}
            {(activeReportTab === 'kpis' || activeReportTab === 'all') && (
              <section aria-labelledby="section-kpis-heading" className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2 text-slate-900">
                    <BarChart3 className="w-5 h-5 text-emerald-600" />
                    <h3 id="section-kpis-heading" className="text-lg font-bold">
                      KPI Performance & Targets
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {generatedReport.kpiAnalyses.length} Metrics Evaluated
                  </span>
                </div>

                {generatedReport.kpiAnalyses.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No KPI analyses were included in this report.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                            <th className="py-3 px-4">KPI Metric</th>
                            <th className="py-3 px-4">Current Value</th>
                            <th className="py-3 px-4">Baseline / Prev</th>
                            <th className="py-3 px-4">Target</th>
                            <th className="py-3 px-4">Absolute</th>
                            <th className="py-3 px-4">QoQ %</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Trend</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-slate-800">
                          {generatedReport.kpiAnalyses.map((analysis) => {
                            const rawKpi = kpiLookup.get(analysis.kpiId);
                            const metricName = rawKpi?.name || analysis.kpiId;
                            const unit = rawKpi?.unit || '';

                            return (
                              <tr key={analysis.kpiId} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4 font-medium text-slate-900">
                                  <div className="font-semibold">{metricName}</div>
                                  {rawKpi?.category && (
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                                      {rawKpi.category.replace('_', ' ')}
                                    </span>
                                  )}
                                </td>

                                <td className="py-3 px-4 font-semibold text-slate-900">
                                  {formatNumericValue(analysis.currentValue, unit)}
                                </td>

                                <td className="py-3 px-4 text-slate-600">
                                  {analysis.previousValue !== null
                                    ? formatNumericValue(analysis.previousValue, unit)
                                    : <span className="text-slate-400 italic">Baseline</span>}
                                </td>

                                <td className="py-3 px-4 text-slate-600">
                                  {analysis.target !== null
                                    ? formatNumericValue(analysis.target, unit)
                                    : <span className="text-slate-400 italic">None</span>}
                                </td>

                                <td className="py-3 px-4 font-mono text-slate-700">
                                  {analysis.absoluteChange !== null ? (
                                    <span>
                                      {analysis.absoluteChange > 0 ? `+${roundTo(analysis.absoluteChange, 2)}` : roundTo(analysis.absoluteChange, 2)}
                                      {unit ? ` ${unit}` : ''}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>

                                <td className="py-3 px-4 font-semibold">
                                  {analysis.percentageChange !== null ? (
                                    <span
                                      className={
                                        analysis.percentageChange > 0
                                          ? 'text-emerald-700'
                                          : analysis.percentageChange < 0
                                          ? 'text-rose-700'
                                          : 'text-slate-600'
                                      }
                                    >
                                      {formatChangeRatio(analysis.percentageChange, unit)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">N/A</span>
                                  )}
                                </td>

                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                                      analysis.performanceStatus === 'exceeded'
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : analysis.performanceStatus === 'met'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : analysis.performanceStatus === 'critical'
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : analysis.performanceStatus === 'underperforming'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                  >
                                    {analysis.performanceStatus.toUpperCase()}
                                  </span>
                                </td>

                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex items-center space-x-1 text-[11px] font-medium ${
                                      analysis.trendDirection === 'improving'
                                        ? 'text-emerald-700'
                                        : analysis.trendDirection === 'degrading'
                                        ? 'text-rose-700'
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    {analysis.trendDirection === 'improving' ? (
                                      <TrendingUp className="w-3.5 h-3.5" />
                                    ) : analysis.trendDirection === 'degrading' ? (
                                      <TrendingDown className="w-3.5 h-3.5" />
                                    ) : (
                                      <Minus className="w-3.5 h-3.5" />
                                    )}
                                    <span className="capitalize">{analysis.trendDirection}</span>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* --------------------------------------------------------------- */}
            {/* Tab: Operational Anomalies (Section 11) */}
            {/* --------------------------------------------------------------- */}
            {(activeReportTab === 'anomalies' || activeReportTab === 'all') && (
              <section aria-labelledby="section-anomalies-heading" className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2 text-slate-900">
                    <ShieldAlert className="w-5 h-5 text-rose-600" />
                    <h3 id="section-anomalies-heading" className="text-lg font-bold">
                      Operational Anomalies & Variances
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {generatedReport.anomalies.length} Incident(s)
                  </span>
                </div>

                {generatedReport.anomalies.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                    <p className="text-xs font-semibold text-slate-800">
                      No anomalies were included in this report.
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                      All monitored metrics remained within expected statistical bounds and SLA tolerance thresholds for this quarter.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {generatedReport.anomalies.map((anomaly) => {
                      const sev = SEVERITY_CONFIG[anomaly.severity] || SEVERITY_CONFIG.medium;
                      const relatedKpi = kpiLookup.get(anomaly.kpiId);

                      return (
                        <div
                          key={anomaly.id}
                          className={`p-4 rounded-xl border ${sev.border} bg-white shadow-2xs space-y-2.5`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${sev.bg} ${sev.text} border ${sev.border}`}
                            >
                              <AlertCircle className="w-3 h-3 mr-1" />
                              {sev.label}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {anomaly.anomalyType.replace('_', ' ')}
                            </span>
                          </div>

                          <div>
                            <div className="text-xs font-semibold text-slate-900">
                              {relatedKpi ? relatedKpi.name : anomaly.kpiId}
                            </div>
                            <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                              {anomaly.description}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 bg-slate-50/50 p-2 rounded-lg">
                            <strong className="text-slate-800">Recommended Action:</strong>{' '}
                            {anomaly.recommendedAction}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* --------------------------------------------------------------- */}
            {/* Tab: Executive Insights (Section 12) */}
            {/* --------------------------------------------------------------- */}
            {(activeReportTab === 'insights' || activeReportTab === 'all') && (
              <section aria-labelledby="section-insights-heading" className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2 text-slate-900">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                    <h3 id="section-insights-heading" className="text-lg font-bold">
                      Executive Findings & Strategic Insights
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {generatedReport.insights.length} Findings
                  </span>
                </div>

                {generatedReport.insights.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No executive insights were compiled for this reporting period.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {generatedReport.insights.map((insight) => {
                      const conf = CONFIDENCE_CONFIG[insight.confidenceLevel] || CONFIDENCE_CONFIG.medium;
                      const catLabel = CATEGORY_LABELS[insight.category] || insight.category;

                      return (
                        <div
                          key={insight.id}
                          className="p-5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                                {catLabel}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${conf.bg} ${conf.text} ${conf.border}`}
                              >
                                {conf.label}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">ID: {insight.id}</span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900">{insight.title}</h4>

                          <p className="text-xs text-slate-700 leading-relaxed">{insight.summary}</p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                            <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-lg">
                              <strong className="text-rose-900 font-semibold block mb-0.5">
                                Potential Business Impact
                              </strong>
                              <p className="text-slate-700 text-[11px] leading-relaxed">
                                {insight.businessImpact}
                              </p>
                            </div>

                            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                              <strong className="text-emerald-900 font-semibold block mb-0.5">
                                Actionable Recommendation
                              </strong>
                              <p className="text-slate-700 text-[11px] leading-relaxed">
                                {insight.recommendation}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* --------------------------------------------------------------- */}
            {/* Tab: Actionable Recommendations (Section 13) */}
            {/* --------------------------------------------------------------- */}
            {(activeReportTab === 'recommendations' || activeReportTab === 'all') && (
              <section aria-labelledby="section-recs-heading" className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2 text-slate-900">
                    <ListOrdered className="w-5 h-5 text-blue-600" />
                    <h3 id="section-recs-heading" className="text-lg font-bold">
                      Proposed Operational Recommendations
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {generatedReport.recommendations.length} Action Items
                  </span>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center space-x-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Proposed operational actions compiled for executive review. These items represent analytical recommendations and have not been automatically executed or assigned.
                  </span>
                </div>

                {generatedReport.recommendations.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No recommendations were compiled for this reporting period.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {generatedReport.recommendations.map((rec, idx) => {
                      const priorityColor =
                        rec.priority === 'critical'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : rec.priority === 'high'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200';

                      return (
                        <div
                          key={rec.id}
                          className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-start space-x-3.5"
                        >
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </div>

                          <div className="flex-1 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h5 className="text-xs font-bold text-slate-900">{rec.title}</h5>
                              <div className="flex items-center space-x-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityColor}`}
                                >
                                  {rec.priority.toUpperCase()}
                                </span>
                                {rec.estimatedEffort && (
                                  <span className="text-[10px] text-slate-500 border border-slate-200 bg-slate-50 px-1.5 py-0.5 rounded">
                                    Effort: {rec.estimatedEffort}
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="text-xs text-slate-700 leading-relaxed">{rec.action}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Document Footer */}
          <footer className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>QBR Intelligence Studio • Generated via Deterministic Assembly Engine</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={handleDownloadJSON}
                disabled={reportValidation !== null && !reportValidation.isValid}
                className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center space-x-1 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="hover:text-slate-800"
              >
                Back to Top ↑
              </button>
            </div>
          </footer>
        </article>
      )}
    </div>
  );
}

export default QBRReportDashboard;
