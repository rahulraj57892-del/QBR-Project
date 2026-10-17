/**
 * @file src/components/DataUploadDashboard.tsx
 * @description Enterprise KPI Data Upload & Ingestion Workspace for QBR Intelligence Studio.
 *
 * Implements:
 * 1. Customer and reporting quarter contextual selectors with controlled/uncontrolled state.
 * 2. Drag-and-drop and keyboard-accessible file upload zone with format and size validation.
 * 3. Client-side CSV parsing using RFC 4180 engine and transparent unsupported-Excel diagnostics.
 * 4. Interactive column mapping interface with automatic detection and conflict prevention.
 * 5. Comprehensive validation summary (total, valid, invalid, warnings, duplicates).
 * 6. Detailed row-level error and warning inspector with severity and field indicators.
 * 7. Bounded preview table for normalized KPI records before ingestion.
 * 8. Explicit import confirmation with customer/quarter isolation safety and typed callback handoff.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Info,
  RefreshCw,
  Trash2,
  Eye,
  SlidersHorizontal,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Check,
  FileCheck,
} from 'lucide-react';

import type {
  Customer,
  ReportingQuarter,
  KPI,
  SupportedFileType,
  KPICategory,
  KPIUnit,
  KPIDirection,
} from '../types/qbr';
import {
  MOCK_CUSTOMERS,
  MOCK_REPORTING_QUARTERS,
} from '../data/mockData';
import {
  FILE_UPLOAD_CONFIG,
} from '../config/constants';
import {
  validateUploadFile,
  parseSpreadsheetFile,
  detectColumnMapping,
  validateColumnMapping,
  processKPIImport,
  generateImportPreview,
  summarizeImportResult,
  FILE_PROCESSING_ERROR_CODES,
  type KPIColumnMapping,
  type KPIImportContext,
  type KPIImportResult,
  type ParsedSpreadsheetData,
  type FileProcessingError,
  type FileProcessingWarning,
} from '../utils/fileProcessing';

// ============================================================================
// Types & Contract Interface
// ============================================================================

/**
 * Strongly typed payload passed to onImportConfirmed when the user commits an import.
 */
export interface ImportConfirmedPayload {
  customerId: string;
  quarterId: string;
  sourceFileId: string | null;
  fileName: string;
  fileSizeBytes: number;
  fileType: SupportedFileType | 'unknown';
  kpis: KPI[];
  totalRows: number;
  validRowCount: number;
  invalidRowCount: number;
  warningCount: number;
  mapping: KPIColumnMapping;
  importResult: KPIImportResult;
}

export interface DataUploadDashboardProps {
  /** Optional customer list; defaults to mock dataset if omitted */
  customers?: readonly Customer[] | Customer[];
  /** Optional reporting quarters; defaults to mock dataset if omitted */
  reportingQuarters?: readonly ReportingQuarter[] | ReportingQuarter[];
  /** Controlled selected customer identifier */
  selectedCustomerId?: string;
  /** Controlled selected quarter identifier */
  selectedQuarterId?: string;
  /** Callback fired when customer selection changes */
  onCustomerChange?: (customerId: string) => void;
  /** Callback fired when quarter selection changes */
  onQuarterChange?: (quarterId: string) => void;
  /** Callback fired when user confirms importing validated KPI records */
  onImportConfirmed?: (payload: ImportConfirmedPayload) => void | Promise<void>;
  /** Indicates whether external data operations are loading */
  isLoading?: boolean;
  /** External error message string to render in an alert banner */
  error?: string | null;
}

/**
 * Internal ingestion workspace stage.
 */
type ProcessingStage =
  | 'idle'
  | 'reading'
  | 'parsing'
  | 'mapping'
  | 'validated'
  | 'failed';

// ============================================================================
// Canonical Field Descriptions for UI Mapping
// ============================================================================

interface CanonicalFieldMeta {
  key: keyof KPIColumnMapping;
  label: string;
  description: string;
  required: boolean;
  example: string;
}

