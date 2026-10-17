/**
 * @file src/components/CustomerDashboard.tsx
 * @description Enterprise customer discovery, portfolio management, and KPI dataset overview component.
 *
 * Supports:
 * - Search by customer name and industry with instant filtering and clear action.
 * - Customer selection with controlled and uncontrolled state management.
 * - Chronologically sorted reporting-quarter selection (newest first).
 * - KPI dataset availability audit (targets configured, historical baseline availability).
 * - Action callbacks for downstream analytics exploration and QBR report generation.
 * - Loading, error, and empty search result states.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Building2,
  Users,
  Calendar,
  BarChart2,
  FileText,
  X,
  Layers,
  ArrowRight,
  Shield,
  Clock,
  Briefcase,
  AlertCircle,
  Database,
} from 'lucide-react';
import type { Customer, ReportingQuarter, KPI } from '../types/qbr';
import {
  MOCK_CUSTOMERS,
  MOCK_REPORTING_QUARTERS,
  MOCK_KPIS,
} from '../data/mockData';

// ============================================================================
// Props & Types
// ============================================================================

export interface CustomerDashboardProps {
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
  /** Callback fired when a customer card is selected */
  onCustomerSelect?: (customerId: string) => void;
  /** Callback fired when a reporting quarter is selected */
  onQuarterSelect?: (quarterId: string) => void;
  /** Callback fired to navigate to KPI analytics for customer and quarter */
  onViewAnalytics?: (customerId: string, quarterId: string) => void;
  /** Callback fired to navigate to QBR report assembly */
  onGenerateReport?: (customerId: string, quarterId: string) => void;
  /** Indicates whether customer data is currently loading */
  isLoading?: boolean;
  /** Error message string to render in an alert banner */
  error?: string | null;
}

// ============================================================================
// Component Implementation
// ============================================================================

