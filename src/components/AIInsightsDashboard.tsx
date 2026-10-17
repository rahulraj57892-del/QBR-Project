/**
 * @file src/components/AIInsightsDashboard.tsx
 * @description Professional, evidence-based executive insights dashboard for QBR Intelligence Studio.
 *
 * Visualizes:
 * - Quarterly Executive Summary derived deterministically from evaluated KPIs and anomalies.
 * - Scorecards for total insights, high-priority findings, operational risks, positive improvements, and recommendations.
 * - Multi-tiered Potential Business Impact assessment (Critical, High, Moderate, Low, Unknown).
 * - Actionable operational recommendations panel with service area alignment.
 * - Positive performance highlights respecting metric optimization directions.
 * - Filterable, searchable insight cards with traceable KPI/anomaly evidence inspection modal.
 * - Transparent explanation of confidence heuristics and data limitations.
 * - Strict customer and reporting period isolation without remote LLM API calls or data fabrication.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Search,
  X,
  Filter,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  HelpCircle,
  Database,
  ArrowRight,
  Info,
  SlidersHorizontal,
  FileText,
  Activity,
  Target,
  Clock,
  ShieldCheck,
  Check,
  RotateCcw,
} from 'lucide-react';
import type {
  Customer,
  ReportingQuarter,
  KPI,
  KPIAnalysis,
  Anomaly,
  AIInsight,
  InsightCategory,
  ConfidenceLevel,
} from '../types/qbr';
import {
  MOCK_CUSTOMERS,
  MOCK_REPORTING_QUARTERS,
  MOCK_KPIS,
} from '../data/mockData';
import {
  generateQBRInsights,
  generateKPIInsights,
  generateAnomalyInsights,
  generatePositiveInsights,
  generateExecutiveSummary,
  generateRecommendations,
  classifyBusinessImpact,
  calculateInsightConfidence,
  toConfidenceLevel,
  sortInsightsByPriority,
  getInsightsByCategory,
  getHighPriorityInsights,
  type QBRInsightInput,
  type BusinessImpactAssessment,
  type BusinessImpactLevel,
} from '../utils/qbrInsights';
import {
  analyzeKPIs,
  calculateAbsoluteChange,
  calculatePercentageChange,
  calculatePercentagePointChange,
  roundTo,
} from '../utils/kpiAnalytics';
import {
  detectAnomalies,
} from '../utils/anomalyDetection';

// ============================================================================
// Component Props & Contract
// ============================================================================

export interface AIInsightsDashboardProps {
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
  /** Indicates whether insight calculations are currently loading */
  isLoading?: boolean;
  /** Error message string to render in an alert banner */
  error?: string | null;
}

// ============================================================================
// Configuration & Human-Readable Labels
// ============================================================================

const CATEGORY_CONFIG: Record<
  InsightCategory,
  {
    label: string;
    description: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  operational_risk: {
    label: 'Operational Risk',
    description: 'Service degradation risks, capacity bottlenecks, and SLA breach warnings',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    border: 'border-rose-200',
    icon: AlertTriangle,
  },
  sla_achievement: {
    label: 'SLA Achievement',
    description: 'Contractual service level adherence, targets met, and recovery milestones',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  service_quality: {
    label: 'Service Quality',
    description: 'Platform stability, zero critical outage achievements, and quality metrics',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    border: 'border-blue-200',
    icon: ShieldCheck,
  },
  cost_optimization: {
    label: 'Cost Optimization',
    description: 'Resource efficiency, infrastructure headroom, and operational spend',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-700',
    border: 'border-teal-200',
    icon: Activity,
  },
  strategic_growth: {
    label: 'Strategic Growth',
    description: 'Quarter-on-quarter expansion, capacity readiness, and partnership scale',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    border: 'border-purple-200',
    icon: TrendingUp,
  },
  governance: {
    label: 'Governance & Data Quality',
    description: 'Data entry validation, metric boundary alerts, and reporting integrity',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    border: 'border-slate-200',
    icon: Database,
  },
};

const IMPACT_CONFIG: Record<
  BusinessImpactLevel,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    cardBorder: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
  }
> = {
  critical: {
    label: 'Critical Operational Risk',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    border: 'border-rose-200',
    cardBorder: 'border-rose-300 bg-rose-50/20',
    icon: AlertCircle,
    accentColor: 'text-rose-600',
  },
  high: {
    label: 'High Operational Strain',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    border: 'border-orange-200',
    cardBorder: 'border-orange-300 bg-orange-50/20',
    icon: AlertTriangle,
    accentColor: 'text-orange-600',
  },
  moderate: {
    label: 'Moderate Operational Risk',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    border: 'border-amber-200',
    cardBorder: 'border-amber-300 bg-amber-50/20',
    icon: ShieldAlert,
    accentColor: 'text-amber-600',
  },
  low: {
    label: 'Stable Performance Profile',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    border: 'border-emerald-200',
    cardBorder: 'border-emerald-300 bg-emerald-50/20',
    icon: CheckCircle2,
    accentColor: 'text-emerald-600',
  },
  unknown: {
    label: 'Unassessed / Insufficient Data',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    border: 'border-slate-200',
    cardBorder: 'border-slate-300 bg-slate-50',
    icon: HelpCircle,
    accentColor: 'text-slate-600',
  },
};

