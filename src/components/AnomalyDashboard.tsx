/**
 * @file src/components/AnomalyDashboard.tsx
 * @description Interactive operational anomaly detection dashboard for QBR Intelligence Studio.
 *
 * Implements:
 * - Scoped customer and reporting quarter selection with controlled/uncontrolled state.
 * - Integration with deterministic rule-based engine in `anomalyDetection.ts`.
 * - Five executive summary cards (Total, Critical, Warnings, Affected KPIs, Data Quality).
 * - Visual severity distribution bar with accessible numerical and percentage breakdowns.
 * - Full-text search and multi-criteria filtering (Severity, Anomaly Type).
 * - Responsive findings table with KPI metrics, target benchmarks, and recommended actions.
 * - Anomaly detail inspection drawer with deterministic business risk explanations.
 * - Distinct handling of data-quality issues vs operational service breaches.
 * - Comprehensive empty, loading, error, and invalid-selection states.
 */

import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  X,
  Filter,
  Building2,
  Calendar,
  Layers,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  Database,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import type {
  Customer,
  ReportingQuarter,
  KPI,
  Anomaly,
  AnomalyType,
  AnomalySeverity,
} from '../types/qbr';
import {
  MOCK_CUSTOMERS,
  MOCK_REPORTING_QUARTERS,
  MOCK_KPIS,
} from '../data/mockData';
import {
  detectAnomalies,
  sortAnomaliesBySeverity,
  summarizeAnomalies,
  type AnomalySummary,
} from '../utils/anomalyDetection';
import {
  calculateAbsoluteChange,
  calculatePercentageChange,
  calculatePercentagePointChange,
  roundTo,
} from '../utils/kpiAnalytics';

// ============================================================================
// Props & Contract
// ============================================================================

export interface AnomalyDashboardProps {
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
  /** Indicates whether anomaly data is currently loading */
  isLoading?: boolean;
  /** Error message string to render in an alert banner */
  error?: string | null;
}

// ============================================================================
// Configuration & Human-Readable Labels
// ============================================================================

const SEVERITY_CONFIG: Record<
  AnomalySeverity,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    barColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  critical: {
    label: 'Critical',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    border: 'border-rose-200',
    barColor: 'bg-rose-500',
    icon: ShieldAlert,
  },
  high: {
    label: 'High Warning',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    border: 'border-orange-200',
    barColor: 'bg-orange-500',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Warning',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    border: 'border-amber-200',
    barColor: 'bg-amber-400',
    icon: AlertCircle,
  },
  low: {
    label: 'Low / Info',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    border: 'border-blue-200',
    barColor: 'bg-blue-400',
    icon: Info,
  },
};

const ANOMALY_TYPE_LABELS: Record<AnomalyType, { label: string; description: string }> = {
  target_divergence: {
    label: 'Target Breach',
    description: 'Actual performance fell short of the contractual target or SLA threshold.',
  },
  repeated_breach: {
    label: 'Repeated Breach',
    description: 'Target missed across multiple consecutive reporting quarters.',
  },
  sudden_spike: {
    label: 'Sudden Spike',
    description: 'Unfavorable upward surge exceeding variance thresholds on a lower-is-better metric.',
  },
  sudden_drop: {
    label: 'Sudden Drop',
    description: 'Unfavorable downward drop exceeding variance thresholds on a higher-is-better metric.',
  },
  outlier: {
    label: 'Data Quality Outlier',
    description: 'Numerical formatting inconsistency or range boundary warning in raw KPI data.',
  },
  stale_variance: {
    label: 'Stale Variance',
    description: 'Metric value has remained static despite expected operational fluctuation.',
  },
};

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Formats a KPI numerical value cleanly with its unit.
 */
function formatMetricValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'None';
  }

  switch (unit) {
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'hours':
      return `${value} hrs`;
    case 'minutes':
      return `${value} min`;
    case 'currency_usd':
      return `$${value.toLocaleString()}`;
    case 'currency_eur':
      return `€${value.toLocaleString()}`;
    case 'currency_gbp':
      return `£${value.toLocaleString()}`;
    case 'currency_inr':
      return `₹${value.toLocaleString()}`;
    case 'score_out_of_5':
      return `${value.toFixed(1)} / 5`;
    case 'score_out_of_10':
      return `${value.toFixed(1)} / 10`;
    case 'nps':
      return `${value}`;
    case 'count':
    default:
      return value.toLocaleString();
  }
}

