import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  AlertTriangle,
  Sparkles,
  FileText,
  UploadCloud,
  Settings,
  Menu,
  X,
  ArrowRight,
  Database,
  Calendar,
  Layers,
  ShieldAlert,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import {
  MOCK_CUSTOMERS,
  MOCK_REPORTING_QUARTERS,
  MOCK_KPIS,
} from './data/mockData';
import { CustomerDashboard } from './components/CustomerDashboard';
import { KPIAnalyticsDashboard } from './components/KPIAnalyticsDashboard';
import { AnomalyDashboard } from './components/AnomalyDashboard';
import { AIInsightsDashboard } from './components/AIInsightsDashboard';
import { QBRReportDashboard } from './components/QBRReportDashboard';

// ============================================================================
// Types
// ============================================================================

type SectionId =
  | 'overview'
  | 'customers'
  | 'kpis'
  | 'anomalies'
  | 'insights'
  | 'reports'
  | 'uploads'
  | 'settings';

interface NavigationItem {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'System dashboard, core metrics, and quick actions',
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    description: 'Account directory, industries, and service delivery leadership',
  },
  {
    id: 'kpis',
    label: 'KPI Analytics',
    icon: BarChart3,
    description: 'Quarter-on-quarter performance benchmarks and target compliance',
  },
  {
    id: 'anomalies',
    label: 'Anomaly Detection',
    icon: AlertTriangle,
    description: 'SLA breaches, sudden metric variations, and data-quality alarms',
  },
  {
    id: 'insights',
    label: 'AI Insights',
    icon: Sparkles,
    description: 'Synthesized operational risks and business opportunities',
  },
  {
    id: 'reports',
    label: 'QBR Reports',
    icon: FileText,
    description: 'Consolidated executive presentations and quarterly summaries',
  },
  {
    id: 'uploads',
    label: 'Data Uploads',
    icon: UploadCloud,
    description: 'Excel and CSV workbook ingestion and schema validation',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    description: 'Application thresholds, regional defaults, and preferences',
  },
] as const;

// Helper to determine the newest available quarter for a given customer
function getLatestQuarterForCustomer(customerId: string): string {
  const quarters = MOCK_REPORTING_QUARTERS.filter((q) => q.customerId === customerId);
  if (quarters.length === 0) return '';
  const sorted = [...quarters].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.startDate.localeCompare(a.startDate);
  });
  return sorted[0].id;
}