const CONFIDENCE_CONFIG: Record<
  ConfidenceLevel,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    completeness: string;
  }
> = {
  high: {
    label: 'High Confidence',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    border: 'border-blue-200',
    completeness: 'Complete baseline, agreed target, and verified history',
  },
  medium: {
    label: 'Medium Confidence',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    border: 'border-amber-200',
    completeness: 'Target benchmark available; partial historical baseline',
  },
  low: {
    label: 'Low Confidence',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-600',
    border: 'border-slate-200',
    completeness: 'Limited historical comparisons or unbenchmarked metric',
  },
};

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatKPIValueSafe(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }
  const cleanUnit = unit.toLowerCase();
  if (cleanUnit === 'percentage' || cleanUnit === '%') {
    return `${value.toFixed(2)}%`;
  }
  if (cleanUnit === 'milliseconds' || cleanUnit === 'ms') {
    return `${Math.round(value)} ms`;
  }
  if (cleanUnit === 'seconds' || cleanUnit === 's') {
    return `${value.toFixed(1)} s`;
  }
  if (cleanUnit === 'minutes' || cleanUnit === 'min') {
    return `${value.toFixed(1)} min`;
  }
  if (cleanUnit === 'hours' || cleanUnit === 'hrs') {
    return `${value.toFixed(1)} hrs`;
  }
  if (cleanUnit === 'currency' || cleanUnit === 'inr') {
    return `₹${value.toLocaleString('en-IN')}`;
  }
  return `${value.toLocaleString('en-IN')} ${unit.replace(/_/g, ' ')}`;
}

// ============================================================================
// Main Component Implementation
// ============================================================================