/**
 * Produces a deterministic business risk explanation based on the KPI context and anomaly findings.
 * Does not make fabricated claims or assume confirmed root causes.
 */
function getDeterministicRiskExplanation(
  anomaly: Anomaly,
  kpi?: KPI | null
): string {
  if (anomaly.anomalyType === 'outlier') {
    return 'Input validation warning: A formatting, boundary, or unit inconsistency in the ingested dataset may distort reporting benchmarks and require source verification.';
  }

  const kpiName = (kpi?.name || '').toLowerCase();
  const category = (kpi?.category || '').toLowerCase();

  if (category === 'sla_compliance' || kpiName.includes('sla') || kpiName.includes('response')) {
    return 'Performance below the SLA benchmark may increase the risk of missed service delivery commitments and require review of response workflows.';
  }

  if (kpiName.includes('incident') || category === 'incident_management') {
    if (kpiName.includes('p1') || kpiName.includes('major')) {
      return 'Major incident frequency directly impacts operational continuity and points to critical infrastructure recovery and root-cause mitigation priorities.';
    }
    return 'An increase in incident volume may indicate elevated operational workload and potential system stability risks during peak demand periods.';
  }

  if (kpiName.includes('mttr') || kpiName.includes('resolve') || kpiName.includes('resolution')) {
    return 'Longer resolution times may compound service restoration delays and elevate cumulative disruption across dependent business workflows.';
  }

  if (kpiName.includes('availability') || kpiName.includes('uptime') || category === 'system_availability') {
    return 'Degraded system availability poses direct risks to end-user productivity and may trigger executive contractual escalation.';
  }

  if (kpiName.includes('csat') || kpiName.includes('satisfaction') || category === 'customer_satisfaction') {
    return 'Declining satisfaction ratings indicate friction in service touchpoints and should be addressed through proactive stakeholder communication.';
  }

  if (category === 'security_governance') {
    return 'Security and compliance benchmark deviations require audit trail verification and adherence to baseline security policies.';
  }

  return 'Observed operational variance deviates from historical or benchmark baselines and should be reviewed during the upcoming quarterly cadence.';
}

// ============================================================================
// Component Implementation
// ============================================================================