// ============================================================================
// Main Application Component
// ============================================================================

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Centralized customer and quarter selection state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => {
    return MOCK_CUSTOMERS[0]?.id || '';
  });

  const [selectedQuarterId, setSelectedQuarterId] = useState<string>(() => {
    const initialCustomerId = MOCK_CUSTOMERS[0]?.id;
    return initialCustomerId ? getLatestQuarterForCustomer(initialCustomerId) : '';
  });

  // Safe metrics count from mock datasets
  const totalCustomers = Array.isArray(MOCK_CUSTOMERS) ? MOCK_CUSTOMERS.length : 0;
  const totalQuarters = Array.isArray(MOCK_REPORTING_QUARTERS) ? MOCK_REPORTING_QUARTERS.length : 0;
  const totalKPIs = Array.isArray(MOCK_KPIS) ? MOCK_KPIS.length : 0;

  // Resolved active customer and quarter models
  const activeCustomer = useMemo(
    () => MOCK_CUSTOMERS.find((c) => c.id === selectedCustomerId) || MOCK_CUSTOMERS[0],
    [selectedCustomerId]
  );

  const activeQuarter = useMemo(
    () =>
      MOCK_REPORTING_QUARTERS.find(
        (q) => q.id === selectedQuarterId && q.customerId === activeCustomer?.id
      ) ||
      MOCK_REPORTING_QUARTERS.filter((q) => q.customerId === activeCustomer?.id)[0],
    [selectedQuarterId, activeCustomer]
  );

  const currentNav = NAVIGATION_ITEMS.find((item) => item.id === activeSection) ?? NAVIGATION_ITEMS[0];

  const handleNavClick = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    setIsMobileNavOpen(false);
  };

  // Centralized customer selection handler: retains quarter if valid for the new customer, else latest available quarter
  const handleCustomerSelect = (customerId: string) => {
    const customer = MOCK_CUSTOMERS.find((c) => c.id === customerId);
    if (!customer) return;

    setSelectedCustomerId(customerId);
    const isQuarterValidForNewCustomer = MOCK_REPORTING_QUARTERS.some(
      (q) => q.id === selectedQuarterId && q.customerId === customerId
    );
    if (!isQuarterValidForNewCustomer) {
      const latestQuarter = getLatestQuarterForCustomer(customerId);
      setSelectedQuarterId(latestQuarter);
    }
  };

  // Centralized quarter selection handler: confirms quarter belongs to the selected customer
  const handleQuarterSelect = (quarterId: string) => {
    const quarter = MOCK_REPORTING_QUARTERS.find(
      (q) => q.id === quarterId && q.customerId === selectedCustomerId
    );
    if (quarter) {
      setSelectedQuarterId(quarterId);
    }
  };

  // Callback to navigate to KPI Analytics with customer and quarter context preserved
  const handleViewAnalytics = (customerId: string, quarterId: string) => {
    setSelectedCustomerId(customerId);
    setSelectedQuarterId(quarterId);
    setActiveSection('kpis');
  };

  // Callback to navigate to QBR Reports with customer and quarter context preserved
  const handleGenerateReport = (customerId: string, quarterId: string) => {
    setSelectedCustomerId(customerId);
    setSelectedQuarterId(quarterId);
    setActiveSection('reports');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col md:flex-row antialiased">
      {/* Mobile Header Bar */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
            Q
          </div>
          <div>
            <span className="font-bold text-slate-900 text-sm block leading-tight">QBR Intelligence Studio</span>
            <span className="text-[10px] text-slate-500 block">ITSM Review Platform</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileNavOpen}
        >
          {isMobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Backdrop for Mobile Navigation */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-xs"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 left-0 bottom-0 z-50 md:z-10 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 h-screen ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
              Q
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-sm tracking-tight leading-tight">
                QBR Intelligence
              </h1>
              <p className="text-[11px] text-slate-500 leading-tight">Studio v0.1.0</p>
            </div>
          </div>
          {isMobileNavOpen && (
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(false)}
              className="md:hidden p-1 text-slate-400 hover:text-slate-600"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Sidebar navigation">
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Metadata */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-semibold">
              SD
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-slate-900 truncate">Service Delivery</p>
              <p className="text-[11px] text-slate-500 truncate">Enterprise Operations</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Desktop Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 hidden md:flex items-center justify-between sticky top-0 z-20 shadow-2xs">
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">
              {currentNav.label}
            </h2>
            <p className="text-xs text-slate-500 leading-tight">
              {currentNav.description}
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {/* Active Workspace Scope Indicator */}
            {activeCustomer && activeQuarter && (
              <div className="hidden lg:flex items-center space-x-2 bg-slate-100/80 border border-slate-200/80 px-3 py-1.5 rounded-lg text-xs">
                <span className="text-slate-500">Active Scope:</span>
                <span className="font-semibold text-slate-800">{activeCustomer.name}</span>
                <span className="text-slate-400">•</span>
                <span className="font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  {activeQuarter.quarter} {activeQuarter.year}
                </span>
              </div>
            )}

            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center border border-blue-200">
              IT
            </div>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {activeSection === 'overview' ? (
            <div className="space-y-8">
              {/* Hero Banner */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 w-fit">
                    Ready for Review Assembly
                  </span>
                  {activeCustomer && activeQuarter && (
                    <span className="text-xs text-slate-500 flex items-center space-x-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Current Portfolio:{' '}
                        <strong className="text-slate-700">{activeCustomer.name}</strong> (
                        {activeQuarter.quarter} {activeQuarter.year})
                      </span>
                    </span>
                  )}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight mb-2">
                  Welcome to QBR Intelligence Studio
                </h2>
                <p className="text-slate-600 text-sm md:text-base max-w-3xl leading-relaxed">
                  Transform operational data into actionable business intelligence and executive-ready Quarterly Business Reviews.
                </p>
              </div>

              {/* Four Core Metric Scorecard Cards */}
              <section aria-labelledby="metrics-heading">
                <h3 id="metrics-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                  Quarterly Operational Baseline
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Total Customers */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Total Customers
                      </span>
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Users className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{totalCustomers}</div>
                    <p className="text-xs text-slate-500 mt-1">Active client portfolios</p>
                  </div>

                  {/* Card 2: Reporting Quarters */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Reporting Quarters
                      </span>
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Calendar className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{totalQuarters}</div>
                    <p className="text-xs text-slate-500 mt-1">Calendar quarters recorded</p>
                  </div>

                  {/* Card 3: KPIs Tracked */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        KPIs Tracked
                      </span>
                      <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                        <Layers className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{totalKPIs}</div>
                    <p className="text-xs text-slate-500 mt-1">Operational metric actuals</p>
                  </div>

                  {/* Card 4: QBR Reports */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        QBR Reports
                      </span>
                      <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                        <FileText className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-base font-semibold text-slate-700">Not generated yet</div>
                    <p className="text-xs text-slate-500 mt-1">Available in report assembly</p>
                  </div>
                </div>
              </section>

              {/* Quick Actions Panel */}
              <section aria-labelledby="quick-actions-heading">
                <h3 id="quick-actions-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  <button
                    type="button"
                    onClick={() => handleNavClick('customers')}
                    className="p-5 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-300 hover:shadow-xs transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-slate-900">View Customers</h4>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Inspect client accounts and management</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavClick('kpis')}
                    className="p-5 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-300 hover:shadow-xs transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <BarChart3 className="w-4 h-4" />
                    </div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-slate-900">Explore KPI Analytics</h4>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Review quarter-on-quarter targets</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavClick('anomalies')}
                    className="p-5 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-300 hover:shadow-xs transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mb-3 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-slate-900">Review Anomalies</h4>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Check threshold breaches and alerts</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavClick('insights')}
                    className="p-5 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-300 hover:shadow-xs transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-slate-900">Explore AI Insights</h4>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Review operational findings & actions</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavClick('reports')}
                    className="p-5 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-300 hover:shadow-xs transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-slate-900">Generate QBR Report</h4>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Assemble executive presentations</p>
                  </button>
                </div>
              </section>

              {/* System Architecture Overview Callout */}
              <div className="bg-slate-100/70 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <Database className="w-5 h-5 text-slate-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Engine Modules Active (Files 1–18)</h4>
                    <p className="text-xs text-slate-600">
                      Domain types, constants, mock data, KPI analytics, anomaly detection, AI insights, QBR report assembly, Customer Dashboard, KPI Analytics Dashboard, Anomaly Dashboard, AI Insights Dashboard, and QBR Report Generation & Preview Dashboard are integrated and verified.
                    </p>
                  </div>
                </div>
                <div className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Integration Live
                </div>
              </div>
            </div>
          ) : activeSection === 'customers' ? (
            /* Integrated CustomerDashboard Component (File 9) */
            <CustomerDashboard
              customers={MOCK_CUSTOMERS}
              reportingQuarters={MOCK_REPORTING_QUARTERS}
              kpis={MOCK_KPIS}
              selectedCustomerId={selectedCustomerId}
              selectedQuarterId={selectedQuarterId}
              onCustomerSelect={handleCustomerSelect}
              onQuarterSelect={handleQuarterSelect}
              onViewAnalytics={handleViewAnalytics}
              onGenerateReport={handleGenerateReport}
            />
          ) : activeSection === 'kpis' ? (
            /* Integrated KPIAnalyticsDashboard Component (File 11) */
            <KPIAnalyticsDashboard
              customers={MOCK_CUSTOMERS}
              reportingQuarters={MOCK_REPORTING_QUARTERS}
              kpis={MOCK_KPIS}
              selectedCustomerId={selectedCustomerId}
              selectedQuarterId={selectedQuarterId}
              onCustomerChange={handleCustomerSelect}
              onQuarterChange={handleQuarterSelect}
            />
          ) : activeSection === 'anomalies' ? (
            /* Integrated AnomalyDashboard Component (File 13) */
            <AnomalyDashboard
              customers={MOCK_CUSTOMERS}
              reportingQuarters={MOCK_REPORTING_QUARTERS}
              kpis={MOCK_KPIS}
              selectedCustomerId={selectedCustomerId}
              selectedQuarterId={selectedQuarterId}
              onCustomerChange={handleCustomerSelect}
              onQuarterChange={handleQuarterSelect}
            />
          ) : activeSection === 'insights' ? (
            /* Integrated AIInsightsDashboard Component (File 15) */
            <AIInsightsDashboard
              customers={MOCK_CUSTOMERS}
              reportingQuarters={MOCK_REPORTING_QUARTERS}
              kpis={MOCK_KPIS}
              selectedCustomerId={selectedCustomerId}
              selectedQuarterId={selectedQuarterId}
              onCustomerChange={handleCustomerSelect}
              onQuarterChange={handleQuarterSelect}
            />
          ) : activeSection === 'reports' ? (
            /* Integrated QBRReportDashboard Component (File 17) */
            <QBRReportDashboard
              customers={MOCK_CUSTOMERS}
              reportingQuarters={MOCK_REPORTING_QUARTERS}
              kpis={MOCK_KPIS}
              selectedCustomerId={selectedCustomerId}
              selectedQuarterId={selectedQuarterId}
              onCustomerChange={handleCustomerSelect}
              onQuarterChange={handleQuarterSelect}
            />
          ) : (
            /* Section Placeholder for future modules */
            <div className="bg-white rounded-xl border border-slate-200 p-8 md:p-12 text-center max-w-2xl mx-auto my-8 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
                <currentNav.icon className="w-7 h-7" />
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 mb-3">
                Coming in the next development phase
              </span>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {currentNav.label}
              </h3>
              <p className="text-slate-600 text-sm max-w-md mx-auto mb-6 leading-relaxed">
                {currentNav.description}. This interactive section will be integrated in subsequent implementation steps.
              </p>

              {/* Context indicator for active customer & quarter */}
              {activeCustomer && activeQuarter && (
                <div className="inline-flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-lg text-xs text-slate-600 mb-6">
                  <span>Selected Context:</span>
                  <strong className="text-slate-800">{activeCustomer.name}</strong>
                  <span>•</span>
                  <span className="text-blue-700 font-medium">
                    {activeQuarter.quarter} {activeQuarter.year}
                  </span>
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => handleNavClick('overview')}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  <span>Back to Overview</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