const CANONICAL_FIELDS: CanonicalFieldMeta[] = [
  {
    key: 'name',
    label: 'KPI Metric Name',
    description: 'Human-readable title of the operational performance metric.',
    required: true,
    example: 'Service Availability, SLA Compliance, MTTR',
  },
  {
    key: 'value',
    label: 'Current Quarter Value',
    description: 'Actual numerical performance recorded in the reporting cycle.',
    required: true,
    example: '99.95, 12, 45.2',
  },
  {
    key: 'direction',
    label: 'Optimization Direction',
    description: 'Whether higher values represent success (higher_is_better) or lower (lower_is_better).',
    required: true,
    example: 'higher_is_better, lower_is_better, maximize, minimize',
  },
  {
    key: 'target',
    label: 'Target Benchmark (SLA)',
    description: 'Agreed contractual SLA or operational performance target.',
    required: false,
    example: '99.9, 98.0, 30.0',
  },
  {
    key: 'previousQuarterValue',
    label: 'Previous Quarter Value',
    description: 'Baseline comparison metric from the immediately preceding quarter.',
    required: false,
    example: '99.85, 15, 52.0',
  },
  {
    key: 'category',
    label: 'KPI Category',
    description: 'Domain classification (e.g. system_availability, incident_management).',
    required: false,
    example: 'sla_compliance, incident_management, system_availability',
  },
  {
    key: 'unit',
    label: 'Unit of Measure',
    description: 'Measurement unit (percentage, minutes, count, currency, score).',
    required: false,
    example: 'percentage, count, minutes, score_out_of_5',
  },
  {
    key: 'description',
    label: 'Metric Description',
    description: 'Operational definition and scope of the metric.',
    required: false,
    example: 'Core platform uptime across production environments.',
  },
];

// ============================================================================
// Component Implementation
// ============================================================================