export function AnomalyDashboard({
  customers: customersProp,
  reportingQuarters: quartersProp,
  kpis: kpisProp,
  selectedCustomerId: controlledCustomerId,
  selectedQuarterId: controlledQuarterId,
  onCustomerChange,
  onQuarterChange,
  isLoading = false,
  error = null,
}: AnomalyDashboardProps) {
  // Resolve data sources: respect explicitly provided empty arrays vs omitted props
  const allCustomers = useMemo(
    () => (customersProp !== undefined ? customersProp : MOCK_CUSTOMERS),
    [customersProp]
  );
  const allQuarters = useMemo(
    () => (quartersProp !== undefined ? quartersProp : MOCK_REPORTING_QUARTERS),
    [quartersProp]
  );
  const allKPIs = useMemo(
    () => (kpisProp !== undefined ? kpisProp : MOCK_KPIS),
    [kpisProp]
  );

  // Uncontrolled state fallbacks
  const [internalCustomerId, setInternalCustomerId] = useState<string>(
    () => allCustomers[0]?.id || ''
  );
  const [internalQuarterId, setInternalQuarterId] = useState<string>('');

  // Filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Inspected anomaly for detail panel
  const [inspectedAnomalyId, setInspectedAnomalyId] = useState<string | null>(null);

  // Effective customer ID
  const effectiveCustomerId =
    controlledCustomerId !== undefined ? controlledCustomerId : internalCustomerId;

  // Selected customer object
  const selectedCustomer = useMemo(
    () => allCustomers.find((c) => c.id === effectiveCustomerId) || null,
    [allCustomers, effectiveCustomerId]
  );

  // Available quarters for the active customer, sorted chronologically
  const customerQuarters = useMemo(() => {
    if (!effectiveCustomerId) return [];
    return allQuarters
      .filter((q) => q.customerId === effectiveCustomerId)
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.quarter.localeCompare(b.quarter);
      });
  }, [allQuarters, effectiveCustomerId]);

  // Effective quarter ID
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

  // Selected quarter object
  const selectedQuarter = useMemo(
    () => customerQuarters.find((q) => q.id === effectiveQuarterId) || null,
    [customerQuarters, effectiveQuarterId]
  );

  // Check whether the selected quarter belongs to the selected customer
  const isQuarterValid = useMemo(() => {
    if (!effectiveQuarterId || !effectiveCustomerId) return false;
    return customerQuarters.some((q) => q.id === effectiveQuarterId);
  }, [customerQuarters, effectiveQuarterId, effectiveCustomerId]);

  // Filter KPIs strictly scoped to the active customer and active quarter
  const rawQuarterKPIs = useMemo(() => {
    if (!isQuarterValid || !effectiveCustomerId || !effectiveQuarterId) {
      return [];
    }
    return allKPIs.filter(
      (k) => k.customerId === effectiveCustomerId && k.quarterId === effectiveQuarterId
    );
  }, [allKPIs, effectiveCustomerId, effectiveQuarterId, isQuarterValid]);

  // Look-up map of KPIs by ID for fast lookup of anomaly references
  const kpiMap = useMemo(() => {
    const map = new Map<string, KPI>();
    for (const kpi of rawQuarterKPIs) {
      map.set(kpi.id, kpi);
    }
    return map;
  }, [rawQuarterKPIs]);

  // Detect and sort anomalies using the existing engine
  const allQuarterAnomalies = useMemo(() => {
    if (rawQuarterKPIs.length === 0) return [];
    const detected = detectAnomalies(rawQuarterKPIs);
    return sortAnomaliesBySeverity(detected);
  }, [rawQuarterKPIs]);

  // Summary statistics for the full quarter findings
  const summary: AnomalySummary = useMemo(
    () => summarizeAnomalies(allQuarterAnomalies),
    [allQuarterAnomalies]
  );

  // Filtered anomalies based on search, severity, and type
  const filteredAnomalies = useMemo(() => {
    return allQuarterAnomalies.filter((anomaly) => {
      // 1. Severity filter
      if (selectedSeverity !== 'all' && anomaly.severity !== selectedSeverity) {
        return false;
      }

      // 2. Anomaly Type filter
      if (selectedType !== 'all' && anomaly.anomalyType !== selectedType) {
        return false;
      }

      // 3. Search query filter (matches KPI name, anomaly type label, description, recommended action)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const kpi = kpiMap.get(anomaly.kpiId);
        const kpiName = (kpi?.name || '').toLowerCase();
        const typeLabel = (ANOMALY_TYPE_LABELS[anomaly.anomalyType]?.label || '').toLowerCase();
        const desc = anomaly.description.toLowerCase();
        const rec = anomaly.recommendedAction.toLowerCase();

        const matches =
          kpiName.includes(query) ||
          typeLabel.includes(query) ||
          desc.includes(query) ||
          rec.includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [allQuarterAnomalies, selectedSeverity, selectedType, searchQuery, kpiMap]);

  // Currently inspected anomaly for detail panel
  const inspectedAnomaly = useMemo(() => {
    if (!inspectedAnomalyId) return null;
    return allQuarterAnomalies.find((a) => a.id === inspectedAnomalyId) || null;
  }, [allQuarterAnomalies, inspectedAnomalyId]);

  const inspectedKPI = useMemo(() => {
    if (!inspectedAnomaly) return null;
    return kpiMap.get(inspectedAnomaly.kpiId) || null;
  }, [inspectedAnomaly, kpiMap]);

  // Handlers
  const handleCustomerChange = (customerId: string) => {
    if (onCustomerChange) {
      onCustomerChange(customerId);
    } else {
      setInternalCustomerId(customerId);
      const newQuarters = allQuarters.filter((q) => q.customerId === customerId);
      const latest = newQuarters[newQuarters.length - 1];
      setInternalQuarterId(latest?.id || '');
    }
  };

  const handleQuarterChange = (quarterId: string) => {
    if (onQuarterChange) {
      onQuarterChange(quarterId);
    } else {
      setInternalQuarterId(quarterId);
    }
  };

  // Severity Distribution calculation
  const total = summary.totalAnomalies;
  const criticalPct = total > 0 ? roundTo((summary.criticalCount / total) * 100, 1) : 0;
  const highPct = total > 0 ? roundTo((summary.highCount / total) * 100, 1) : 0;
  const mediumPct = total > 0 ? roundTo((summary.mediumCount / total) * 100, 1) : 0;
  const lowPct = total > 0 ? roundTo((summary.lowCount / total) * 100, 1) : 0;

  // ============================================================================
  // Render: Loading State
  // ============================================================================

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading anomaly analytics">
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col md:flex-row justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-200 rounded" />
            <div className="h-4 w-72 bg-slate-100 rounded" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-44 bg-slate-200 rounded-lg" />
            <div className="h-10 w-36 bg-slate-200 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 h-28" />
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 h-64" />
      </div>
    );
  }

  // ============================================================================
  // Render: Global Error State
  // ============================================================================

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-8 text-center max-w-xl mx-auto my-8 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Unable to Load Anomalies</h3>
        <p className="text-sm text-slate-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
        >
          Reload Interface
        </button>
      </div>
    );
  }

  // ============================================================================
  // Render: No Customers State
  // ============================================================================

  if (allCustomers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-md mx-auto my-8 shadow-xs">
        <Building2 className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900 mb-1">No Customers Available</h3>
        <p className="text-xs text-slate-500">
          No customer accounts found in the dataset. Please ingest customer data to inspect anomalies.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Scoping Controls Bar */}
      <section
        aria-label="Customer and Quarter Context"
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Operational Anomaly Detection
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Automated threshold breach evaluation, sudden variance detection, and data-quality analysis.
            </p>
          </div>

          {/* Customer & Quarter Pickers */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Customer Selector */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
              <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
              <label htmlFor="anomaly-customer-select" className="text-xs font-medium text-slate-600 shrink-0">
                Customer:
              </label>
              <select
                id="anomaly-customer-select"
                value={effectiveCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer pr-2"
                aria-label="Select customer account"
              >
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quarter Selector */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <label htmlFor="anomaly-quarter-select" className="text-xs font-medium text-slate-600 shrink-0">
                Quarter:
              </label>
              <select
                id="anomaly-quarter-select"
                value={effectiveQuarterId}
                onChange={(e) => handleQuarterChange(e.target.value)}
                disabled={customerQuarters.length === 0}
                className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer pr-2 disabled:opacity-50"
                aria-label="Select reporting quarter"
              >
                {customerQuarters.length === 0 ? (
                  <option value="">No Quarters</option>
                ) : (
                  customerQuarters.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quarter} {q.year} ({q.status})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Invalid Selection Alert */}
        {!isQuarterValid && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3 text-amber-800 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">Mismatched Customer and Quarter Context</p>
              <p className="mt-0.5 text-amber-700">
                The selected reporting quarter does not belong to the active customer account. Please select a valid quarter.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* 2. Executive Anomaly Summary Scorecards (Section 4) */}
      <section aria-labelledby="anomaly-scorecard-heading">
        <div className="flex items-center justify-between mb-3">
          <h3 id="anomaly-scorecard-heading" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Quarterly Findings Overview — {selectedCustomer?.name} ({selectedQuarter ? `${selectedQuarter.quarter} ${selectedQuarter.year}` : 'N/A'})
          </h3>
          <span className="text-[11px] text-slate-400">
            Engine evaluated {rawQuarterKPIs.length} operational metric records
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Total Anomalies */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Total Anomalies</span>
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{summary.totalAnomalies}</div>
            <p className="text-[11px] text-slate-500 mt-1">
              {summary.totalAnomalies === 0 ? 'Zero breaches detected' : 'Automated rule alerts'}
            </p>
          </div>

          {/* Card 2: Critical Severity */}
          <div className="bg-white rounded-xl border border-rose-100 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-rose-700">Critical</span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-700">{summary.criticalCount}</div>
            <p className="text-[11px] text-rose-600/80 mt-1">Severe target shortfalls</p>
          </div>

          {/* Card 3: Warnings (High + Medium) */}
          <div className="bg-white rounded-xl border border-amber-100 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-amber-700">Warnings</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-700">
              {summary.highCount + summary.mediumCount}
            </div>
            <p className="text-[11px] text-amber-600/80 mt-1">
              High: {summary.highCount} • Med: {summary.mediumCount}
            </p>
          </div>

          {/* Card 4: Affected KPIs */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Affected KPIs</span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{summary.affectedKPICount}</div>
            <p className="text-[11px] text-slate-500 mt-1">
              of {rawQuarterKPIs.length} quarter metrics ({rawQuarterKPIs.length > 0 ? roundTo((summary.affectedKPICount / rawQuarterKPIs.length) * 100, 0) : 0}%)
            </p>
          </div>

          {/* Card 5: Data Quality Findings */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Data Quality</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Database className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{summary.dataQualityIssueCount}</div>
            <p className="text-[11px] text-slate-500 mt-1">Schema or boundary checks</p>
          </div>
        </div>
      </section>

      {/* 3. Severity Distribution Breakdown (Section 5) */}
      <section
        aria-label="Severity Distribution"
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Severity Distribution
          </h3>
          <span className="text-xs text-slate-500">
            {total} detected finding{total === 1 ? '' : 's'} across all operational tiers
          </span>
        </div>

        {total === 0 ? (
          <div className="bg-slate-50 rounded-lg p-3 text-center text-xs text-slate-500">
            No severity distribution available: zero anomalies detected.
          </div>
        ) : (
          <div>
            {/* Visual Progress Bar */}
            <div
              className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden flex"
              role="meter"
              aria-label="Anomaly severity breakdown"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={summary.criticalCount}
            >
              {summary.criticalCount > 0 && (
                <div
                  style={{ width: `${criticalPct}%` }}
                  className="bg-rose-500 h-full transition-all duration-300"
                  title={`Critical: ${summary.criticalCount} (${criticalPct}%)`}
                />
              )}
              {summary.highCount > 0 && (
                <div
                  style={{ width: `${highPct}%` }}
                  className="bg-orange-500 h-full transition-all duration-300"
                  title={`High: ${summary.highCount} (${highPct}%)`}
                />
              )}
              {summary.mediumCount > 0 && (
                <div
                  style={{ width: `${mediumPct}%` }}
                  className="bg-amber-400 h-full transition-all duration-300"
                  title={`Medium: ${summary.mediumCount} (${mediumPct}%)`}
                />
              )}
              {summary.lowCount > 0 && (
                <div
                  style={{ width: `${lowPct}%` }}
                  className="bg-blue-400 h-full transition-all duration-300"
                  title={`Low: ${summary.lowCount} (${lowPct}%)`}
                />
              )}
            </div>

            {/* Accessible Legend & Counts */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                <span className="font-semibold text-slate-800">Critical:</span>
                <span className="text-slate-600">
                  {summary.criticalCount} ({criticalPct}%)
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                <span className="font-semibold text-slate-800">High:</span>
                <span className="text-slate-600">
                  {summary.highCount} ({highPct}%)
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                <span className="font-semibold text-slate-800">Medium:</span>
                <span className="text-slate-600">
                  {summary.mediumCount} ({mediumPct}%)
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
                <span className="font-semibold text-slate-800">Low / Info:</span>
                <span className="text-slate-600">
                  {summary.lowCount} ({lowPct}%)
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 4. Filter Toolbar & Search Bar (Sections 7, 8, 9) */}
      <section aria-label="Anomaly filters and search" className="space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search anomalies or KPIs..."
              className="w-full pl-9 pr-9 py-2 bg-white border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-2xs"
              aria-label="Search anomalies by description, KPI name, or type"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                aria-label="Clear search input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Anomaly Type Filter Dropdown */}
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <label htmlFor="anomaly-type-filter" className="text-xs font-medium text-slate-600 shrink-0">
              Type:
            </label>
            <select
              id="anomaly-type-filter"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
            >
              <option value="all">All Anomaly Types</option>
              <option value="target_divergence">Target Breaches</option>
              <option value="repeated_breach">Repeated Breaches</option>
              <option value="sudden_spike">Sudden Spikes</option>
              <option value="sudden_drop">Sudden Drops</option>
              <option value="outlier">Data Quality Outliers</option>
            </select>
          </div>
        </div>

        {/* Severity Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Filter by severity">
          <button
            type="button"
            role="tab"
            aria-selected={selectedSeverity === 'all'}
            onClick={() => setSelectedSeverity('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              selectedSeverity === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Severities ({allQuarterAnomalies.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedSeverity === 'critical'}
            onClick={() => setSelectedSeverity('critical')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 ${
              selectedSeverity === 'critical'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-rose-700 hover:bg-rose-50'
            }`}
          >
            Critical ({summary.criticalCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedSeverity === 'high'}
            onClick={() => setSelectedSeverity('high')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 ${
              selectedSeverity === 'high'
                ? 'bg-orange-600 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-orange-700 hover:bg-orange-50'
            }`}
          >
            High ({summary.highCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedSeverity === 'medium'}
            onClick={() => setSelectedSeverity('medium')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 ${
              selectedSeverity === 'medium'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-amber-700 hover:bg-amber-50'
            }`}
          >
            Medium ({summary.mediumCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedSeverity === 'low'}
            onClick={() => setSelectedSeverity('low')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              selectedSeverity === 'low'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-blue-700 hover:bg-blue-50'
            }`}
          >
            Low ({summary.lowCount})
          </button>
        </div>
      </section>

      {/* 5. Anomaly Findings Table & List (Section 6) */}
      <section
        aria-label="Anomaly findings list"
        className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs"
      >
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Findings & Threshold Breaches
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {filteredAnomalies.length} of {allQuarterAnomalies.length} detected findings for this quarter.
            </p>
          </div>
          {(searchQuery || selectedSeverity !== 'all' || selectedType !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedSeverity('all');
                setSelectedType('all');
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none"
            >
              Reset active filters
            </button>
          )}
        </div>

        {/* Empty States */}
        {allQuarterAnomalies.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900 mb-1">
              No anomalies detected in the available KPI dataset.
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              All evaluated metric actuals satisfied contract targets or remained within expected quarter-on-quarter variance bands.
            </p>
          </div>
        ) : filteredAnomalies.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900 mb-1">No Matching Anomalies</h4>
            <p className="text-xs text-slate-500 mb-3">
              No findings matched your search and filter criteria.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedSeverity('all');
                setSelectedType('all');
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th scope="col" className="py-3 px-4">Severity</th>
                  <th scope="col" className="py-3 px-3">Type</th>
                  <th scope="col" className="py-3 px-3">Affected Metric</th>
                  <th scope="col" className="py-3 px-3">Description</th>
                  <th scope="col" className="py-3 px-3 text-right">Current</th>
                  <th scope="col" className="py-3 px-3 text-right">Target</th>
                  <th scope="col" className="py-3 px-3 text-right">Previous</th>
                  <th scope="col" className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAnomalies.map((anomaly) => {
                  const kpi = kpiMap.get(anomaly.kpiId);
                  const severityConfig = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.medium;
                  const SeverityIcon = severityConfig.icon;
                  const typeMeta = ANOMALY_TYPE_LABELS[anomaly.anomalyType] ?? {
                    label: anomaly.anomalyType,
                    description: '',
                  };
                  const isSelected = inspectedAnomalyId === anomaly.id;

                  return (
                    <tr
                      key={anomaly.id}
                      onClick={() => setInspectedAnomalyId(anomaly.id)}
                      className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      {/* Severity Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${severityConfig.badgeBg} ${severityConfig.badgeText} ${severityConfig.border}`}
                        >
                          <SeverityIcon className="w-3 h-3 shrink-0" />
                          <span>{severityConfig.label}</span>
                        </span>
                      </td>

                      {/* Anomaly Type */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 block">
                          {typeMeta.label}
                        </span>
                      </td>

                      {/* KPI Name */}
                      <td className="py-3.5 px-3 font-semibold text-slate-900 whitespace-nowrap max-w-[180px] truncate">
                        {kpi ? kpi.name : `Metric Ref: ${anomaly.kpiId}`}
                      </td>

                      {/* Anomaly Description */}
                      <td className="py-3.5 px-3 text-slate-600 max-w-xs truncate" title={anomaly.description}>
                        {anomaly.description}
                      </td>

                      {/* Current Value */}
                      <td className="py-3.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {kpi ? formatMetricValue(kpi.value, kpi.unit) : 'N/A'}
                      </td>

                      {/* Target */}
                      <td className="py-3.5 px-3 text-right text-slate-600 whitespace-nowrap">
                        {kpi ? formatMetricValue(kpi.target, kpi.unit) : 'None'}
                      </td>

                      {/* Previous Value */}
                      <td className="py-3.5 px-3 text-right text-slate-500 whitespace-nowrap">
                        {kpi ? formatMetricValue(kpi.previousQuarterValue, kpi.unit) : 'None'}
                      </td>

                      {/* Drill-down Button */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedAnomalyId(anomaly.id);
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. Anomaly Detail Modal / Slide-Over Panel (Sections 10, 11, 12, 13) */}
      {inspectedAnomaly && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="anomaly-detail-title"
          onClick={() => setInspectedAnomalyId(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full p-6 sm:p-7 relative space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center space-x-2 mb-1.5">
                  <span
                    className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      SEVERITY_CONFIG[inspectedAnomaly.severity].badgeBg
                    } ${SEVERITY_CONFIG[inspectedAnomaly.severity].badgeText} ${
                      SEVERITY_CONFIG[inspectedAnomaly.severity].border
                    }`}
                  >
                    {SEVERITY_CONFIG[inspectedAnomaly.severity].label}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {ANOMALY_TYPE_LABELS[inspectedAnomaly.anomalyType]?.label || inspectedAnomaly.anomalyType}
                  </span>
                </div>
                <h3 id="anomaly-detail-title" className="text-lg font-bold text-slate-900">
                  {inspectedKPI ? inspectedKPI.name : `Metric ID: ${inspectedAnomaly.kpiId}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedAnomalyId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close anomaly details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description & Data Quality Note */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Observed Anomaly
              </h4>
              <p className="text-sm text-slate-800 leading-relaxed bg-slate-50 rounded-xl p-3.5 border border-slate-200">
                {inspectedAnomaly.description}
              </p>
            </div>

            {/* Data Quality Special Distinction Callout */}
            {inspectedAnomaly.anomalyType === 'outlier' && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start space-x-3 text-xs text-blue-900">
                <Database className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold">Data Quality Finding</h5>
                  <p className="mt-0.5 text-blue-800 leading-relaxed">
                    This finding indicates a source formatting irregularity or value boundary alert rather than a confirmed infrastructure or SLA failure. Please verify raw workbook cells.
                  </p>
                </div>
              </div>
            )}

            {/* KPI Metrics Comparison Grid */}
            {inspectedKPI && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Metric Baseline & Targets
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-center">
                    <span className="text-[11px] text-slate-500 font-medium block">Current Actual</span>
                    <span className="text-base font-bold text-slate-900 mt-0.5 block">
                      {formatMetricValue(inspectedKPI.value, inspectedKPI.unit)}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-center">
                    <span className="text-[11px] text-slate-500 font-medium block">Target Benchmark</span>
                    <span className="text-base font-bold text-slate-900 mt-0.5 block">
                      {formatMetricValue(inspectedKPI.target, inspectedKPI.unit)}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-center">
                    <span className="text-[11px] text-slate-500 font-medium block">Previous Quarter</span>
                    <span className="text-base font-bold text-slate-900 mt-0.5 block">
                      {formatMetricValue(inspectedKPI.previousQuarterValue, inspectedKPI.unit)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Business Risk Operational Significance (Section 11) */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Potential Operational Significance
              </h4>
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                {getDeterministicRiskExplanation(inspectedAnomaly, inspectedKPI)}
              </div>
            </div>

            {/* Recommended Corrective Action (Section 12) */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Suggested Corrective Action
              </h4>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed">
                {inspectedAnomaly.recommendedAction || 'Further investigation recommended.'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 italic">
                Note: Recommended actions represent operational guidance derived from ITSM benchmarks. Action has not yet been executed or assigned.
              </p>
            </div>

            {/* Anomaly Metadata & Timestamps */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <div className="flex items-center space-x-1.5">
                <span>Evaluated Reference:</span>
                <span className="font-mono text-slate-700">{inspectedAnomaly.detectedAt}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span>Anomaly Record ID:</span>
                <span className="font-mono text-slate-700">{inspectedAnomaly.id}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInspectedAnomalyId(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Close Finding
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnomalyDashboard;
