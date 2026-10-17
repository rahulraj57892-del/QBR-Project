/**
 * @file src/components/KPIAnalyticsDashboard.tsx
 * @description Interactive operational KPI analytics and performance benchmarking dashboard for QBR Intelligence Studio.
 *
 * Implements:
 * - Customer and reporting quarter scoping with controlled/uncontrolled state.
 * - Scorecard summary powered by `generateDashboardSummary` from `kpiAnalytics.ts`.
 * - Visual target compliance breakdown (Met, Missed, Not Evaluated).
 * - Full-text search and category filtering with instant reactivity.
 * - Comprehensive KPI performance table showing absolute and percentage/percentage-point changes.
 * - Direction-aware performance status badges (met, underperforming, critical, unrated).
 * - Multi-quarter historical trend visualization.
 * - Drill-down KPI detail panel with deterministic analysis notes.
 */

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Search,
  X,
  Filter,
  Layers,
  Calendar,
  Building2,
  ArrowUpDown,
  Clock,
  ChevronRight,
  Info,
} from 'lucide-react';
import type {
  Customer,
  ReportingQuarter,
  KPI,
  KPIAnalysis,
  KPICategory,
} from '../types/qbr';
import {
  MOCK_CUSTOMERS,
  MOCK_REPORTING_QUARTERS,
  MOCK_KPIS,
} from '../data/mockData';
import {
  analyzeKPIs,
  generateDashboardSummary,
  roundTo,
} from '../utils/kpiAnalytics';

// ============================================================================
// Props & Types
// ============================================================================

export interface KPIAnalyticsDashboardProps {
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
  /** Indicates whether analytics data is currently loading */
  isLoading?: boolean;
  /** Error message string to render in an alert banner */
  error?: string | null;
}

// Category human-readable label mapping
const CATEGORY_LABELS: Record<string, string> = {
  sla_compliance: 'SLA Compliance',
  incident_management: 'Incident Management',
  system_availability: 'System Availability',
  operational_efficiency: 'Operational Efficiency',
  financial_cost: 'Financial Cost',
  customer_satisfaction: 'Customer Satisfaction',
  security_governance: 'Security & Governance',
  infrastructure_capacity: 'Infrastructure Capacity',
  custom: 'Custom Metrics',
};

// ============================================================================
// Component Implementation
// ============================================================================