export function DataUploadDashboard({
  customers = MOCK_CUSTOMERS,
  reportingQuarters = MOCK_REPORTING_QUARTERS,
  selectedCustomerId,
  selectedQuarterId,
  onCustomerChange,
  onQuarterChange,
  onImportConfirmed,
  isLoading = false,
  error: externalError = null,
}: DataUploadDashboardProps): React.ReactElement {
  // --------------------------------------------------------------------------
  // 1. Customer & Quarter State Management
  // --------------------------------------------------------------------------
  const safeCustomers = useMemo(() => customers || [], [customers]);
  const safeQuarters = useMemo(() => reportingQuarters || [], [reportingQuarters]);

  const [internalCustomerId, setInternalCustomerId] = useState<string>(() => {
    if (selectedCustomerId && safeCustomers.some((c) => c.id === selectedCustomerId)) {
      return selectedCustomerId;
    }
    return safeCustomers[0]?.id || '';
  });

  const activeCustomerId = selectedCustomerId !== undefined ? selectedCustomerId : internalCustomerId;
  const currentCustomer = useMemo(
    () => safeCustomers.find((c) => c.id === activeCustomerId) || null,
    [safeCustomers, activeCustomerId]
  );

  const availableQuarters = useMemo(() => {
    if (!activeCustomerId) return [];
    return safeQuarters
      .filter((q) => q.customerId === activeCustomerId)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.quarter.localeCompare(a.quarter);
      });
  }, [safeQuarters, activeCustomerId]);

  const [internalQuarterId, setInternalQuarterId] = useState<string>(() => {
    if (selectedQuarterId && availableQuarters.some((q) => q.id === selectedQuarterId)) {
      return selectedQuarterId;
    }
    return availableQuarters[0]?.id || '';
  });

  const activeQuarterId = selectedQuarterId !== undefined ? selectedQuarterId : internalQuarterId;
  const currentQuarter = useMemo(
    () => availableQuarters.find((q) => q.id === activeQuarterId) || null,
    [availableQuarters, activeQuarterId]
  );

  // Synchronize quarter when customer changes
  useEffect(() => {
    if (availableQuarters.length > 0) {
      const isQuarterValid = availableQuarters.some((q) => q.id === activeQuarterId);
      if (!isQuarterValid) {
        const fallbackQuarterId = availableQuarters[0].id;
        if (onQuarterChange) {
          onQuarterChange(fallbackQuarterId);
        } else {
          setInternalQuarterId(fallbackQuarterId);
        }
      }
    }
  }, [activeCustomerId, availableQuarters, activeQuarterId, onQuarterChange]);

  const handleCustomerSelect = useCallback(
    (newCustId: string) => {
      if (onCustomerChange) {
        onCustomerChange(newCustId);
      } else {
        setInternalCustomerId(newCustId);
      }
      // Reset quarter to latest for new customer
      const customerQuarters = safeQuarters.filter((q) => q.customerId === newCustId);
      const latestQ = customerQuarters[0]?.id || '';
      if (onQuarterChange) {
        onQuarterChange(latestQ);
      } else {
        setInternalQuarterId(latestQ);
      }
      // Invalidate current upload processing results due to customer context shift
      setImportResult(null);
      setParsedData(null);
      setStage('idle');
      setConfirmationStatus('idle');
    },
    [onCustomerChange, onQuarterChange, safeQuarters]
  );

  const handleQuarterSelect = useCallback(
    (newQId: string) => {
      if (onQuarterChange) {
        onQuarterChange(newQId);
      } else {
        setInternalQuarterId(newQId);
      }
      // Invalidate current upload processing results due to quarter context shift
      setImportResult(null);
      setStage((prev) => (prev === 'validated' ? 'mapping' : prev));
      setConfirmationStatus('idle');
    },
    [onQuarterChange]
  );

  // --------------------------------------------------------------------------
  // 2. File State & Drag-and-Drop Management
  // --------------------------------------------------------------------------
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileValidationErrors, setFileValidationErrors] = useState<FileProcessingError[]>([]);
  const [fileValidationWarnings, setFileValidationWarnings] = useState<FileProcessingWarning[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsing & Mapping State
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedSpreadsheetData | null>(null);
  const [columnMapping, setColumnMapping] = useState<KPIColumnMapping | null>(null);
  const [mappingErrors, setMappingErrors] = useState<FileProcessingError[]>([]);
  const [mappingWarnings, setMappingWarnings] = useState<FileProcessingWarning[]>([]);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);

  // Import Processing Result
  const [importResult, setImportResult] = useState<KPIImportResult | null>(null);
  const [previewLimit, setPreviewLimit] = useState<number>(10);
  const [acknowledgePartial, setAcknowledgePartial] = useState<boolean>(false);

  // Confirmation Handoff State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationStatus, setConfirmationStatus] = useState<
    'idle' | 'success_callback' | 'success_preview_only' | 'error'
  >('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Active Tab for Diagnostic Views
  const [activeViewTab, setActiveViewTab] = useState<'preview' | 'errors' | 'warnings' | 'mapping'>('preview');

  // --------------------------------------------------------------------------
  // 3. File Selection & Drag-and-Drop Handlers
  // --------------------------------------------------------------------------
  const resetUploadState = useCallback(() => {
    setSelectedFile(null);
    setFileValidationErrors([]);
    setFileValidationWarnings([]);
    setParsedData(null);
    setColumnMapping(null);
    setMappingErrors([]);
    setMappingWarnings([]);
    setAmbiguities([]);
    setImportResult(null);
    setStage('idle');
    setConfirmationStatus('idle');
    setSubmissionError(null);
    setAcknowledgePartial(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleFileChosen = useCallback(async (file: File) => {
    // Reset previous pipeline
    setParsedData(null);
    setColumnMapping(null);
    setMappingErrors([]);
    setMappingWarnings([]);
    setAmbiguities([]);
    setImportResult(null);
    setConfirmationStatus('idle');
    setSubmissionError(null);
    setAcknowledgePartial(false);

    setSelectedFile(file);

    // 1. Preliminary File Validation
    const validation = validateUploadFile(file);
    setFileValidationErrors(validation.errors);
    setFileValidationWarnings(validation.warnings);

    if (!validation.isValid) {
      setStage('failed');
      return;
    }

    // 2. Asynchronous Parsing
    setIsParsing(true);
    setStage('reading');

    try {
      const parseOutcome = await parseSpreadsheetFile(file);
      setIsParsing(false);

      if (!parseOutcome.data || parseOutcome.errors.some((e) => e.severity === 'critical' || e.code === FILE_PROCESSING_ERROR_CODES.EXCEL_PARSER_UNAVAILABLE)) {
        setFileValidationErrors((prev) => [...prev, ...parseOutcome.errors]);
        setFileValidationWarnings((prev) => [...prev, ...parseOutcome.warnings]);
        setStage('failed');
        return;
      }

      setParsedData(parseOutcome.data);
      setFileValidationWarnings((prev) => [...prev, ...parseOutcome.warnings]);

      // 3. Automatic Column Mapping Detection
      const detection = detectColumnMapping(parseOutcome.data.headers);
      setAmbiguities(detection.ambiguities);
      setMappingWarnings(detection.warnings);

      if (detection.mapping) {
        setColumnMapping(detection.mapping);
        setStage('mapping');
      } else {
        setMappingErrors(detection.errors);
        setStage('mapping');
      }
    } catch (err) {
      setIsParsing(false);
      setStage('failed');
      setFileValidationErrors([
        {
          code: 'UNEXPECTED_READ_ERROR',
          message: err instanceof Error ? err.message : 'Failed to read uploaded spreadsheet file.',
          severity: 'critical',
        },
      ]);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileChosen(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileChosen(file);
    }
  };

  // --------------------------------------------------------------------------
  // 4. Mapping Update & Evaluation
  // --------------------------------------------------------------------------
  const handleMappingFieldChange = (fieldKey: keyof KPIColumnMapping, selectedHeader: string) => {
    setColumnMapping((prev) => {
      const base: KPIColumnMapping = prev || {
        name: '',
        value: '',
        direction: '',
        target: null,
        previousQuarterValue: null,
        category: null,
        unit: null,
        description: null,
      };

      const updatedValue = selectedHeader === '__UNMAPPED__' ? null : selectedHeader;

      return {
        ...base,
        [fieldKey]: updatedValue,
      };
    });

    // Invalidate validated preview upon mapping modification
    setImportResult(null);
    setConfirmationStatus('idle');
  };

  const runEvaluation = useCallback(() => {
    if (!parsedData || !columnMapping || !activeCustomerId || !activeQuarterId) {
      return;
    }

    const mappingVal = validateColumnMapping(columnMapping, parsedData.headers);
    setMappingErrors(mappingVal.errors);
    setMappingWarnings(mappingVal.warnings);

    if (!mappingVal.isValid) {
      setStage('mapping');
      setImportResult(null);
      return;
    }

    const context: KPIImportContext = {
      customerId: activeCustomerId,
      quarterId: activeQuarterId,
      sourceFileId: selectedFile ? `file-${selectedFile.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : null,
    };

    const outcome = processKPIImport(parsedData, columnMapping, context);
    setImportResult(outcome);
    setStage('validated');
    setActiveViewTab(outcome.validRowCount > 0 ? 'preview' : 'errors');
  }, [parsedData, columnMapping, activeCustomerId, activeQuarterId, selectedFile]);

  // Automatically evaluate when mapping becomes valid
  useEffect(() => {
    if (columnMapping && columnMapping.name && columnMapping.value && columnMapping.direction && parsedData && stage === 'mapping') {
      runEvaluation();
    }
  }, [columnMapping, parsedData, stage, runEvaluation]);

  // --------------------------------------------------------------------------
  // 5. Import Confirmation Handler
  // --------------------------------------------------------------------------
  const handleConfirmImport = async () => {
    if (!importResult || importResult.validRowCount === 0) return;
    if (importResult.status === 'partial_success' && !acknowledgePartial) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    const payload: ImportConfirmedPayload = {
      customerId: activeCustomerId,
      quarterId: activeQuarterId,
      sourceFileId: importResult.context.sourceFileId ?? null,
      fileName: selectedFile?.name || importResult.originalFileName,
      fileSizeBytes: selectedFile?.size || 0,
      fileType: selectedFile?.name.endsWith('.csv') ? 'csv' : 'unknown',
      kpis: importResult.normalizedKPIs,
      totalRows: importResult.totalDataRows,
      validRowCount: importResult.validRowCount,
      invalidRowCount: importResult.invalidRowCount,
      warningCount: importResult.warningCount,
      mapping: importResult.columnMapping!,
      importResult,
    };

    try {
      if (onImportConfirmed) {
        await onImportConfirmed(payload);
        setConfirmationStatus('success_callback');
      } else {
        // Preview-only mode: explain that no callback was supplied
        setConfirmationStatus('success_preview_only');
      }
    } catch (err) {
      setConfirmationStatus('error');
      setSubmissionError(err instanceof Error ? err.message : 'Failed to finalize dataset import.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Summary diagnostics
  const summary = useMemo(() => {
    if (!importResult) return null;
    return summarizeImportResult(importResult);
  }, [importResult]);

  const previewRecords = useMemo(() => {
    if (!importResult || importResult.normalizedKPIs.length === 0) return [];
    return generateImportPreview(importResult.normalizedKPIs, previewLimit);
  }, [importResult, previewLimit]);

  // --------------------------------------------------------------------------
  // 6. Render
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* External Error Alert Banner */}
      {externalError && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="text-sm font-medium">{externalError}</span>
          </div>
        </div>
      )}

      {/* Header and Scope Selector */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Data Uploads & Ingestion Workspace</h2>
                <p className="text-sm text-slate-500">
                  Import, validate, and preview operational KPI datasets into scoped customer review cycles.
                </p>
              </div>
            </div>
          </div>

          {/* Context Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Customer Dropdown */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
              <label htmlFor="upload-customer-select" className="sr-only">
                Select Customer Account
              </label>
              <select
                id="upload-customer-select"
                value={activeCustomerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                disabled={isLoading || safeCustomers.length === 0}
                className="bg-transparent text-sm font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                {safeCustomers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Reporting Quarter Dropdown */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <label htmlFor="upload-quarter-select" className="sr-only">
                Select Reporting Quarter
              </label>
              <select
                id="upload-quarter-select"
                value={activeQuarterId}
                onChange={(e) => handleQuarterSelect(e.target.value)}
                disabled={isLoading || availableQuarters.length === 0}
                className="bg-transparent text-sm font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                {availableQuarters.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.year} {q.quarter} ({q.status})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selected Scope Banner */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">Active Import Destination:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
              {currentCustomer?.name || 'No Customer Selected'}
            </span>
            <span>&rarr;</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
              {currentQuarter ? `${currentQuarter.year} ${currentQuarter.quarter}` : 'No Quarter'}
            </span>
          </div>
          <div className="flex items-center space-x-3 text-slate-400">
            <span>Max Size: 20 MB</span>
            <span>&bull;</span>
            <span>Supported: .csv (Native client-side)</span>
          </div>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-2">Upload Operational Spreadsheet</h3>
        <p className="text-sm text-slate-500 mb-4">
          Select or drag your CSV file into the ingestion zone below. Column headers and metrics will be parsed securely in your browser.
        </p>

        {/* Hidden Accessible File Input */}
        <input
          ref={fileInputRef}
          type="file"
          id="kpi-file-upload-input"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleFileInputChange}
          className="sr-only"
        />

        {!selectedFile ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="Upload spreadsheet: drag and drop file here, or click to browse"
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              isDragOver
                ? 'border-blue-500 bg-blue-50/50'
                : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/50'
            }`}
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Click to select a file or drag and drop here
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports standard CSV (.csv) spreadsheets up to 20 MB.
            </p>
            <div className="mt-3 flex items-center justify-center space-x-2 text-xs text-amber-600 bg-amber-50 rounded-lg py-1 px-3 max-w-md mx-auto">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Note: Direct Excel (.xlsx/.xls) parsing requires external library setup. Please use CSV.</span>
            </div>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-slate-900">{selectedFile.name}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200 text-slate-700 uppercase">
                      {selectedFile.name.split('.').pop()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB &bull; Selected at {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Replace File
                </button>
                <button
                  type="button"
                  onClick={resetUploadState}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>

            {/* In-flight parsing indicator */}
            {isParsing && (
              <div className="mt-3 flex items-center space-x-2 text-xs font-medium text-blue-600">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Reading and parsing spreadsheet records...</span>
              </div>
            )}
          </div>
        )}

        {/* File-level error / unsupported warning notices */}
        {fileValidationErrors.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
            <div className="flex items-center space-x-2 text-red-800 font-semibold text-sm">
              <XCircle className="w-4 h-4 text-red-600" />
              <span>File Validation and Parsing Errors:</span>
            </div>
            <ul className="list-disc list-inside text-xs text-red-700 space-y-1">
              {fileValidationErrors.map((err, i) => (
                <li key={`file-err-${i}`}>
                  <span className="font-mono text-[11px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded mr-1">
                    {err.code}
                  </span>
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Column Mapping Configuration (visible once parsedData exists) */}
      {parsedData && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">Spreadsheet Column Mapping</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Map columns from <span className="font-semibold text-slate-700">{selectedFile?.name}</span> to canonical KPI schema fields.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  if (parsedData) {
                    const detection = detectColumnMapping(parsedData.headers);
                    if (detection.mapping) {
                      setColumnMapping(detection.mapping);
                      setAmbiguities(detection.ambiguities);
                    }
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-detect Columns</span>
              </button>
            </div>
          </div>

          {/* Ambiguities Notification */}
          {ambiguities.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Multiple header candidates detected:</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {ambiguities.map((amb, idx) => (
                    <li key={`amb-${idx}`}>{amb}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Mapping Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CANONICAL_FIELDS.map((field) => {
              const currentMappedHeader = columnMapping ? (columnMapping[field.key] as string | null) : null;
              const isRequiredMissing = field.required && (!currentMappedHeader || currentMappedHeader.trim() === '');

              return (
                <div
                  key={field.key}
                  className={`border rounded-lg p-3.5 transition-colors ${
                    isRequiredMissing
                      ? 'border-red-300 bg-red-50/30'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor={`mapping-field-${field.key}`}
                      className="text-xs font-bold text-slate-800 flex items-center space-x-1"
                    >
                      <span>{field.label}</span>
                      {field.required && <span className="text-red-500 font-bold">*</span>}
                    </label>
                    <span
                      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        field.required ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {field.required ? 'Required' : 'Optional'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 mb-2">{field.description}</p>

                  <select
                    id={`mapping-field-${field.key}`}
                    value={currentMappedHeader || '__UNMAPPED__'}
                    onChange={(e) => handleMappingFieldChange(field.key, e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="__UNMAPPED__">
                      {field.required ? '-- Select Source Column (Required) --' : '-- Leave Unmapped (Optional) --'}
                    </option>
                    {parsedData.headers.map((hdr) => (
                      <option key={`hdr-${field.key}-${hdr}`} value={hdr}>
                        {hdr}
                      </option>
                    ))}
                  </select>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="truncate max-w-[180px]">e.g. {field.example}</span>
                    {currentMappedHeader && (
                      <span className="text-emerald-600 font-medium flex items-center space-x-0.5">
                        <Check className="w-3 h-3" />
                        <span>Mapped</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mapping Diagnostics or Apply Button */}
          {mappingErrors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <span className="font-semibold">Mapping requirement check failed:</span>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {mappingErrors.map((err, i) => (
                  <li key={`map-err-${i}`}>{err.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Dataset columns detected: <span className="font-semibold text-slate-700">{parsedData.headers.length}</span> &bull; Data rows: <span className="font-semibold text-slate-700">{parsedData.rows.length}</span>
            </span>

            <button
              type="button"
              onClick={runEvaluation}
              disabled={!columnMapping?.name || !columnMapping?.value || !columnMapping?.direction}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5"
            >
              <FileCheck className="w-4 h-4" />
              <span>Validate & Process Dataset</span>
            </button>
          </div>
        </div>
      )}

      {/* Validation Summary & Preview Workspace */}
      {importResult && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          {/* Executive Metric Cards */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Validation & Ingestion Scorecard</h3>
                <p className="text-xs text-slate-500">
                  Calculated using business semantics, customer context, and SLA boundaries.
                </p>
              </div>

              {/* Status Badge */}
              <div>
                {importResult.status === 'complete_success' ? (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Complete Success (All rows valid)</span>
                  </span>
                ) : importResult.status === 'partial_success' ? (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Partial Success ({importResult.validRowCount} valid, {importResult.invalidRowCount} rejected)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span>Validation Failure (0 valid records)</span>
                  </span>
                )}
              </div>
            </div>

            {/* Scorecard Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Rows</span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{importResult.totalDataRows}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase">Valid Records</span>
                <p className="text-xl font-bold text-emerald-800 mt-0.5">{importResult.validRowCount}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <span className="text-[11px] font-semibold text-red-700 uppercase">Rejected Rows</span>
                <p className="text-xl font-bold text-red-800 mt-0.5">{importResult.invalidRowCount}</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-[11px] font-semibold text-amber-700 uppercase">Warnings</span>
                <p className="text-xl font-bold text-amber-800 mt-0.5">{importResult.warningCount}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 col-span-2 sm:col-span-1">
                <span className="text-[11px] font-semibold text-purple-700 uppercase">Target Quarter</span>
                <p className="text-sm font-bold text-purple-900 mt-1 truncate">
                  {currentQuarter ? `${currentQuarter.year} ${currentQuarter.quarter}` : activeQuarterId}
                </p>
              </div>
            </div>

            {/* Natural language summary callout */}
            {summary && (
              <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center space-x-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{summary.summaryText}</span>
              </div>
            )}
          </div>

          {/* Diagnostic Views Tab Bar */}
          <div className="border-b border-slate-200 flex space-x-4">
            <button
              type="button"
              onClick={() => setActiveViewTab('preview')}
              className={`pb-2.5 text-xs font-semibold flex items-center space-x-1.5 transition-colors border-b-2 ${
                activeViewTab === 'preview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Valid KPI Preview ({importResult.validRowCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveViewTab('errors')}
              className={`pb-2.5 text-xs font-semibold flex items-center space-x-1.5 transition-colors border-b-2 ${
                activeViewTab === 'errors'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Validation Errors ({importResult.errors.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveViewTab('warnings')}
              className={`pb-2.5 text-xs font-semibold flex items-center space-x-1.5 transition-colors border-b-2 ${
                activeViewTab === 'warnings'
                  ? 'border-amber-600 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Warnings ({importResult.warnings.length})</span>
            </button>
          </div>

          {/* TAB 1: Preview Table */}
          {activeViewTab === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {previewRecords.length} of {importResult.validRowCount} validated KPI records
                </span>
                <div className="flex items-center space-x-2">
                  <span>Display limit:</span>
                  <select
                    value={previewLimit}
                    onChange={(e) => setPreviewLimit(Number(e.target.value))}
                    className="border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-700 bg-white"
                  >
                    <option value={5}>5 records</option>
                    <option value={10}>10 records</option>
                    <option value={25}>25 records</option>
                    <option value={50}>50 records</option>
                  </select>
                </div>
              </div>

              {previewRecords.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Metric Name</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-right">Current Value</th>
                        <th className="py-2.5 px-3 text-right">Target</th>
                        <th className="py-2.5 px-3 text-right">Previous Value</th>
                        <th className="py-2.5 px-3">Unit</th>
                        <th className="py-2.5 px-3">Direction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRecords.map((kpi, idx) => (
                        <tr key={`prev-${kpi.id}-${idx}`} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            <div>{kpi.name}</div>
                            {kpi.description && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                {kpi.description}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                              {kpi.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {kpi.value}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {kpi.target !== null ? kpi.target : <span className="text-slate-400 italic">None</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {kpi.previousQuarterValue !== null ? (
                              kpi.previousQuarterValue
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{kpi.unit}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                kpi.direction === 'higher_is_better'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-indigo-50 text-indigo-700'
                              }`}
                            >
                              {kpi.direction}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-xs">
                  No valid KPI records available to preview. Please review the errors tab.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Errors Table */}
          {activeViewTab === 'errors' && (
            <div className="space-y-3">
              {importResult.errors.length > 0 ? (
                <div className="overflow-x-auto border border-red-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-red-50/70 text-red-900 font-semibold border-b border-red-200">
                      <tr>
                        <th className="py-2.5 px-3 w-16">Row #</th>
                        <th className="py-2.5 px-3 w-32">Column / Field</th>
                        <th className="py-2.5 px-3 w-44">Error Code</th>
                        <th className="py-2.5 px-3">Diagnostic Message</th>
                        <th className="py-2.5 px-3 w-20">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100 bg-white">
                      {importResult.errors.map((err, idx) => (
                        <tr key={`err-row-${idx}`} className="hover:bg-red-50/30">
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-700">
                            {err.row !== undefined ? `Row ${err.row}` : 'File'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-medium">{err.column || err.field || '-'}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                              {err.code}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{err.message}</td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-800">
                              {err.severity || 'error'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs flex items-center justify-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Zero errors detected! All dataset rows conform cleanly to domain requirements.</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Warnings Table */}
          {activeViewTab === 'warnings' && (
            <div className="space-y-3">
              {importResult.warnings.length > 0 ? (
                <div className="overflow-x-auto border border-amber-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-amber-50/70 text-amber-900 font-semibold border-b border-amber-200">
                      <tr>
                        <th className="py-2.5 px-3 w-16">Row #</th>
                        <th className="py-2.5 px-3 w-32">Field</th>
                        <th className="py-2.5 px-3 w-48">Warning Code</th>
                        <th className="py-2.5 px-3">Operational Advice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100 bg-white">
                      {importResult.warnings.map((warn, idx) => (
                        <tr key={`warn-row-${idx}`} className="hover:bg-amber-50/30">
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-700">
                            {warn.row !== undefined ? `Row ${warn.row}` : 'File'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-medium">{warn.column || warn.field || '-'}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                              {warn.code}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{warn.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-xs">
                  Zero warnings reported for this dataset.
                </div>
              )}
            </div>
          )}

          {/* Import Commitment & Action Panel */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            {/* Partial Import Acknowledgment Checkbox if there are rejected rows */}
            {importResult.status === 'partial_success' && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="acknowledge-partial-import"
                  checked={acknowledgePartial}
                  onChange={(e) => setAcknowledgePartial(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="acknowledge-partial-import" className="text-xs text-amber-900 cursor-pointer">
                  <span className="font-semibold">Acknowledge Partial Import:</span> I confirm that{' '}
                  <span className="font-bold">{importResult.invalidRowCount} invalid rows</span> will be discarded, and only the{' '}
                  <span className="font-bold">{importResult.validRowCount} validated KPI metrics</span> will be ingested into the review session.
                </label>
              </div>
            )}

            {/* Confirmation Outcome Alerts */}
            {confirmationStatus === 'success_callback' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-emerald-900">Dataset Successfully Handed Off!</p>
                  <p className="mt-0.5">
                    {importResult.validRowCount} KPI metrics for {currentCustomer?.name} ({currentQuarter?.year} {currentQuarter?.quarter}) were passed to the application session handler.
                  </p>
                </div>
              </div>
            )}

            {confirmationStatus === 'success_preview_only' && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center space-x-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <p className="font-bold text-blue-900">Preview-Only Ingestion Mode</p>
                  <p className="mt-0.5">
                    Validation succeeded for {importResult.validRowCount} KPI records. Because no upstream persistence callback was configured, data has not been modified in existing dashboards.
                  </p>
                </div>
              </div>
            )}

            {confirmationStatus === 'error' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center space-x-3">
                <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <p className="font-bold text-red-900">Import Commitment Failed</p>
                  <p className="mt-0.5">{submissionError || 'An error occurred while confirming import.'}</p>
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                <span>Customer: <strong className="text-slate-800">{currentCustomer?.name}</strong></span>
                <span className="mx-2">&bull;</span>
                <span>Quarter: <strong className="text-slate-800">{currentQuarter ? `${currentQuarter.year} ${currentQuarter.quarter}` : 'None'}</strong></span>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={resetUploadState}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                >
                  Clear & Start Over
                </button>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={
                    importResult.validRowCount === 0 ||
                    (importResult.status === 'partial_success' && !acknowledgePartial) ||
                    isSubmitting
                  }
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Confirming Import...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Import ({importResult.validRowCount} Records)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataUploadDashboard;