export function AIInsightsDashboard({
  customers: customersProp,
  reportingQuarters: quartersProp,
  kpis: kpisProp,
  selectedCustomerId: controlledCustomerId,
  selectedQuarterId: controlledQuarterId,
  onCustomerChange,
  onQuarterChange,
  isLoading = false,
  error = null,
}: AIInsightsDashboardProps) {
  // Resolve data sources: respect explicitly supplied empty arrays vs omitted props
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

  // Filtering & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'risks' | 'improvements' | 'recommendations'>('all');

  // Inspected insight for detail modal
  const [inspectedInsightId, setInspectedInsightId] = useState<string | null>(null);

  // Effective customer ID
  const effectiveCustomerId =
    controlledCustomerId !== undefined ? controlledCustomerId : internalCustomerId;

  // Selected customer object
  const selectedCustomer = useMemo(
    () => allCustomers.find((c) => c.id === effectiveCustomerId) || null,
    [allCustomers, effectiveCustomerId]
  );

  // Quarters for the active customer, chronologically ordered
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
    // Default to latest quarter for active customer
    return customerQuarters[customerQuarters.length - 1]?.id || '';
  }, [controlledQuarterId, internalQuarterId, customerQuarters]);

  // Selected quarter object
  const selectedQuarter = useMemo(
    () => customerQuarters.find((q) => q.id === effectiveQuarterId) || null,
    [customerQuarters, effectiveQuarterId]
  );

  // Verify that the selected quarter belongs to the selected customer
  const isQuarterValid = useMemo(() => {
    if (!effectiveQuarterId || !effectiveCustomerId) return false;
    return customerQuarters.some((q) => q.id === effectiveQuarterId);
  }, [customerQuarters, effectiveQuarterId, effectiveCustomerId]);

  // Filter raw KPI records strictly scoped to the active customer and quarter
  const rawQuarterKPIs = useMemo(() => {
    if (!isQuarterValid || !effectiveCustomerId || !effectiveQuarterId) {
      return [];
    }
    return allKPIs.filter(
      (k) => k.customerId === effectiveCustomerId && k.quarterId === effectiveQuarterId
    );
  }, [allKPIs, effectiveCustomerId, effectiveQuarterId, isQuarterValid]);

  // KPI analyses using deterministic analytics engine
  const kpiAnalyses = useMemo(() => {
    if (rawQuarterKPIs.length === 0) return [];
    return analyzeKPIs(rawQuarterKPIs);
  }, [rawQuarterKPIs]);

  // Detected anomalies using deterministic anomaly detection engine
  const detectedAnomalies = useMemo(() => {
    if (rawQuarterKPIs.length === 0) return [];
    return detectAnomalies(rawQuarterKPIs);
  }, [rawQuarterKPIs]);

  // Look-up map of KPIs by ID
  const kpiMap = useMemo(() => {
    const map = new Map<string, KPI>();
    for (const kpi of rawQuarterKPIs) {
      map.set(kpi.id, kpi);
    }
    return map;
  }, [rawQuarterKPIs]);

  // Look-up map of analyses by KPI ID
  const analysisMap = useMemo(() => {
    const map = new Map<string, KPIAnalysis>();
    for (const analysis of kpiAnalyses) {
      map.set(analysis.kpiId, analysis);
    }
    return map;
  }, [kpiAnalyses]);

  // Structured input object for QBR insights engine
  const insightInput: QBRInsightInput = useMemo(() => {
    return {
      customerId: effectiveCustomerId,
      quarterId: effectiveQuarterId,
      kpis: rawQuarterKPIs,
      kpiAnalyses,
      anomalies: detectedAnomalies,
      reportingQuarter: selectedQuarter ?? undefined,
      customerName: selectedCustomer?.name,
    };
  }, [
    effectiveCustomerId,
    effectiveQuarterId,
    rawQuarterKPIs,
    kpiAnalyses,
    detectedAnomalies,
    selectedQuarter,
    selectedCustomer,
  ]);

  // 1. Generate all structured QBR insights
  const allInsights: AIInsight[] = useMemo(() => {
    if (!isQuarterValid || rawQuarterKPIs.length === 0) {
      return [];
    }
    return generateQBRInsights(insightInput);
  }, [isQuarterValid, rawQuarterKPIs, insightInput]);

  // 2. High priority insights (operational risk & SLA achievement with high/medium confidence)
  const highPriorityInsights: AIInsight[] = useMemo(() => {
    return getHighPriorityInsights(allInsights);
  }, [allInsights]);

  // Set of high priority insight IDs for fast lookup
  const highPriorityIds = useMemo(() => {
    return new Set(highPriorityInsights.map((i) => i.id));
  }, [highPriorityInsights]);

  // 3. Positive performance improvements
  const positiveInsights: AIInsight[] = useMemo(() => {
    if (!isQuarterValid || rawQuarterKPIs.length === 0) {
      return [];
    }
    return generatePositiveInsights(insightInput);
  }, [isQuarterValid, rawQuarterKPIs, insightInput]);

  // 4. Actionable operational recommendations
  const allRecommendations: string[] = useMemo(() => {
    if (!isQuarterValid || rawQuarterKPIs.length === 0) {
      return [];
    }
    return generateRecommendations(insightInput);
  }, [isQuarterValid, rawQuarterKPIs, insightInput]);

  // 5. Quarterly executive summary
  const executiveSummary: string = useMemo(() => {
    if (!isQuarterValid || rawQuarterKPIs.length === 0) {
      return '';
    }
    return generateExecutiveSummary(insightInput);
  }, [isQuarterValid, rawQuarterKPIs, insightInput]);

  // 6. Business operational risk impact assessment
  const businessImpact: BusinessImpactAssessment = useMemo(() => {
    if (!isQuarterValid || rawQuarterKPIs.length === 0) {
      return {
        level: 'unknown',
        primaryDrivers: [],
        riskSummary: 'Insufficient metric data to assess business impact.',
      };
    }
    return classifyBusinessImpact(insightInput);
  }, [isQuarterValid, rawQuarterKPIs, insightInput]);

  // Selection handlers
  const handleCustomerSelect = useCallback(
    (newCustomerId: string) => {
      if (onCustomerChange) {
        onCustomerChange(newCustomerId);
      } else {
        setInternalCustomerId(newCustomerId);
        const matchingQuarters = allQuarters.filter((q) => q.customerId === newCustomerId);
        if (matchingQuarters.length > 0) {
          const sorted = [...matchingQuarters].sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.quarter.localeCompare(b.quarter);
          });
          const newest = sorted[sorted.length - 1];
          setInternalQuarterId(newest.id);
        } else {
          setInternalQuarterId('');
        }
      }
      setInspectedInsightId(null);
    },
    [allQuarters, onCustomerChange]
  );

  const handleQuarterSelect = useCallback(
    (newQuarterId: string) => {
      if (onQuarterChange) {
        onQuarterChange(newQuarterId);
      } else {
        setInternalQuarterId(newQuarterId);
      }
      setInspectedInsightId(null);
    },
    [onQuarterChange]
  );

  // Reset filters
  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedPriority('all');
    setActiveTab('all');
  }, []);

  // Filtered insights based on search query, category, priority, and active tab
  const filteredInsights = useMemo(() => {
    let list = [...allInsights];

    // Filter by active tab
    if (activeTab === 'risks') {
      list = list.filter((i) => i.category === 'operational_risk');
    } else if (activeTab === 'improvements') {
      list = list.filter(
        (i) => i.category === 'sla_achievement' || i.category === 'service_quality' || i.category === 'strategic_growth'
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      list = list.filter((i) => i.category === selectedCategory);
    }

    // Filter by priority
    if (selectedPriority === 'high') {
      list = list.filter((i) => highPriorityIds.has(i.id));
    } else if (selectedPriority === 'standard') {
      list = list.filter((i) => !highPriorityIds.has(i.id));
    }

    // Filter by search query
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((item) => {
        const titleMatch = item.title.toLowerCase().includes(query);
        const summaryMatch = item.summary.toLowerCase().includes(query);
        const recommendationMatch = item.recommendation.toLowerCase().includes(query);
        const businessImpactMatch = item.businessImpact.toLowerCase().includes(query);
        const categoryLabel = CATEGORY_CONFIG[item.category]?.label.toLowerCase() || '';
        const categoryMatch = categoryLabel.includes(query) || item.category.toLowerCase().includes(query);
        return titleMatch || summaryMatch || recommendationMatch || businessImpactMatch || categoryMatch;
      });
    }

    return list;
  }, [allInsights, activeTab, selectedCategory, selectedPriority, highPriorityIds, searchQuery]);

  // Inspected insight object
  const inspectedInsight = useMemo(() => {
    if (!inspectedInsightId) return null;
    return allInsights.find((i) => i.id === inspectedInsightId) || null;
  }, [allInsights, inspectedInsightId]);

  // Trace supporting KPI and Anomaly evidence for the inspected insight
  const inspectedEvidence = useMemo(() => {
    if (!inspectedInsight) return null;

    // Check if insight ID embeds a specific KPI ID
    let matchingKPI: KPI | null = null;
    for (const kpi of rawQuarterKPIs) {
      if (inspectedInsight.id.includes(kpi.id)) {
        matchingKPI = kpi;
        break;
      }
    }

    // If not found in ID, search by title keywords
    if (!matchingKPI) {
      const lowerTitle = inspectedInsight.title.toLowerCase();
      matchingKPI =
        rawQuarterKPIs.find((k) => lowerTitle.includes(k.name.toLowerCase())) || null;
    }

    const matchingAnalysis = matchingKPI ? analysisMap.get(matchingKPI.id) || null : null;
    const matchingAnomalies = matchingKPI
      ? detectedAnomalies.filter((a) => a.kpiId === matchingKPI.id)
      : [];

    // Check for multi-metric observation (e.g. cross-kpi-operational-strain)
    const isCrossKPI = inspectedInsight.id.includes('cross-kpi-operational-strain');
    const crossKPIs = isCrossKPI
      ? rawQuarterKPIs.filter((k) => {
          const name = k.name.toLowerCase();
          return name.includes('sla') || name.includes('incident') || name.includes('resolve') || name.includes('mttr');
        })
      : [];

    return {
      kpi: matchingKPI,
      analysis: matchingAnalysis,
      anomalies: matchingAnomalies,
      isCrossKPI,
      crossKPIs,
    };
  }, [inspectedInsight, rawQuarterKPIs, analysisMap, detectedAnomalies]);

  // Handle keyboard Escape to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inspectedInsightId) {
        setInspectedInsightId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectedInsightId]);

  // Unique categories in the current customer/quarter dataset
  const presentCategories = useMemo(() => {
    const set = new Set<InsightCategory>();
    for (const insight of allInsights) {
      set.add(insight.category);
    }
    return Array.from(set);
  }, [allInsights]);

  // Derived counts
  const operationalRiskCount = useMemo(() => {
    return allInsights.filter((i) => i.category === 'operational_risk').length;
  }, [allInsights]);

  // ==========================================================================
  // Render: Loading State
  // ==========================================================================
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading AI Insights">
        <div className="h-16 bg-slate-200 rounded-xl" />
        <div className="h-32 bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="h-24 bg-slate-200 rounded-xl" />
          <div className="h-24 bg-slate-200 rounded-xl" />
          <div className="h-24 bg-slate-200 rounded-xl" />
          <div className="h-24 bg-slate-200 rounded-xl" />
          <div className="h-24 bg-slate-200 rounded-xl" />
        </div>
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  // ==========================================================================
  // Render: Error Banner
  // ==========================================================================
  const renderErrorBanner = error && (
    <div
      role="alert"
      className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start space-x-3 mb-6"
    >
      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
      <div>
        <h4 className="font-semibold text-sm">Failed to evaluate intelligence insights</h4>
        <p className="text-xs text-rose-700 mt-0.5">{error}</p>
      </div>
    </div>
  );

  // ==========================================================================
  // Render: No Customers or Quarters Available
  // ==========================================================================
  if (allCustomers.length === 0) {
    return (
      <div className="space-y-6">
        {renderErrorBanner}
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">No Customers Available</h3>
          <p className="text-sm text-slate-600 mb-4">
            Please import or select a customer account to evaluate operational insights.
          </p>
        </div>
      </div>
    );
  }

  if (allQuarters.length === 0) {
    return (
      <div className="space-y-6">
        {renderErrorBanner}
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">No Reporting Quarters Configured</h3>
          <p className="text-sm text-slate-600 mb-4">
            No active reporting cycles are available. Set up a quarterly reporting window to generate executive insights.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: Invalid Customer / Quarter Combination
  // ==========================================================================
  if (!isQuarterValid && selectedCustomer) {
    return (
      <div className="space-y-6">
        {renderErrorBanner}
        {/* Scoped Selector Bar */}
        <header className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">AI Executive Insights</h1>
              <p className="text-xs text-slate-500">
                Evidence-grounded operational findings and recommendations
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <label htmlFor="customer-select-invalid" className="text-xs font-medium text-slate-600">
                Customer:
              </label>
              <select
                id="customer-select-invalid"
                value={effectiveCustomerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <div className="bg-white rounded-xl border border-amber-200 p-12 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Mismatched Reporting Quarter</h3>
          <p className="text-sm text-slate-600 mb-6">
            The selected reporting quarter does not belong to{' '}
            <strong className="text-slate-800">{selectedCustomer.name}</strong>. Please select a valid reporting quarter.
          </p>
          {customerQuarters.length > 0 && (
            <button
              type="button"
              onClick={() => handleQuarterSelect(customerQuarters[customerQuarters.length - 1].id)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <span>Switch to {customerQuarters[customerQuarters.length - 1].quarter} {customerQuarters[customerQuarters.length - 1].year}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: Main Dashboard View
  // ==========================================================================
  const impactStyle = IMPACT_CONFIG[businessImpact.level];
  const ImpactIcon = impactStyle.icon;

  return (
    <div className="space-y-6">
      {renderErrorBanner}

      {/* 1. Header & Scoped Selector Bar */}
      <header className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-slate-900">AI Executive Insights</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Evidence-Grounded
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Synthesized operational risks, positive trends, and actionable recommendations
            </p>
          </div>
        </div>

        {/* Customer & Quarter Context Pickers */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <label htmlFor="insights-customer-select" className="text-xs font-medium text-slate-600 sr-only">
              Select Customer
            </label>
            <select
              id="insights-customer-select"
              value={effectiveCustomerId}
              onChange={(e) => handleCustomerSelect(e.target.value)}
              className="text-xs font-semibold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
            >
              {allCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.industry})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <label htmlFor="insights-quarter-select" className="text-xs font-medium text-slate-600 sr-only">
              Select Reporting Quarter
            </label>
            <select
              id="insights-quarter-select"
              value={effectiveQuarterId}
              onChange={(e) => handleQuarterSelect(e.target.value)}
              className="text-xs font-semibold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
            >
              {customerQuarters.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.quarter} {q.year} ({q.status})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* 2. Quarterly Executive Summary Panel */}
      <section aria-labelledby="executive-summary-heading" className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 id="executive-summary-heading" className="text-base font-bold text-slate-900">
                Quarterly Executive Summary
              </h2>
              <p className="text-xs text-slate-500">
                Deterministic synthesis of {selectedCustomer?.name || 'Customer'} • {selectedQuarter?.quarter} {selectedQuarter?.year}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Evaluation Evidence:</span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {rawQuarterKPIs.length} Metrics Evaluated
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {detectedAnomalies.length} Variances
            </span>
          </div>
        </div>

        {executiveSummary ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 font-normal">
              {executiveSummary}
            </p>

            {/* Quick Context Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="bg-rose-50/50 border border-rose-100 rounded-lg p-3">
                <div className="flex items-center space-x-2 text-rose-700 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Operational Risks</span>
                </div>
                <p className="text-xs text-slate-600">
                  {operationalRiskCount > 0
                    ? `${operationalRiskCount} risk finding(s) detected across SLA adherence and incident flows.`
                    : 'No severe operational risks flagged in this period.'}
                </p>
              </div>

              <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3">
                <div className="flex items-center space-x-2 text-emerald-700 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Major Improvements</span>
                </div>
                <p className="text-xs text-slate-600">
                  {positiveInsights.length > 0
                    ? `${positiveInsights.length} confirmed achievement(s) and recovery milestones verified.`
                    : 'Performance remained within normal baseline bounds.'}
                </p>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                <div className="flex items-center space-x-2 text-blue-700 mb-1">
                  <Target className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Priority Actions</span>
                </div>
                <p className="text-xs text-slate-600">
                  {allRecommendations.length > 0
                    ? `${allRecommendations.length} targeted recommendation(s) formulated for delivery governance.`
                    : 'Standard operational monitoring cadences maintained.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500">
              Insufficient KPI data recorded for {selectedCustomer?.name || 'this customer'} in{' '}
              {selectedQuarter?.quarter} {selectedQuarter?.year} to compile an executive summary.
            </p>
          </div>
        )}
      </section>

      {/* 3. Executive Scorecards */}
      <section aria-labelledby="insights-metrics-heading">
        <h2 id="insights-metrics-heading" className="sr-only">
          Insight Metric Scorecards
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Insights */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Insights</span>
              <Sparkles className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{allInsights.length}</div>
            <p className="text-xs text-slate-500 mt-1">Generated findings</p>
          </div>

          {/* Card 2: High-Priority Insights */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">High Priority</span>
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-orange-700">{highPriorityInsights.length}</div>
            <p className="text-xs text-slate-500 mt-1">SLA & operational risks</p>
          </div>

          {/* Card 3: Operational Risks */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Operational Risks</span>
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-rose-700">{operationalRiskCount}</div>
            <p className="text-xs text-slate-500 mt-1">Breaches & deviations</p>
          </div>

          {/* Card 4: Positive Improvements */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Improvements</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-700">{positiveInsights.length}</div>
            <p className="text-xs text-slate-500 mt-1">Verified positive trends</p>
          </div>

          {/* Card 5: Recommendations */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Actions</span>
              <Target className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-700">{allRecommendations.length}</div>
            <p className="text-xs text-slate-500 mt-1">Actionable recommendations</p>
          </div>
        </div>
      </section>

      {/* 4. Potential Business Impact Panel */}
      <section
        aria-labelledby="business-impact-heading"
        className={`border rounded-xl p-5 shadow-xs transition-colors ${impactStyle.cardBorder}`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className={`w-10 h-10 rounded-xl ${impactStyle.badgeBg} ${impactStyle.accentColor} flex items-center justify-center shrink-0 border ${impactStyle.border}`}>
              <ImpactIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 id="business-impact-heading" className="text-sm font-bold text-slate-900">
                  Potential Business Impact
                </h2>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${impactStyle.badgeBg} ${impactStyle.badgeText} border ${impactStyle.border}`}>
                  {impactStyle.label}
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed max-w-3xl">
                {businessImpact.riskSummary}
              </p>
            </div>
          </div>

          {/* Disclaimer badge */}
          <div className="shrink-0 bg-white/80 border border-slate-200 rounded-lg p-2.5 max-w-xs text-left">
            <div className="flex items-center space-x-1.5 text-slate-500 mb-1">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Evaluation Model
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              Classified deterministically from metric thresholds and anomaly counts. Represents potential operational risk, not confirmed financial loss.
            </p>
          </div>
        </div>

        {/* Primary drivers if present */}
        {businessImpact.primaryDrivers.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Primary Impact Drivers:</span>
            {businessImpact.primaryDrivers.map((driver, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white text-slate-700 border border-slate-200 shadow-2xs"
              >
                • {driver}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 5. Quick Navigation Tabs: All, Operational Risks, Improvements, Recommendations */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="inline-flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Insights ({allInsights.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('risks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'risks'
                ? 'bg-white text-rose-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Operational Risks ({operationalRiskCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('improvements')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'improvements'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Achievements & Trends ({positiveInsights.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('recommendations')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'recommendations'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Actionable Guidance ({allRecommendations.length})
          </button>
        </div>

        {/* Confidence scale explanation tooltip */}
        <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>Confidence reflects evidence completeness, not statistical probability.</span>
        </div>
      </div>

      {/* When active tab is recommendations, show dedicated recommendations view */}
      {activeTab === 'recommendations' ? (
        <section aria-labelledby="recommendations-heading" className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 id="recommendations-heading" className="text-base font-bold text-slate-900">
                Actionable Operational Recommendations
              </h2>
              <p className="text-xs text-slate-500">
                Deduplicated corrective and preventive actions formulated from quarterly KPI performance
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {allRecommendations.length} Action Items
            </span>
          </div>

          {allRecommendations.length > 0 ? (
            <div className="space-y-3">
              {allRecommendations.map((action, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-slate-50/70 hover:bg-slate-50 border border-slate-200 rounded-xl flex items-start space-x-3.5 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 leading-relaxed">{action}</p>
                    <div className="flex items-center space-x-3 mt-2 text-[11px] text-slate-500">
                      <span className="inline-flex items-center space-x-1 text-slate-600">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Recommended Next Step</span>
                      </span>
                      <span>•</span>
                      <span>Requires SDM review prior to customer distribution</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-sm text-slate-500">No operational actions currently required.</p>
            </div>
          )}

          <div className="mt-5 p-3.5 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-800 flex items-start space-x-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              <strong>Governance note:</strong> Recommendations are advisory insights generated from benchmark variances. They have not been executed automatically and do not create ITIL tickets without explicit service delivery approval.
            </p>
          </div>
        </section>
      ) : (
        <>
          {/* 6. Filter & Search Controls */}
          <section aria-labelledby="insights-filter-heading" className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <h2 id="insights-filter-heading" className="sr-only">
              Insight Filters and Search
            </h2>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search insights and recommendations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search query"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="flex items-center space-x-2">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <label htmlFor="insight-category-filter" className="text-xs font-medium text-slate-600 shrink-0">
                  Category:
                </label>
                <select
                  id="insight-category-filter"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Categories ({allInsights.length})</option>
                  {presentCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_CONFIG[cat]?.label || cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center space-x-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <label htmlFor="insight-priority-filter" className="text-xs font-medium text-slate-600 shrink-0">
                  Priority:
                </label>
                <select
                  id="insight-priority-filter"
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Priorities</option>
                  <option value="high">High Priority ({highPriorityInsights.length})</option>
                  <option value="standard">Standard Priority</option>
                </select>
              </div>

              {/* Reset button if filters active */}
              {(searchQuery || selectedCategory !== 'all' || selectedPriority !== 'all' || activeTab !== 'all') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </section>

          {/* 7. Insight Cards Grid */}
          <section aria-labelledby="insights-list-heading" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="insights-list-heading" className="text-sm font-bold text-slate-900">
                Quarterly Operational Findings
              </h2>
              <span className="text-xs text-slate-500">
                Showing {filteredInsights.length} of {allInsights.length} insights
              </span>
            </div>

            {filteredInsights.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredInsights.map((insight) => {
                  const catConfig = CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.operational_risk;
                  const CategoryIcon = catConfig.icon;
                  const confConfig = CONFIDENCE_CONFIG[insight.confidenceLevel] || CONFIDENCE_CONFIG.medium;
                  const isHighPriority = highPriorityIds.has(insight.id);

                  return (
                    <article
                      key={insight.id}
                      className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-5 shadow-xs transition-all flex flex-col justify-between group"
                    >
                      <div>
                        {/* Badges: Category & Priority */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${catConfig.badgeBg} ${catConfig.badgeText} border ${catConfig.border}`}
                          >
                            <CategoryIcon className="w-3.5 h-3.5 mr-1" />
                            {catConfig.label}
                          </span>

                          <div className="flex items-center space-x-2">
                            {isHighPriority && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200">
                                High Priority
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${confConfig.badgeBg} ${confConfig.badgeText} border ${confConfig.border}`}
                              title={confConfig.completeness}
                            >
                              {confConfig.label}
                            </span>
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors mb-2 leading-snug">
                          {insight.title}
                        </h3>

                        {/* Summary */}
                        <p className="text-xs text-slate-600 leading-relaxed mb-4">
                          {insight.summary}
                        </p>

                        {/* Potential Business Impact Snippet */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 mb-3">
                          <div className="flex items-center space-x-1.5 text-slate-700 mb-1">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              Potential Impact
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-normal">
                            {insight.businessImpact}
                          </p>
                        </div>

                        {/* Recommendation Snippet */}
                        <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 mb-4">
                          <div className="flex items-center space-x-1.5 text-blue-800 mb-1">
                            <Target className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              Suggested Action
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 leading-normal">
                            {insight.recommendation}
                          </p>
                        </div>
                      </div>

                      {/* Card Footer: Detail / Evidence Action */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {insight.id.split('-').slice(-2).join('-')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInspectedInsightId(insight.id)}
                          className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 group/btn focus:outline-none focus:underline"
                        >
                          <span>Inspect Evidence</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">No Matching Insights Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                  No operational findings match your current search query or active filter settings.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center space-x-2 px-3.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Filters</span>
                </button>
              </div>
            )}
          </section>

          {/* 8. Positive Improvements Dedicated Section */}
          {positiveInsights.length > 0 && activeTab === 'all' && (
            <section aria-labelledby="positive-achievements-heading" className="bg-emerald-50/30 border border-emerald-200/80 rounded-xl p-6 shadow-xs">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="positive-achievements-heading" className="text-base font-bold text-slate-900">
                    Positive Performance Highlights
                  </h2>
                  <p className="text-xs text-emerald-800">
                    Verified quarter-on-quarter recovery milestones and SLA improvements satisfying contractual targets
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {positiveInsights.map((pi) => (
                  <div
                    key={pi.id}
                    className="p-4 bg-white border border-emerald-100 rounded-xl shadow-2xs hover:border-emerald-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-800">{pi.title}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Achievement
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed mb-2">{pi.summary}</p>
                    <p className="text-[11px] text-emerald-700 font-medium">✓ {pi.businessImpact}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* 9. Data Quality, Methodology & Limitations */}
      <section aria-labelledby="methodology-heading" className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
          <div className="space-y-1.5 text-xs text-slate-600">
            <h3 id="methodology-heading" className="font-bold text-slate-900 text-sm">
              How these insights are generated
            </h3>
            <ul className="list-disc pl-4 space-y-1 leading-relaxed">
              <li>
                <strong>Deterministic Business Rules:</strong> Insights are compiled directly from deterministic evaluation of KPI target compliance, quarter-on-quarter deltas, and detected anomaly events.
              </li>
              <li>
                <strong>Evidence-Grounded Findings:</strong> Findings originate solely from verified metric records. No unverified root causes, fictitious dollar amounts, or speculative customer escalations are introduced.
              </li>
              <li>
                <strong>Potential Risk Estimates:</strong> Business impact levels represent calculated operational strain and SLA vulnerability, not certified financial losses.
              </li>
              <li>
                <strong>Human Governance Recommended:</strong> Review by the Account Delivery Manager is recommended before including findings in client-facing executive presentations.
              </li>
              <li>
                <strong>Future Generative Narration:</strong> Natural-language executive narrative generation powered by Gemini models is planned for a subsequent release.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 10. Inspected Insight Detail & Evidence Modal */}
      {inspectedInsight && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-insight-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
          onClick={() => setInspectedInsightId(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full p-6 space-y-5 text-left animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1 pr-6">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${
                      CATEGORY_CONFIG[inspectedInsight.category]?.badgeBg || 'bg-slate-100'
                    } ${CATEGORY_CONFIG[inspectedInsight.category]?.badgeText || 'text-slate-700'} border ${
                      CATEGORY_CONFIG[inspectedInsight.category]?.border || 'border-slate-200'
                    }`}
                  >
                    {CATEGORY_CONFIG[inspectedInsight.category]?.label || inspectedInsight.category}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                      CONFIDENCE_CONFIG[inspectedInsight.confidenceLevel]?.badgeBg
                    } ${CONFIDENCE_CONFIG[inspectedInsight.confidenceLevel]?.badgeText} border ${
                      CONFIDENCE_CONFIG[inspectedInsight.confidenceLevel]?.border
                    }`}
                  >
                    {CONFIDENCE_CONFIG[inspectedInsight.confidenceLevel]?.label}
                  </span>
                </div>
                <h3 id="modal-insight-title" className="text-lg font-bold text-slate-900 leading-snug">
                  {inspectedInsight.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setInspectedInsightId(null)}
                aria-label="Close insight detail dialog"
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Insight Summary */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Synthesized Operational Finding
                </h4>
                <p className="text-sm text-slate-800 leading-relaxed bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
                  {inspectedInsight.summary}
                </p>
              </div>

              {/* Potential Business Impact */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Potential Business Impact
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-amber-50/50 border border-amber-200/70 rounded-xl p-3.5">
                  {inspectedInsight.businessImpact}
                </p>
              </div>

              {/* Actionable Recommendation */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Actionable Operational Recommendation
                </h4>
                <p className="text-xs text-blue-900 leading-relaxed bg-blue-50/50 border border-blue-200/70 rounded-xl p-3.5">
                  {inspectedInsight.recommendation}
                </p>
              </div>

              {/* Traceable Evidence Inspection */}
              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center space-x-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-600" />
                  <span>Traceable Metric Evidence</span>
                </h4>

                {inspectedEvidence?.kpi ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                      <div>
                        <span className="text-sm font-bold text-slate-900">{inspectedEvidence.kpi.name}</span>
                        <span className="text-xs text-slate-500 block">
                          Category: {inspectedEvidence.kpi.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          inspectedEvidence.analysis?.targetMet
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {inspectedEvidence.analysis?.targetMet ? 'Target Satisfied' : 'Target Breached'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="text-[11px] text-slate-400 block">Recorded Value</span>
                        <strong className="text-slate-900">
                          {formatKPIValueSafe(inspectedEvidence.kpi.value, inspectedEvidence.kpi.unit)}
                        </strong>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="text-[11px] text-slate-400 block">Target Threshold</span>
                        <strong className="text-slate-900">
                          {formatKPIValueSafe(inspectedEvidence.kpi.target, inspectedEvidence.kpi.unit)}
                        </strong>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="text-[11px] text-slate-400 block">Prior Quarter</span>
                        <strong className="text-slate-900">
                          {formatKPIValueSafe(inspectedEvidence.kpi.previousQuarterValue, inspectedEvidence.kpi.unit)}
                        </strong>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="text-[11px] text-slate-400 block">Quarterly Delta</span>
                        <strong
                          className={
                            inspectedEvidence.analysis?.trendDirection === 'improving'
                              ? 'text-emerald-600'
                              : inspectedEvidence.analysis?.trendDirection === 'degrading'
                              ? 'text-rose-600'
                              : 'text-slate-700'
                          }
                        >
                          {inspectedEvidence.analysis?.absoluteChange !== null && inspectedEvidence.analysis?.absoluteChange !== undefined
                            ? `${inspectedEvidence.analysis.absoluteChange > 0 ? '+' : ''}${inspectedEvidence.analysis.absoluteChange}`
                            : 'Baseline N/A'}
                        </strong>
                      </div>
                    </div>

                    {/* Associated Detected Anomalies */}
                    {inspectedEvidence.anomalies.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200/60">
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                          Correlated Anomaly Flags ({inspectedEvidence.anomalies.length}):
                        </span>
                        <div className="space-y-1">
                          {inspectedEvidence.anomalies.map((anom) => (
                            <div
                              key={anom.id}
                              className="text-xs text-rose-700 bg-rose-50/70 border border-rose-100 rounded px-2.5 py-1.5 flex items-center justify-between"
                            >
                              <span>• {anom.description}</span>
                              <span className="font-bold uppercase text-[10px] ml-2">
                                {anom.severity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : inspectedEvidence?.isCrossKPI ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs text-slate-600">
                      Multi-metric correlation observation spanning interrelated operational streams:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      {inspectedEvidence.crossKPIs.map((kpi) => (
                        <div key={kpi.id} className="bg-white p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-semibold text-slate-700 block truncate">
                            {kpi.name}
                          </span>
                          <span className="text-xs text-slate-900 block mt-0.5">
                            {formatKPIValueSafe(kpi.value, kpi.unit)} (Target: {formatKPIValueSafe(kpi.target, kpi.unit)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-slate-500">
                      Detailed evidence references are not available for this insight.
                    </p>
                  </div>
                )}
              </div>

              {/* Confidence Score Explanation */}
              <div className="bg-slate-100/70 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700 block mb-0.5">Confidence Evaluation Model:</span>
                <p>
                  Confidence reflects the completeness and consistency of supporting data. It is not a statistically calibrated probability. Current level:{' '}
                  <strong className="text-slate-800">
                    {CONFIDENCE_CONFIG[inspectedInsight.confidenceLevel]?.label}
                  </strong>{' '}
                  ({CONFIDENCE_CONFIG[inspectedInsight.confidenceLevel]?.completeness}).
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setInspectedInsightId(null)}
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

export default AIInsightsDashboard;