export function KPIAnalyticsDashboard({
  customers: customersProp,
  reportingQuarters: quartersProp,
  kpis: kpisProp,
  selectedCustomerId: controlledCustomerId,
  selectedQuarterId: controlledQuarterId,
  onCustomerChange,
  onQuarterChange,
  isLoading = false,
  error = null,
}: KPIAnalyticsDashboardProps) {
  // Resolve data arrays: distinguish explicitly supplied empty arrays from omitted props
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

  // Search and Category Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Selected KPI for detail panel
  const [inspectedKPIId, setInspectedKPIId] = useState<string | null>(null);

  // Effective customer ID
  const effectiveCustomerId =
    controlledCustomerId !== undefined ? controlledCustomerId : internalCustomerId;

  // Selected customer object
  const selectedCustomer = useMemo(
    () => allCustomers.find((c) => c.id === effectiveCustomerId) || allCustomers[0],
    [allCustomers, effectiveCustomerId]
  );

  // Chronologically sorted quarters for the active customer (newest first)
  const customerQuarters = useMemo(() => {
    if (!selectedCustomer) return [];
    return allQuarters
      .filter((q) => q.customerId === selectedCustomer.id)
      .slice()
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.startDate.localeCompare(a.startDate);
      });
  }, [allQuarters, selectedCustomer]);

  // Effective quarter ID
  const effectiveQuarterId = useMemo(() => {
    if (controlledQuarterId !== undefined) {
      return controlledQuarterId;
    }
    const match = customerQuarters.find((q) => q.id === internalQuarterId);
    if (match) return match.id;
    return customerQuarters[0]?.id || '';
  }, [controlledQuarterId, internalQuarterId, customerQuarters]);

  // Selected quarter object
  const selectedQuarter = useMemo(
    () => customerQuarters.find((q) => q.id === effectiveQuarterId) || customerQuarters[0],
    [customerQuarters, effectiveQuarterId]
  );

  // KPIs for the selected customer and selected quarter
  const rawQuarterKPIs = useMemo(() => {
    if (!selectedCustomer || !selectedQuarter) return [];
    return allKPIs.filter(
      (kpi) =>
        kpi.customerId === selectedCustomer.id &&
        kpi.quarterId === selectedQuarter.id
    );
  }, [allKPIs, selectedCustomer, selectedQuarter]);

  // Available categories present in current quarter's dataset
  const availableCategories = useMemo(() => {
    const cats = new Set<KPICategory>();
    for (const k of rawQuarterKPIs) {
      cats.add(k.category);
    }
    return Array.from(cats);
  }, [rawQuarterKPIs]);

  // Filtered KPIs by Category and Search query
  const filteredKPIs = useMemo(() => {
    let result = rawQuarterKPIs;

    if (selectedCategory !== 'all') {
      result = result.filter((k) => k.category === selectedCategory);
    }

    const trimmed = searchQuery.trim().toLowerCase();
    if (trimmed) {
      result = result.filter(
        (k) =>
          k.name.toLowerCase().includes(trimmed) ||
          k.category.toLowerCase().includes(trimmed) ||
          CATEGORY_LABELS[k.category]?.toLowerCase().includes(trimmed)
      );
    }

    return result;
  }, [rawQuarterKPIs, selectedCategory, searchQuery]);

  // Perform full KPI analyses using kpiAnalytics.ts
  const analyzedKPIs = useMemo(() => {
    return analyzeKPIs(filteredKPIs);
  }, [filteredKPIs]);

  // Map of analysis results keyed by kpiId
  const analysisMap = useMemo(() => {
    return new Map<string, KPIAnalysis>(analyzedKPIs.map((a) => [a.kpiId, a]));
  }, [analyzedKPIs]);

  // Dashboard summary metrics for the active (filtered) KPIs
  const dashboardSummary = useMemo(() => {
    return generateDashboardSummary(filteredKPIs);
  }, [filteredKPIs]);

  // Target compliance distribution (Met, Missed, Not Evaluated)
  const complianceBreakdown = useMemo(() => {
    let met = 0;
    let missed = 0;
    let unrated = 0;

    for (const kpi of filteredKPIs) {
      if (kpi.target === null || !Number.isFinite(kpi.target)) {
        unrated++;
      } else {
        const isMet =
          kpi.direction === 'higher_is_better'
            ? kpi.value >= kpi.target
            : kpi.value <= kpi.target;
        if (isMet) met++;
        else missed++;
      }
    }

    const total = filteredKPIs.length;
    const metPct = total > 0 ? roundTo((met / total) * 100, 1) : 0;
    const missedPct = total > 0 ? roundTo((missed / total) * 100, 1) : 0;
    const unratedPct = total > 0 ? roundTo((unrated / total) * 100, 1) : 0;

    return { met, missed, unrated, total, metPct, missedPct, unratedPct };
  }, [filteredKPIs]);

  // Currently inspected KPI object and its analysis
  const inspectedKPI = useMemo(() => {
    if (!inspectedKPIId) return null;
    return filteredKPIs.find((k) => k.id === inspectedKPIId) || null;
  }, [filteredKPIs, inspectedKPIId]);

  const inspectedAnalysis = useMemo(() => {
    if (!inspectedKPI) return null;
    return analysisMap.get(inspectedKPI.id) || null;
  }, [inspectedKPI, analysisMap]);

  // Historical data points for inspected KPI across all quarters for this customer
  const inspectedHistory = useMemo(() => {
    if (!selectedCustomer || !inspectedKPI) return [];

    // Match by stable KPI identity (name and unit) for this customer
    const matchingKPIs = allKPIs.filter(
      (k) =>
        k.customerId === selectedCustomer.id &&
        k.name.trim().toLowerCase() === inspectedKPI.name.trim().toLowerCase() &&
        k.unit === inspectedKPI.unit
    );

    // Join with quarter metadata and sort chronologically (oldest to newest for charts)
    return matchingKPIs
      .map((kpi) => {
        const quarter = allQuarters.find((q) => q.id === kpi.quarterId);
        return {
          quarterId: kpi.quarterId,
          quarterLabel: quarter ? `${quarter.quarter} ${quarter.year}` : kpi.quarterId,
          year: quarter?.year ?? 0,
          quarterName: quarter?.quarter ?? '',
          value: kpi.value,
          target: kpi.target,
          unit: kpi.unit,
          startDate: quarter?.startDate ?? '',
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [selectedCustomer, inspectedKPI, allKPIs, allQuarters]);

  // Handlers for controlled/uncontrolled selection changes
  const handleCustomerChange = (customerId: string) => {
    if (onCustomerChange) {
      onCustomerChange(customerId);
    }
    if (controlledCustomerId === undefined) {
      setInternalCustomerId(customerId);
    }
    const qList = allQuarters.filter((q) => q.customerId === customerId);
    if (qList.length > 0 && controlledQuarterId === undefined) {
      setInternalQuarterId(qList[0].id);
      if (onQuarterChange) {
        onQuarterChange(qList[0].id);
      }
    }
    setInspectedKPIId(null);
  };

  const handleQuarterChange = (quarterId: string) => {
    if (onQuarterChange) {
      onQuarterChange(quarterId);
    }
    if (controlledQuarterId === undefined) {
      setInternalQuarterId(quarterId);
    }
    setInspectedKPIId(null);
  };

  // Helper formatting for units
  const formatKPIValue = (val: number | null, unit: string): string => {
    if (val === null || !Number.isFinite(val)) return '—';
    if (unit === 'percentage') return `${val}%`;
    if (unit === 'count') return Math.round(val).toLocaleString();
    if (unit === 'hours') return `${val} hrs`;
    if (unit === 'score_out_of_5') return `${val} / 5.0`;
    if (unit.startsWith('currency_')) {
      const symbol = unit.includes('usd') ? '$' : unit.includes('eur') ? '€' : '₹';
      return `${symbol}${val.toLocaleString()}`;
    }
    return `${val}`;
  };

  // ==========================================================================
  // Render States: Loading & Error
  // ==========================================================================

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" role="status" aria-label="Loading KPI analytics">
        <div className="bg-white rounded-xl border border-slate-200 p-6 h-28" />
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 h-24" />
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-rose-800" role="alert">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-base text-rose-900">Failed to Load KPI Analytics</h3>
            <p className="text-sm mt-1 text-rose-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedCustomer) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
        <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="font-semibold text-slate-800 text-base">No Customer Available</h3>
        <p className="text-sm text-slate-500 mt-1">Please configure customer portfolios to view KPI analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Header & Context Selectors */}
      <section aria-labelledby="analytics-heading" className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-xs">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600 mb-1">
              <BarChart3 className="w-4 h-4" />
              <span>PERFORMANCE BENCHMARKING</span>
            </div>
            <h2 id="analytics-heading" className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              KPI Analytics Dashboard
            </h2>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">
              Quarter-on-quarter variance, compliance thresholds, and operational trajectory.
            </p>
          </div>

          {/* Context Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Customer Switcher */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="customer-select" className="text-slate-500 font-medium">
                Customer:
              </label>
              <select
                id="customer-select"
                value={selectedCustomer.id}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="bg-transparent font-semibold text-slate-900 focus:outline-none cursor-pointer"
              >
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quarter Switcher */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="quarter-select" className="text-slate-500 font-medium">
                Quarter:
              </label>
              {customerQuarters.length === 0 ? (
                <span className="text-slate-400">No quarters</span>
              ) : (
                <select
                  id="quarter-select"
                  value={selectedQuarter?.id || ''}
                  onChange={(e) => handleQuarterChange(e.target.value)}
                  className="bg-transparent font-semibold text-blue-700 focus:outline-none cursor-pointer"
                >
                  {customerQuarters.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quarter} {q.year} ({q.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* 2. Six Scorecard Cards (Section 3) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Card 1: Total KPIs */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total KPIs
            </span>
            <span className="text-2xl font-bold text-slate-900 block mt-1">
              {dashboardSummary.totalKPIs}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              {selectedCategory !== 'all' ? 'Filtered subset' : 'Active quarter'}
            </span>
          </div>

          {/* Card 2: Targets Met */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Targets Met</span>
            </span>
            <span className="text-2xl font-bold text-emerald-700 block mt-1">
              {dashboardSummary.targetsMet}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Satisfied benchmarks</span>
          </div>

          {/* Card 3: Targets Missed */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider block flex items-center space-x-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Targets Missed</span>
            </span>
            <span className="text-2xl font-bold text-rose-700 block mt-1">
              {dashboardSummary.targetsMissed}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Breached benchmarks</span>
          </div>

          {/* Card 4: Improving */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block flex items-center space-x-1">
              <TrendingUp className="w-3 h-3" />
              <span>Improving</span>
            </span>
            <span className="text-2xl font-bold text-blue-700 block mt-1">
              {dashboardSummary.improvingKPIs}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Positive QoQ trend</span>
          </div>

          {/* Card 5: Declining */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider block flex items-center space-x-1">
              <TrendingDown className="w-3 h-3" />
              <span>Declining</span>
            </span>
            <span className="text-2xl font-bold text-amber-700 block mt-1">
              {dashboardSummary.decliningKPIs}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Negative QoQ trend</span>
          </div>

          {/* Card 6: Performance Score */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-purple-600 uppercase tracking-wider block">
              Score
            </span>
            <span className="text-2xl font-bold text-purple-700 block mt-1">
              {dashboardSummary.overallPerformanceScore !== null
                ? `${dashboardSummary.overallPerformanceScore}%`
                : '—'}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Target compliance rate</span>
          </div>
        </div>
      </section>

      {/* 3. Target Compliance Breakdown Visualization (Section 7) */}
      <section aria-labelledby="compliance-heading" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h3 id="compliance-heading" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Target Compliance Distribution
          </h3>
          <span className="text-xs text-slate-500">
            {complianceBreakdown.total} evaluable metric(s) in current view
          </span>
        </div>

        {/* Visual Multi-segment Progress Bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex" role="progressbar" aria-label="Target compliance breakdown">
          <div
            style={{ width: `${complianceBreakdown.metPct}%` }}
            className="bg-emerald-500 transition-all duration-300"
            title={`Targets Met: ${complianceBreakdown.met} (${complianceBreakdown.metPct}%)`}
          />
          <div
            style={{ width: `${complianceBreakdown.missedPct}%` }}
            className="bg-rose-500 transition-all duration-300"
            title={`Targets Missed: ${complianceBreakdown.missed} (${complianceBreakdown.missedPct}%)`}
          />
          <div
            style={{ width: `${complianceBreakdown.unratedPct}%` }}
            className="bg-slate-300 transition-all duration-300"
            title={`Not Evaluated / No Target: ${complianceBreakdown.unrated} (${complianceBreakdown.unratedPct}%)`}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span className="font-semibold text-slate-800">Met:</span>
            <span className="text-slate-600">
              {complianceBreakdown.met} ({complianceBreakdown.metPct}%)
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span className="font-semibold text-slate-800">Missed:</span>
            <span className="text-slate-600">
              {complianceBreakdown.missed} ({complianceBreakdown.missedPct}%)
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />
            <span className="font-semibold text-slate-800">Not Evaluated:</span>
            <span className="text-slate-600">
              {complianceBreakdown.unrated} ({complianceBreakdown.unratedPct}%)
            </span>
          </div>
        </div>
      </section>

      {/* 4. Filters & Search Bar (Sections 5 & 6) */}
      <section aria-label="Table filters and search" className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none" role="tablist" aria-label="Filter by category">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Categories ({rawQuarterKPIs.length})
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72 shrink-0">
          <label htmlFor="kpi-search-input" className="sr-only">
            Search KPIs
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            id="kpi-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search KPIs..."
            className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* 5. Main KPI Performance Table (Section 4) */}
      <section aria-labelledby="table-heading" className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 id="table-heading" className="text-sm font-bold text-slate-900">
            Operational Metrics ({filteredKPIs.length})
          </h3>
          <span className="text-xs text-slate-500">
            Click any row to inspect historical trend and analysis notes
          </span>
        </div>

        {filteredKPIs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h4 className="font-semibold text-slate-800 text-sm">No KPIs Match Your Criteria</h4>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting the category filter or clearing the search query.
            </p>
            {(searchQuery || selectedCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none"
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th scope="col" className="py-3 px-4">KPI Name</th>
                  <th scope="col" className="py-3 px-3">Category</th>
                  <th scope="col" className="py-3 px-3 text-right">Current Value</th>
                  <th scope="col" className="py-3 px-3 text-right">Target</th>
                  <th scope="col" className="py-3 px-3 text-right">Previous Quarter</th>
                  <th scope="col" className="py-3 px-3 text-right">QoQ Change</th>
                  <th scope="col" className="py-3 px-3 text-center">Trend</th>
                  <th scope="col" className="py-3 px-3 text-center">Status</th>
                  <th scope="col" className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredKPIs.map((kpi) => {
                  const analysis = analysisMap.get(kpi.id);
                  const isInspected = inspectedKPIId === kpi.id;

                  // Formatting change
                  let qoqChangeText = '—';
                  let qoqColor = 'text-slate-500';

                  if (kpi.previousQuarterValue !== null && analysis && analysis.absoluteChange !== null) {
                    const diff = analysis.absoluteChange;
                    const isPositive = diff > 0;
                    const isZero = Math.abs(diff) < 1e-9;

                    if (isZero) {
                      qoqChangeText = '0.0 (Unchanged)';
                    } else if (kpi.unit === 'percentage') {
                      qoqChangeText = `${isPositive ? '+' : ''}${diff} pp`;
                    } else {
                      const pctPart =
                        analysis.percentageChange !== null
                          ? ` (${isPositive ? '+' : ''}${analysis.percentageChange}%)`
                          : '';
                      qoqChangeText = `${isPositive ? '+' : ''}${diff}${pctPart}`;
                    }

                    // Favorable vs unfavorable coloring
                    if (analysis.trendDirection === 'improving') {
                      qoqColor = 'text-emerald-700 font-medium';
                    } else if (analysis.trendDirection === 'degrading') {
                      qoqColor = 'text-rose-700 font-medium';
                    }
                  }

                  // Status badge helper
                  const renderStatusBadge = () => {
                    const status = analysis?.performanceStatus ?? 'unrated';
                    switch (status) {
                      case 'met':
                      case 'exceeded':
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            On Target
                          </span>
                        );
                      case 'underperforming':
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Warning
                          </span>
                        );
                      case 'critical':
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Critical
                          </span>
                        );
                      default:
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                            Unrated
                          </span>
                        );
                    }
                  };

                  // Trend icon helper
                  const renderTrendIcon = () => {
                    const trend = analysis?.trendDirection ?? 'inconclusive';
                    if (trend === 'improving') {
                      return (
                        <span className="inline-flex items-center text-emerald-600 font-medium space-x-1" title="Improving">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Improving</span>
                        </span>
                      );
                    }
                    if (trend === 'degrading') {
                      return (
                        <span className="inline-flex items-center text-rose-600 font-medium space-x-1" title="Degrading">
                          <TrendingDown className="w-3.5 h-3.5" />
                          <span>Declining</span>
                        </span>
                      );
                    }
                    if (trend === 'neutral') {
                      return (
                        <span className="inline-flex items-center text-slate-500 space-x-1" title="Stable">
                          <Minus className="w-3.5 h-3.5" />
                          <span>Stable</span>
                        </span>
                      );
                    }
                    return <span className="text-slate-400">Baseline</span>;
                  };

                  return (
                    <tr
                      key={kpi.id}
                      onClick={() => setInspectedKPIId(isInspected ? null : kpi.id)}
                      className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                        isInspected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div className="font-semibold text-slate-900">{kpi.name}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{kpi.description}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium border border-slate-200/60">
                          {CATEGORY_LABELS[kpi.category] || kpi.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-900">
                        {formatKPIValue(kpi.value, kpi.unit)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {formatKPIValue(kpi.target, kpi.unit)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-500">
                        {formatKPIValue(kpi.previousQuarterValue, kpi.unit)}
                      </td>
                      <td className={`py-3 px-3 text-right ${qoqColor}`}>
                        {qoqChangeText}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderTrendIcon()}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderStatusBadge()}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedKPIId(isInspected ? null : kpi.id);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 focus:outline-none"
                          aria-label={`Inspect detail for ${kpi.name}`}
                        >
                          <ChevronRight className={`w-4 h-4 transition-transform ${isInspected ? 'rotate-90 text-blue-600' : ''}`} />
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

      {/* 6. KPI Detail Panel (Section 10) */}
      {inspectedKPI && inspectedAnalysis && (
        <section
          aria-labelledby="detail-heading"
          className="bg-white border-2 border-blue-200 rounded-xl p-6 shadow-sm space-y-5 animate-in fade-in-50"
        >
          <div className="flex items-start justify-between pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600 mb-1">
                <Info className="w-3.5 h-3.5" />
                <span>INSPECTING METRIC DETAILS</span>
              </div>
              <h3 id="detail-heading" className="text-lg font-bold text-slate-900">
                {inspectedKPI.name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{inspectedKPI.description}</p>
            </div>
            <button
              type="button"
              onClick={() => setInspectedKPIId(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              aria-label="Close detail panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Metric Properties Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[11px]">Current Value</span>
              <span className="font-bold text-base text-slate-900 block mt-0.5">
                {formatKPIValue(inspectedKPI.value, inspectedKPI.unit)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[11px]">Agreed Target</span>
              <span className="font-bold text-base text-slate-900 block mt-0.5">
                {formatKPIValue(inspectedKPI.target, inspectedKPI.unit)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[11px]">Optimization Direction</span>
              <span className="font-semibold text-slate-800 block mt-0.5 capitalize">
                {inspectedKPI.direction.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[11px]">Performance Status</span>
              <span className="font-semibold text-slate-800 block mt-0.5 capitalize">
                {inspectedAnalysis.performanceStatus}
              </span>
            </div>
          </div>

          {/* Deterministic Analysis Notes */}
          <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-lg text-xs leading-relaxed text-slate-700">
            <strong className="text-blue-900 block mb-1">Deterministic Evaluation:</strong>
            {inspectedAnalysis.analysisNotes}
          </div>

          {/* Historical Multi-Quarter Trend Visualization (Section 9) */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Historical Trend Across Completed Quarters</span>
            </h4>

            {inspectedHistory.length === 0 ? (
              <p className="text-xs text-slate-500">No multi-quarter data points recorded.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {inspectedHistory.map((pt) => {
                  const isCurrent = pt.quarterId === selectedQuarter?.id;
                  return (
                    <div
                      key={pt.quarterId}
                      className={`p-3.5 rounded-lg border text-xs ${
                        isCurrent
                          ? 'bg-blue-50/80 border-blue-400 ring-1 ring-blue-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="font-semibold text-slate-700">{pt.quarterLabel}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-lg font-bold text-slate-900">
                        {formatKPIValue(pt.value, pt.unit)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Target: {formatKPIValue(pt.target, pt.unit)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default KPIAnalyticsDashboard;