export function CustomerDashboard({
  customers: customersProp,
  reportingQuarters: quartersProp,
  kpis: kpisProp,
  selectedCustomerId: controlledCustomerId,
  selectedQuarterId: controlledQuarterId,
  onCustomerSelect,
  onQuarterSelect,
  onViewAnalytics,
  onGenerateReport,
  isLoading = false,
  error = null,
}: CustomerDashboardProps) {
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

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Uncontrolled selection states
  const [internalCustomerId, setInternalCustomerId] = useState<string>(() => {
    return allCustomers[0]?.id || '';
  });
  const [internalQuarterId, setInternalQuarterId] = useState<string>('');

  // Effective selected customer ID (controlled vs uncontrolled)
  const effectiveCustomerId = controlledCustomerId !== undefined ? controlledCustomerId : internalCustomerId;

  // Sync internal customer ID if list changes and current selection is invalid
  useEffect(() => {
    if (controlledCustomerId === undefined && allCustomers.length > 0) {
      const exists = allCustomers.some((c) => c.id === internalCustomerId);
      if (!exists) {
        setInternalCustomerId(allCustomers[0].id);
      }
    }
  }, [allCustomers, controlledCustomerId, internalCustomerId]);

  // Filtered customer list by search query
  const filteredCustomers = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return allCustomers;
    return allCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(trimmed) ||
        c.industry.toLowerCase().includes(trimmed)
    );
  }, [allCustomers, searchQuery]);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return allCustomers.find((c) => c.id === effectiveCustomerId);
  }, [allCustomers, effectiveCustomerId]);

  // Available quarters for the selected customer, sorted chronologically newest first
  const customerQuarters = useMemo(() => {
    if (!selectedCustomer) return [];
    return allQuarters
      .filter((q) => q.customerId === selectedCustomer.id)
      .slice()
      .sort((a, b) => {
        if (a.year !== b.year) {
          return b.year - a.year; // newest year first
        }
        return b.startDate.localeCompare(a.startDate); // newest quarter first
      });
  }, [allQuarters, selectedCustomer]);

  // Effective selected quarter ID (controlled vs uncontrolled)
  const effectiveQuarterId = useMemo(() => {
    if (controlledQuarterId !== undefined) {
      return controlledQuarterId;
    }
    // Check if internalQuarterId belongs to customer
    const match = customerQuarters.find((q) => q.id === internalQuarterId);
    if (match) return match.id;
    // Default to latest available quarter
    return customerQuarters[0]?.id || '';
  }, [controlledQuarterId, internalQuarterId, customerQuarters]);

  // Selected quarter object
  const selectedQuarter = useMemo(() => {
    return customerQuarters.find((q) => q.id === effectiveQuarterId) || customerQuarters[0];
  }, [customerQuarters, effectiveQuarterId]);

  // KPIs for the selected customer and selected quarter
  const activeKPIs = useMemo(() => {
    if (!selectedCustomer || !selectedQuarter) return [];
    return allKPIs.filter(
      (kpi) =>
        kpi.customerId === selectedCustomer.id &&
        kpi.quarterId === selectedQuarter.id
    );
  }, [allKPIs, selectedCustomer, selectedQuarter]);

  // Dataset availability metrics (non-performance summary)
  const kpiDatasetOverview = useMemo(() => {
    const total = activeKPIs.length;
    const categories = new Set(activeKPIs.map((k) => k.category)).size;
    const withTargets = activeKPIs.filter((k) => k.target !== null).length;
    const withPreviousValues = activeKPIs.filter(
      (k) => k.previousQuarterValue !== null
    ).length;
    const missingPreviousValues = activeKPIs.filter(
      (k) => k.previousQuarterValue === null
    ).length;

    return {
      total,
      categories,
      withTargets,
      withPreviousValues,
      missingPreviousValues,
    };
  }, [activeKPIs]);

  // Summary header metrics
  const headerMetrics = useMemo(() => {
    const totalCustomers = allCustomers.length;
    const customersWithData = new Set(allQuarters.map((q) => q.customerId)).size;
    const totalAvailableQuarters = allQuarters.length;

    return {
      totalCustomers,
      customersWithData,
      totalAvailableQuarters,
    };
  }, [allCustomers, allQuarters]);

  // Selection handlers
  const handleSelectCustomer = (customerId: string) => {
    if (onCustomerSelect) {
      onCustomerSelect(customerId);
    }
    if (controlledCustomerId === undefined) {
      setInternalCustomerId(customerId);
    }
    // Reset quarter to first available of the new customer
    const quarters = allQuarters.filter((q) => q.customerId === customerId);
    if (quarters.length > 0 && controlledQuarterId === undefined) {
      setInternalQuarterId(quarters[0].id);
      if (onQuarterSelect) {
        onQuarterSelect(quarters[0].id);
      }
    }
  };

  const handleSelectQuarter = (quarterId: string) => {
    if (onQuarterSelect) {
      onQuarterSelect(quarterId);
    }
    if (controlledQuarterId === undefined) {
      setInternalQuarterId(quarterId);
    }
  };

  // ==========================================================================
  // Render States
  // ==========================================================================

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" role="status" aria-label="Loading customer data">
        <div className="bg-white rounded-xl border border-slate-200 p-6 h-36" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 h-24" />
          <div className="bg-white rounded-xl border border-slate-200 h-24" />
          <div className="bg-white rounded-xl border border-slate-200 h-24" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 h-64" />
      </div>
    );
  }

  // 2. Global Error State
  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-rose-800" role="alert">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-base text-rose-900">Failed to Load Customer Dashboard</h3>
            <p className="text-sm mt-1 text-rose-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Summary Header */}
      <section aria-labelledby="dashboard-heading" className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 id="dashboard-heading" className="text-2xl font-bold text-slate-900 tracking-tight">
              Customer Management
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Explore customer accounts, reporting periods, and available operational KPI datasets.
            </p>
          </div>
        </div>

        {/* 3 Summary Scorecards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Customers
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{headerMetrics.totalCustomers}</div>
            <p className="text-xs text-slate-500 mt-1">Configured enterprise client accounts</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Reporting Portfolios
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{headerMetrics.customersWithData}</div>
            <p className="text-xs text-slate-500 mt-1">Accounts with active quarter data</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Available Quarters
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{headerMetrics.totalAvailableQuarters}</div>
            <p className="text-xs text-slate-500 mt-1">Completed reporting cycles across clients</p>
          </div>
        </div>
      </section>

      {/* 2. Customer Discovery & Search */}
      <section aria-labelledby="discovery-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 id="discovery-heading" className="text-base font-bold text-slate-900">
            Client Accounts ({filteredCustomers.length})
          </h3>

          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <label htmlFor="customer-search" className="sr-only">
              Search customers by name or industry
            </label>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="customer-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customers by name or industry..."
              className="w-full pl-9 pr-9 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                aria-label="Clear search input"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Customer Cards Grid */}
        {allCustomers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h4 className="font-semibold text-slate-800 text-base">No Customers Configured</h4>
            <p className="text-sm text-slate-500 mt-1">No customer accounts were found in the supplied dataset.</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
            <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h4 className="font-semibold text-slate-800 text-sm">No matching customers found</h4>
            <p className="text-xs text-slate-500 mt-1">
              No results found for &ldquo;{searchQuery}&rdquo;. Try another name or industry keyword.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800 focus:outline-none"
            >
              Clear search filter
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="list" aria-label="Customer accounts">
            {filteredCustomers.map((customer) => {
              const isSelected = customer.id === effectiveCustomerId;
              const customerQuartersList = allQuarters.filter((q) => q.customerId === customer.id);
              const customerKPIsCount = allKPIs.filter((k) => k.customerId === customer.id).length;
              const latestQuarter = customerQuartersList
                .slice()
                .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleSelectCustomer(customer.id)}
                  className={`text-left p-5 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-50/40 border-blue-500 shadow-sm ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                  aria-pressed={isSelected}
                  role="listitem"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {customer.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 leading-tight">
                            {customer.name}
                          </h4>
                          <span className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
                            <Briefcase className="w-3 h-3 text-slate-400" />
                            <span>{customer.industry}</span>
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-600 text-white shrink-0">
                          Selected
                        </span>
                      )}
                    </div>

                    {/* Leadership metadata */}
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Account Mgr:</span>
                        <span className="font-medium text-slate-800">{customer.accountManager}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Service Delivery:</span>
                        <span className="font-medium text-slate-800">{customer.serviceDeliveryManager}</span>
                      </div>
                    </div>
                  </div>

                  {/* Operational stats bar */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{customerQuartersList.length} Quarters</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Layers className="w-3 h-3 text-slate-400" />
                      <span>{customerKPIsCount} KPIs</span>
                    </span>
                    <span className="font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                      {latestQuarter ? `${latestQuarter.quarter} ${latestQuarter.year}` : 'No data'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Selected Customer Details & Reporting Period Workspace */}
      {selectedCustomer ? (
        <section
          aria-labelledby="selected-customer-heading"
          className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 shadow-xs space-y-6"
        >
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600 mb-1">
                <Building2 className="w-4 h-4" />
                <span>ACTIVE CLIENT PORTFOLIO</span>
              </div>
              <h3 id="selected-customer-heading" className="text-xl md:text-2xl font-bold text-slate-900">
                {selectedCustomer.name}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Industry: <span className="font-medium text-slate-700">{selectedCustomer.industry}</span> • Account Manager:{' '}
                <span className="font-medium text-slate-700">{selectedCustomer.accountManager}</span> • Service Delivery Manager:{' '}
                <span className="font-medium text-slate-700">{selectedCustomer.serviceDeliveryManager}</span>
              </p>
            </div>

            {/* Quick Actions (Section 8) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!selectedQuarter}
                onClick={() => {
                  if (onViewAnalytics && selectedQuarter) {
                    onViewAnalytics(selectedCustomer.id, selectedQuarter.id);
                  }
                }}
                className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  selectedQuarter
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={!selectedQuarter ? 'Select a reporting quarter first' : 'View KPI performance analytics'}
              >
                <BarChart2 className="w-4 h-4" />
                <span>View KPI Analytics</span>
              </button>

              <button
                type="button"
                disabled={!selectedQuarter}
                onClick={() => {
                  if (onGenerateReport && selectedQuarter) {
                    onGenerateReport(selectedCustomer.id, selectedQuarter.id);
                  }
                }}
                className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  selectedQuarter
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={!selectedQuarter ? 'Select a reporting quarter first' : 'Assemble QBR executive review presentation'}
              >
                <FileText className="w-4 h-4" />
                <span>Generate QBR Report</span>
              </button>
            </div>
          </div>

          {/* Quarter Selector (Section 5) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Select Reporting Quarter</span>
              </h4>
              <span className="text-xs text-slate-500">
                {customerQuarters.length} completed calendar cycle(s) available
              </span>
            </div>

            {customerQuarters.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                No historical reporting quarters recorded for this customer.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Reporting quarters">
                {customerQuarters.map((q) => {
                  const isQuarterSelected = selectedQuarter?.id === q.id;
                  const startFmt = q.startDate.substring(0, 10);
                  const endFmt = q.endDate.substring(0, 10);

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleSelectQuarter(q.id)}
                      role="radio"
                      aria-checked={isQuarterSelected}
                      className={`p-3.5 rounded-lg border text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isQuarterSelected
                          ? 'bg-blue-50/60 border-blue-600 shadow-2xs ring-1 ring-blue-600'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">
                          {q.quarter} {q.year}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                            q.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {q.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>
                          {startFmt} to {endFmt}
                        </span>
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* KPI Dataset Availability Overview (Section 7) */}
          {selectedQuarter && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    <span>KPI Dataset Overview ({selectedQuarter.quarter} {selectedQuarter.year})</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Data availability and benchmark readiness audit for {selectedCustomer.name}.
                  </p>
                </div>
              </div>

              {kpiDatasetOverview.total === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center text-slate-500 text-sm">
                  No KPI records logged for this reporting period.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] font-medium text-slate-500 block truncate">Total KPIs</span>
                    <span className="text-lg font-bold text-slate-900 block mt-0.5">
                      {kpiDatasetOverview.total}
                    </span>
                    <span className="text-[10px] text-slate-400">Recorded actuals</span>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] font-medium text-slate-500 block truncate">Categories</span>
                    <span className="text-lg font-bold text-slate-900 block mt-0.5">
                      {kpiDatasetOverview.categories}
                    </span>
                    <span className="text-[10px] text-slate-400">ITIL functional areas</span>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] font-medium text-slate-500 block truncate">With Targets</span>
                    <span className="text-lg font-bold text-emerald-700 block mt-0.5">
                      {kpiDatasetOverview.withTargets}
                    </span>
                    <span className="text-[10px] text-slate-400">Evaluable benchmarks</span>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[11px] font-medium text-slate-500 block truncate">QoQ Baselines</span>
                    <span className="text-lg font-bold text-blue-700 block mt-0.5">
                      {kpiDatasetOverview.withPreviousValues}
                    </span>
                    <span className="text-[10px] text-slate-400">Prior quarter data</span>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg col-span-2 sm:col-span-1">
                    <span className="text-[11px] font-medium text-slate-500 block truncate">Missing Baselines</span>
                    <span className="text-lg font-bold text-slate-700 block mt-0.5">
                      {kpiDatasetOverview.missingPreviousValues}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {kpiDatasetOverview.missingPreviousValues > 0 ? 'Baseline / first quarter' : 'Full history'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

export default CustomerDashboard;
