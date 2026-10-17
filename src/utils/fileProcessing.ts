/**
 * @file src/utils/fileProcessing.ts
 * @description Enterprise spreadsheet and CSV data ingestion engine for QBR Intelligence Studio.
 *
 * Implements:
 * 1. File type and size validation with extension-based fallbacks.
 * 2. Standards-compliant RFC 4180 CSV character-level state machine parser (quoted fields, commas, escaped quotes, multiline).
 * 3. Graceful Excel (.xlsx, .xls) validation with typed unsupported-parser detection when external libraries are absent.
 * 4. Header extraction and conservative automatic column mapping with ambiguity detection.
 * 5. Strict numeric and direction normalization into the core domain KPI interface.
 * 6. Business-rule KPI validation (SLA percentages, incident counts, MTTR non-negativity, score bounds).
 * 7. Dataset-scoped duplicate KPI detection preserving customer and quarter isolation.
 * 8. Comprehensive row-level errors and nonblocking warnings.
 * 9. Bounded preview generation and structured import result reporting.
 * 10. Formula injection safety preventing dynamic expression execution.
 */

import type {
  KPI,
  KPICategory,
  KPIDirection,
  KPIUnit,
  SupportedFileType,
} from '../types/qbr';
import { FILE_UPLOAD_CONFIG, KPI_CATEGORIES } from '../config/constants';

// ============================================================================
// 1. Error Codes & Domain Constants
// ============================================================================

export const FILE_PROCESSING_ERROR_CODES = {
  MISSING_KPI_NAME: 'MISSING_KPI_NAME',
  INVALID_NUMERIC_VALUE: 'INVALID_NUMERIC_VALUE',
  INVALID_DIRECTION: 'INVALID_DIRECTION',
  MISSING_REQUIRED_COLUMN: 'MISSING_REQUIRED_COLUMN',
  DUPLICATE_KPI: 'DUPLICATE_KPI',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  EMPTY_FILE: 'EMPTY_FILE',
  EXCEL_PARSER_UNAVAILABLE: 'EXCEL_PARSER_UNAVAILABLE',
  MALFORMED_CSV: 'MALFORMED_CSV',
  AMBIGUOUS_COLUMN_MAPPING: 'AMBIGUOUS_COLUMN_MAPPING',
  VALUE_OUT_OF_RANGE: 'VALUE_OUT_OF_RANGE',
  INVALID_FILE_OBJECT: 'INVALID_FILE_OBJECT',
  FORMULA_INJECTION_RISK: 'FORMULA_INJECTION_RISK',
  UNRECOGNIZED_CATEGORY: 'UNRECOGNIZED_CATEGORY',
  UNRECOGNIZED_UNIT: 'UNRECOGNIZED_UNIT',
} as const;

export type FileProcessingErrorCode =
  (typeof FILE_PROCESSING_ERROR_CODES)[keyof typeof FILE_PROCESSING_ERROR_CODES];

export const FILE_PROCESSING_WARNING_CODES = {
  MISSING_PREVIOUS_QUARTER_VALUE: 'MISSING_PREVIOUS_QUARTER_VALUE',
  MISSING_OPTIONAL_TARGET: 'MISSING_OPTIONAL_TARGET',
  MISSING_OPTIONAL_DESCRIPTION: 'MISSING_OPTIONAL_DESCRIPTION',
  UNRECOGNIZED_OPTIONAL_COLUMN: 'UNRECOGNIZED_OPTIONAL_COLUMN',
  BLANK_ROW_SKIPPED: 'BLANK_ROW_SKIPPED',
  CATEGORY_DEFAULTED_TO_CUSTOM: 'CATEGORY_DEFAULTED_TO_CUSTOM',
  UNIT_DEFAULTED_TO_CUSTOM: 'UNIT_DEFAULTED_TO_CUSTOM',
  NON_INTEGER_COUNT: 'NON_INTEGER_COUNT',
} as const;

export type FileProcessingWarningCode =
  (typeof FILE_PROCESSING_WARNING_CODES)[keyof typeof FILE_PROCESSING_WARNING_CODES];

// ============================================================================
// 2. Types & Interfaces
// ============================================================================

/**
 * Structured row-level or file-level error.
 */
export interface FileProcessingError {
  code: string;
  message: string;
  row?: number;
  column?: string;
  field?: string;
  severity?: 'error' | 'critical';
}

/**
 * Non-blocking operational warning.
 */
export interface FileProcessingWarning {
  code: string;
  message: string;
  row?: number;
  column?: string;
  field?: string;
}

/**
 * A single parsed row from an uploaded spreadsheet.
 */
export interface ParsedSpreadsheetRow {
  rowNumber: number; // 1-based index in the original file
  cells: Record<string, string>; // column header -> raw cell text
  rawValues?: Record<string, string>; // alias for flexible consumption
  isEmpty?: boolean;
}

/**
 * Raw tabular dataset parsed from a spreadsheet file.
 */
export interface ParsedSpreadsheetData {
  headers: string[];
  rows: ParsedSpreadsheetRow[];
  totalRows: number;
  sheetName?: string;
  availableSheets?: string[];
}

/**
 * Field-to-column mapping between canonical KPI schema and uploaded spreadsheet headers.
 */
export interface KPIColumnMapping {
  name: string; // Required: Column header containing KPI metric name
  value: string; // Required: Column header containing current quarter recorded value
  direction: string; // Required: Column header containing optimization direction
  target?: string | null; // Optional: Column header containing target benchmark
  previousQuarterValue?: string | null; // Optional: Column header containing baseline value
  category?: string | null; // Optional: Column header containing category classification
  unit?: string | null; // Optional: Column header containing unit of measure
  description?: string | null; // Optional: Column header containing metric description
}

/**
 * Authoritative customer and quarter context for data ingestion.
 */
export interface KPIImportContext {
  customerId: string;
  quarterId: string;
  sourceFileId?: string | null;
}

/**
 * Result of preliminary file metadata and size validation.
 */
export interface FileValidationResult {
  isValid: boolean;
  fileType: SupportedFileType | null;
  fileSizeBytes: number;
  fileName: string;
  errors: FileProcessingError[];
  warnings: FileProcessingWarning[];
}

/**
 * Configurable options for spreadsheet parsing and row processing.
 */
export interface FileProcessingOptions {
  customMapping?: Partial<KPIColumnMapping>;
  previewLimit?: number;
  skipBlankRows?: boolean;
  selectedSheet?: string;
  maxRows?: number;
}

/**
 * Complete structured outcome of a KPI dataset import operation.
 */
export interface KPIImportResult {
  status: 'complete_success' | 'partial_success' | 'failure';
  originalFileName: string;
  fileType: SupportedFileType | 'unknown';
  totalDataRows: number;
  validRowCount: number;
  invalidRowCount: number;
  warningCount: number;
  normalizedKPIs: KPI[];
  errors: FileProcessingError[];
  warnings: FileProcessingWarning[];
  columnMapping: KPIColumnMapping | null;
  sheetName?: string;
  context: KPIImportContext;
}

// ============================================================================
// 3. Category & Unit Dictionaries
// ============================================================================

/**
 * Comprehensive dictionary of category alias tokens mapped to canonical KPICategory.
 */
const CATEGORY_ALIASES: Record<string, KPICategory> = {
  // Service Availability
  availability: 'system_availability',
  service_availability: 'system_availability',
  system_availability: 'system_availability',
  uptime: 'system_availability',
  infrastructure_uptime: 'system_availability',

  // SLA Compliance
  sla: 'sla_compliance',
  sla_compliance: 'sla_compliance',
  sla_adherence: 'sla_compliance',
  contractual_sla: 'sla_compliance',
  sla_achievement: 'sla_compliance',

  // Incident Management
  incident: 'incident_management',
  incidents: 'incident_management',
  incident_management: 'incident_management',
  major_incidents: 'incident_management',
  tickets: 'incident_management',
  ticket_management: 'incident_management',

  // Operational Efficiency
  operational_efficiency: 'operational_efficiency',
  efficiency: 'operational_efficiency',
  change_management: 'operational_efficiency',
  problem_management: 'operational_efficiency',
  service_requests: 'operational_efficiency',
  automation: 'operational_efficiency',

  // Financial Cost
  financial: 'financial_cost',
  financial_cost: 'financial_cost',
  financial_performance: 'financial_cost',
  cost: 'financial_cost',
  cost_optimization: 'financial_cost',
  cloud_cost: 'financial_cost',

  // Customer Satisfaction
  customer_satisfaction: 'customer_satisfaction',
  csat: 'customer_satisfaction',
  nps: 'customer_satisfaction',
  satisfaction: 'customer_satisfaction',

  // Security Governance
  security: 'security_governance',
  governance: 'security_governance',
  security_governance: 'security_governance',
  compliance: 'security_governance',

  // Infrastructure Capacity
  infrastructure: 'infrastructure_capacity',
  capacity: 'infrastructure_capacity',
  infrastructure_capacity: 'infrastructure_capacity',
  infrastructure_performance: 'infrastructure_capacity',
  monitoring: 'infrastructure_capacity',
  monitoring_and_alerting: 'infrastructure_capacity',

  // Custom
  custom: 'custom',
  custom_metrics: 'custom',
};

/**
 * Comprehensive dictionary of unit alias tokens mapped to canonical KPIUnit.
 */
const UNIT_ALIASES: Record<string, KPIUnit> = {
  '%': 'percentage',
  percent: 'percentage',
  percentage: 'percentage',
  pct: 'percentage',

  ms: 'milliseconds',
  msec: 'milliseconds',
  milliseconds: 'milliseconds',

  s: 'seconds',
  sec: 'seconds',
  secs: 'seconds',
  seconds: 'seconds',

  m: 'minutes',
  min: 'minutes',
  mins: 'minutes',
  minutes: 'minutes',

  h: 'hours',
  hr: 'hours',
  hrs: 'hours',
  hours: 'hours',

  count: 'count',
  number: 'count',
  tickets: 'count',
  incidents: 'count',
  items: 'count',
  quantity: 'count',
  '#': 'count',

  $: 'currency_usd',
  usd: 'currency_usd',
  dollars: 'currency_usd',
  currency_usd: 'currency_usd',

  '€': 'currency_eur',
  eur: 'currency_eur',
  euros: 'currency_eur',
  currency_eur: 'currency_eur',

  '£': 'currency_gbp',
  gbp: 'currency_gbp',
  pounds: 'currency_gbp',
  currency_gbp: 'currency_gbp',

  ratio: 'ratio',
  rate: 'ratio',

  csat: 'score_out_of_5',
  score5: 'score_out_of_5',
  score_out_of_5: 'score_out_of_5',
  'score (1-5)': 'score_out_of_5',

  score10: 'score_out_of_10',
  score_out_of_10: 'score_out_of_10',
  'score (1-10)': 'score_out_of_10',

  nps: 'nps',
  net_promoter_score: 'nps',

  custom: 'custom',
};

// ============================================================================
// 4. Internal Utilities
// ============================================================================

/**
 * Generates a unique, collision-resistant KPI identifier in a browser-safe manner.
 */
function generateBrowserSafeId(prefix: string = 'kpi'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${timestamp}-${randomSuffix}`;
}

/**
 * Normalizes a header string for fuzzy canonical key matching.
 */
function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ============================================================================
// 5. Public Functions
// ============================================================================

/**
 * Validates uploaded file metadata (extension, MIME type, size, presence).
 *
 * @param file Browser File object or file-like descriptor with name and size.
 * @returns FileValidationResult containing validity flag and typed diagnostics.
 */
export function validateUploadFile(
  file: File | { name: string; size: number; type?: string }
): FileValidationResult {
  const errors: FileProcessingError[] = [];
  const warnings: FileProcessingWarning[] = [];

  if (!file || typeof file !== 'object') {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.INVALID_FILE_OBJECT,
      message: 'Invalid file object received. Expected a valid File instance or descriptor.',
      severity: 'critical',
    });
    return {
      isValid: false,
      fileType: null,
      fileSizeBytes: 0,
      fileName: '',
      errors,
      warnings,
    };
  }

  const fileName = (file.name || '').trim();
  const fileSizeBytes = typeof file.size === 'number' ? file.size : 0;
  const mimeType = (file.type || '').trim().toLowerCase();

  if (!fileName) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.INVALID_FILE_OBJECT,
      message: 'File name is missing or empty.',
      severity: 'critical',
    });
  }

  // 1. Check file size
  if (fileSizeBytes === 0) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.EMPTY_FILE,
      message: `File "${fileName}" is empty (0 bytes). Please upload a spreadsheet with data.`,
      severity: 'critical',
    });
  } else if (fileSizeBytes > FILE_UPLOAD_CONFIG.maxFileSizeBytes) {
    const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);
    const maxMB = (FILE_UPLOAD_CONFIG.maxFileSizeBytes / (1024 * 1024)).toFixed(0);
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.FILE_TOO_LARGE,
      message: `File size (${sizeMB} MB) exceeds maximum allowed limit of ${maxMB} MB.`,
      severity: 'critical',
    });
  }

  // 2. Determine file extension
  const extensionMatch = fileName.match(/\.([0-9a-z]+)$/i);
  const rawExtension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '';

  let detectedType: SupportedFileType | null = null;
  if (rawExtension === '.csv') {
    detectedType = 'csv';
  } else if (rawExtension === '.xlsx') {
    detectedType = 'xlsx';
  } else if (rawExtension === '.xls') {
    detectedType = 'xls';
  } else {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      message: `Unsupported file extension "${rawExtension || 'none'}". Supported formats are: ${FILE_UPLOAD_CONFIG.acceptedExtensions.join(', ')}.`,
      severity: 'critical',
    });
  }

  // 3. MIME type inspection & fallback
  if (mimeType) {
    const isMimeSupported = (FILE_UPLOAD_CONFIG.supportedMimeTypes as readonly string[]).includes(mimeType);

    // Explicit rejection of dangerous or non-spreadsheet types
    const isDangerousMime =
      mimeType.startsWith('text/html') ||
      mimeType.startsWith('application/javascript') ||
      mimeType.startsWith('application/x-') ||
      mimeType.startsWith('image/') ||
      mimeType.startsWith('audio/') ||
      mimeType.startsWith('video/') ||
      mimeType === 'application/pdf';

    if (isDangerousMime) {
      errors.push({
        code: FILE_PROCESSING_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
        message: `File MIME type "${mimeType}" is not an accepted spreadsheet format.`,
        severity: 'critical',
      });
    } else if (!isMimeSupported && mimeType !== 'application/octet-stream' && mimeType !== 'text/plain') {
      warnings.push({
        code: 'UNUSUAL_MIME_TYPE',
        message: `MIME type "${mimeType}" does not match standard spreadsheet headers, but file extension "${rawExtension}" is valid. Falling back to extension validation.`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    fileType: detectedType,
    fileSizeBytes,
    fileName,
    errors,
    warnings,
  };
}

/**
 * Character-level RFC 4180 CSV state machine parser.
 *
 * Reliably handles:
 * - Comma delimiters
 * - Quoted fields with commas
 * - Escaped double quotes ("")
 * - Multiline quoted fields preserving line number tracking
 * - CRLF (\r\n), LF (\n), and isolated CR (\r) line endings
 * - UTF-8 Byte Order Mark (\uFEFF)
 * - Trailing empty cells
 * - Header extraction and empty row detection
 *
 * @param csvText Raw text content of the CSV file.
 * @returns ParsedSpreadsheetData along with parsing errors and warnings.
 */
export function parseCSVText(csvText: string): {
  data: ParsedSpreadsheetData;
  errors: FileProcessingError[];
  warnings: FileProcessingWarning[];
} {
  const errors: FileProcessingError[] = [];
  const warnings: FileProcessingWarning[] = [];

  if (typeof csvText !== 'string' || csvText.length === 0) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.EMPTY_FILE,
      message: 'CSV text content is empty.',
      severity: 'critical',
    });
    return {
      data: { headers: [], rows: [], totalRows: 0 },
      errors,
      warnings,
    };
  }

  // Strip UTF-8 Byte Order Mark if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.substring(1);
  }

  const rawGrid: string[][] = [];
  const rowStartLines: number[] = [];

  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let currentLineNumber = 1;
  let fieldStartedInLine = 1;

  rowStartLines.push(1);

  const len = cleanText.length;
  for (let i = 0; i < len; i++) {
    const char = cleanText[i];
    const nextChar = i + 1 < len ? cleanText[i + 1] : '';

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote ("") inside quoted field
          currentField += '"';
          i++; // Skip the second quote
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        if (char === '\n') {
          currentLineNumber++;
        } else if (char === '\r') {
          if (nextChar === '\n') {
            // CRLF inside quotes
            currentLineNumber++;
            currentField += '\n';
            i++;
            continue;
          } else {
            currentLineNumber++;
          }
        }
        currentField += char;
      }
    } else {
      // Outside of quotes
      if (char === '"') {
        if (currentField.length === 0) {
          inQuotes = true;
          fieldStartedInLine = currentLineNumber;
        } else {
          // Quote inside unquoted field — record malformed warning/error
          errors.push({
            code: FILE_PROCESSING_ERROR_CODES.MALFORMED_CSV,
            message: `Unexpected quote character found inside unquoted field at line ${currentLineNumber}.`,
            row: currentLineNumber,
            severity: 'error',
          });
          currentField += char;
        }
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip LF of CRLF
        }
        currentRow.push(currentField);
        rawGrid.push(currentRow);
        currentRow = [];
        currentField = '';
        currentLineNumber++;
        rowStartLines.push(currentLineNumber);
      } else {
        currentField += char;
      }
    }
  }

  // Handle trailing content
  if (inQuotes) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.MALFORMED_CSV,
      message: `Unclosed quoted field starting at line ${fieldStartedInLine}. Reached unexpected end of file.`,
      row: fieldStartedInLine,
      severity: 'critical',
    });
  }

  if (currentRow.length > 0 || currentField.length > 0) {
    currentRow.push(currentField);
    rawGrid.push(currentRow);
  }

  if (rawGrid.length === 0) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.EMPTY_FILE,
      message: 'No readable data rows found in CSV.',
      severity: 'critical',
    });
    return {
      data: { headers: [], rows: [], totalRows: 0 },
      errors,
      warnings,
    };
  }

  // Extract headers from first non-empty row
  let headerRowIndex = -1;
  for (let r = 0; r < rawGrid.length; r++) {
    const row = rawGrid[r];
    const isNonEmpty = row.some((cell) => cell.trim().length > 0);
    if (isNonEmpty) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.MISSING_REQUIRED_COLUMN,
      message: 'CSV file contains only empty lines. No header row detected.',
      severity: 'critical',
    });
    return {
      data: { headers: [], rows: [], totalRows: 0 },
      errors,
      warnings,
    };
  }

  const rawHeaders = rawGrid[headerRowIndex].map((h) => h.trim());
  const headers: string[] = [];
  const seenHeaders = new Set<string>();

  for (let c = 0; c < rawHeaders.length; c++) {
    let headerName = rawHeaders[c];
    if (!headerName) {
      headerName = `Column_${c + 1}`;
      warnings.push({
        code: 'BLANK_HEADER_NAME',
        message: `Header at column ${c + 1} was empty. Designated as "${headerName}".`,
        column: headerName,
      });
    }

    if (seenHeaders.has(headerName.toLowerCase())) {
      warnings.push({
        code: 'DUPLICATE_HEADER_NAME',
        message: `Duplicate column header "${headerName}" found at column ${c + 1}.`,
        column: headerName,
      });
    }
    seenHeaders.add(headerName.toLowerCase());
    headers.push(headerName);
  }

  // Parse data rows
  const parsedRows: ParsedSpreadsheetRow[] = [];
  for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
    const cellsList = rawGrid[r];
    const rowNumber = rowStartLines[r] ?? r + 1;

    // Check if row is completely blank
    const isRowEmpty = cellsList.every((cell) => cell.trim().length === 0);
    if (isRowEmpty) {
      warnings.push({
        code: FILE_PROCESSING_WARNING_CODES.BLANK_ROW_SKIPPED,
        message: `Skipped empty row at line ${rowNumber}.`,
        row: rowNumber,
      });
      continue;
    }

    const cells: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const headerKey = headers[c];
      const cellValue = c < cellsList.length ? cellsList[c] : '';
      cells[headerKey] = cellValue;
    }

    parsedRows.push({
      rowNumber,
      cells,
      rawValues: cells,
      isEmpty: false,
    });
  }

  return {
    data: {
      headers,
      rows: parsedRows,
      totalRows: parsedRows.length,
      sheetName: 'Sheet1',
      availableSheets: ['Sheet1'],
    },
    errors,
    warnings,
  };
}

/**
 * Asynchronously parses an uploaded spreadsheet file (.csv, .xlsx, .xls).
 *
 * For CSV files, uses the standards-compliant state machine parser.
 * For Excel files (.xlsx, .xls), checks for installed parser libraries. Since no
 * external workbook library is bundled, returns a structured, typed unsupported-parser
 * error while keeping CSV functionality completely operational.
 *
 * @param file Browser File object or mock file descriptor with content.
 * @param options FileProcessingOptions such as sheet selection or maxRows.
 * @returns Promise resolving to ParsedSpreadsheetData, errors, and warnings.
 */
export async function parseSpreadsheetFile(
  file: File | { name: string; size: number; type?: string; content?: string | ArrayBuffer },
  options: FileProcessingOptions = {}
): Promise<{
  data: ParsedSpreadsheetData | null;
  errors: FileProcessingError[];
  warnings: FileProcessingWarning[];
}> {
  const errors: FileProcessingError[] = [];
  const warnings: FileProcessingWarning[] = [];

  const validation = validateUploadFile(file);
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  if (!validation.isValid || !validation.fileType) {
    return { data: null, errors, warnings };
  }

  // Handle Excel Workbooks (.xlsx, .xls)
  if (validation.fileType === 'xlsx' || validation.fileType === 'xls') {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.EXCEL_PARSER_UNAVAILABLE,
      message: `Direct parsing of Excel files (.${validation.fileType}) is not available in the current environment because no external spreadsheet parser library (such as xlsx or exceljs) is installed. Please export your dataset as CSV (.csv) or install an approved spreadsheet library.`,
      severity: 'error',
    });
    return { data: null, errors, warnings };
  }

  // Handle CSV Files
  try {
    let textContent = '';

    if ('content' in file && typeof file.content === 'string') {
      textContent = file.content;
    } else if (typeof (file as File).text === 'function') {
      textContent = await (file as File).text();
    } else if (typeof FileReader !== 'undefined' && file instanceof Blob) {
      textContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file from browser FileReader'));
        reader.readAsText(file as Blob);
      });
    } else {
      errors.push({
        code: FILE_PROCESSING_ERROR_CODES.INVALID_FILE_OBJECT,
        message: 'Unable to read file content in the current execution context.',
        severity: 'critical',
      });
      return { data: null, errors, warnings };
    }

    const parseResult = parseCSVText(textContent);
    errors.push(...parseResult.errors);
    warnings.push(...parseResult.warnings);

    if (options.maxRows && parseResult.data.rows.length > options.maxRows) {
      warnings.push({
        code: 'ROW_LIMIT_EXCEEDED',
        message: `Dataset contains ${parseResult.data.rows.length} rows; truncated to configured limit of ${options.maxRows} rows.`,
      });
      parseResult.data.rows = parseResult.data.rows.slice(0, options.maxRows);
      parseResult.data.totalRows = parseResult.data.rows.length;
    }

    return {
      data: parseResult.data,
      errors,
      warnings,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown file reading error';
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.MALFORMED_CSV,
      message: `Failed to read and parse CSV spreadsheet: ${errorMsg}`,
      severity: 'critical',
    });
    return { data: null, errors, warnings };
  }
}

/**
 * Automatically detects column mapping between uploaded headers and canonical KPI fields.
 *
 * @param headers Array of uploaded spreadsheet column headers.
 * @returns Detected KPIColumnMapping, errors, warnings, and ambiguity notes.
 */
export function detectColumnMapping(headers: readonly string[]): {
  mapping: KPIColumnMapping | null;
  errors: FileProcessingError[];
  warnings: FileProcessingWarning[];
  ambiguities: string[];
} {
  const errors: FileProcessingError[] = [];
  const warnings: FileProcessingWarning[] = [];
  const ambiguities: string[] = [];

  if (!headers || headers.length === 0) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.MISSING_REQUIRED_COLUMN,
      message: 'No headers provided for column mapping.',
      severity: 'critical',
    });
    return { mapping: null, errors, warnings, ambiguities };
  }

  // Priority-ordered matching candidate token lists
  const FIELD_CANDIDATES: Record<keyof KPIColumnMapping, string[]> = {
    name: [
      'kpiname',
      'metricname',
      'metric',
      'kpi',
      'metrictitle',
      'kpititle',
      'indicator',
      'name',
      'servicemetric',
    ],
    value: [
      'currentvalue',
      'recordedvalue',
      'actualvalue',
      'actual',
      'value',
      'current',
      'score',
      'qvalue',
    ],
    direction: [
      'direction',
      'optimizationdirection',
      'goaltype',
      'targetdirection',
      'betterdirection',
      'polarity',
      'trenddirection',
    ],
    target: [
      'target',
      'targetvalue',
      'goal',
      'benchmark',
      'threshold',
      'slatarget',
      'sla',
    ],
    previousQuarterValue: [
      'previousquartervalue',
      'previousquarter',
      'priorquarter',
      'previousvalue',
      'priorvalue',
      'baseline',
      'qminus1',
      'lastquarter',
      'lastquartervalue',
      'prior',
    ],
    category: [
      'category',
      'kpicategory',
      'domain',
      'functionalarea',
      'classification',
      'group',
      'areagroup',
    ],
    unit: [
      'unit',
      'kpiunit',
      'unitofmeasure',
      'uom',
      'measurementunit',
      'metricunit',
      'measure',
    ],
    description: [
      'description',
      'kpidescription',
      'details',
      'notes',
      'summary',
      'definition',
    ],
  };

  const detected: Partial<KPIColumnMapping> = {};
  const mappedHeaders = new Set<string>();

  // Process required fields first, then optional fields
  const fieldOrder: (keyof KPIColumnMapping)[] = [
    'name',
    'value',
    'direction',
    'target',
    'previousQuarterValue',
    'category',
    'unit',
    'description',
  ];

  for (const field of fieldOrder) {
    const candidates = FIELD_CANDIDATES[field];
    const matchingHeaders: string[] = [];

    for (const header of headers) {
      if (mappedHeaders.has(header)) {
        continue;
      }
      const normalized = normalizeHeaderKey(header);
      for (const candidate of candidates) {
        if (normalized === candidate) {
          matchingHeaders.push(header);
          break;
        }
      }
    }

    if (matchingHeaders.length === 1) {
      detected[field] = matchingHeaders[0];
      mappedHeaders.add(matchingHeaders[0]);
    } else if (matchingHeaders.length > 1) {
      // Ambiguity detected
      const ambiguityMsg = `Multiple headers [${matchingHeaders.map((h) => `"${h}"`).join(', ')}] match field "${field}". Selected first candidate "${matchingHeaders[0]}".`;
      ambiguities.push(ambiguityMsg);
      warnings.push({
        code: FILE_PROCESSING_ERROR_CODES.AMBIGUOUS_COLUMN_MAPPING,
        message: ambiguityMsg,
        field,
      });
      detected[field] = matchingHeaders[0];
      mappedHeaders.add(matchingHeaders[0]);
    }
  }

  // Validate required canonical mappings
  const requiredFields: (keyof KPIColumnMapping)[] = ['name', 'value', 'direction'];
  for (const reqField of requiredFields) {
    if (!detected[reqField]) {
      errors.push({
        code: FILE_PROCESSING_ERROR_CODES.MISSING_REQUIRED_COLUMN,
        message: `Required column for "${reqField}" could not be automatically detected in uploaded headers.`,
        field: reqField,
        severity: 'error',
      });
    }
  }

  const finalMapping: KPIColumnMapping | null =
    detected.name && detected.value && detected.direction
      ? {
          name: detected.name,
          value: detected.value,
          direction: detected.direction,
          target: detected.target || null,
          previousQuarterValue: detected.previousQuarterValue || null,
          category: detected.category || null,
          unit: detected.unit || null,
          description: detected.description || null,
        }
      : null;

  return {
    mapping: finalMapping,
    errors,
    warnings,
    ambiguities,
  };
}

/**
 * Validates a user-provided or customized column mapping against available spreadsheet headers.
 *
 * @param mapping Candidate KPI column mapping.
 * @param availableHeaders Array of headers physically present in the file.
 * @returns Object indicating validity and diagnostic errors/warnings.
 */
export function validateColumnMapping(
  mapping: Partial<KPIColumnMapping>,
  availableHeaders: readonly string[]
): {
  isValid: boolean;
  errors: FileProcessingError[];
  warnings: FileProcessingWarning[];
} {
  const errors: FileProcessingError[] = [];
  const warnings: FileProcessingWarning[] = [];
  const headerSet = new Set(availableHeaders);

  const requiredFields: (keyof KPIColumnMapping)[] = ['name', 'value', 'direction'];
  for (const field of requiredFields) {
    const mappedHeader = mapping[field];
    if (!mappedHeader || typeof mappedHeader !== 'string' || mappedHeader.trim().length === 0) {
      errors.push({
        code: FILE_PROCESSING_ERROR_CODES.MISSING_REQUIRED_COLUMN,
        message: `Mapping for required field "${field}" is missing.`,
        field,
        severity: 'error',
      });
    } else if (!headerSet.has(mappedHeader)) {
      errors.push({
        code: FILE_PROCESSING_ERROR_CODES.MISSING_REQUIRED_COLUMN,
        message: `Mapped header "${mappedHeader}" for field "${field}" does not exist in spreadsheet columns.`,
        field,
        column: mappedHeader,
        severity: 'error',
      });
    }
  }

  // Check optional fields if specified
  const optionalFields: (keyof KPIColumnMapping)[] = [
    'target',
    'previousQuarterValue',
    'category',
    'unit',
    'description',
  ];

  for (const field of optionalFields) {
    const mappedHeader = mapping[field];
    if (mappedHeader && !headerSet.has(mappedHeader)) {
      warnings.push({
        code: 'OPTIONAL_MAPPED_HEADER_MISSING',
        message: `Mapped header "${mappedHeader}" for optional field "${field}" does not exist in file. It will be ignored.`,
        field,
        column: mappedHeader,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Normalizes raw spreadsheet numeric cell values into standard JavaScript numbers.
 *
 * Implements:
 * - Handling of strings, numbers, null, and undefined.
 * - Formula injection safety (rejection of formula prefixes '=' and '@').
 * - Leading plus sign normalization (+99.5 -> 99.5).
 * - Percentage symbol parsing (99.95% -> 99.95).
 * - Thousands comma separation removal (1,250 -> 1250).
 * - Rejection of NaN, Infinity, and malformed strings.
 * - Semantic range and sign checks based on KPI unit.
 *
 * @param rawValue Raw cell content.
 * @param unit Optional KPIUnit for semantic domain validation.
 * @returns Object with parsed number (or null), validity status, and error message.
 */
export function normalizeKPIValue(
  rawValue: string | number | null | undefined,
  unit?: KPIUnit
): { value: number | null; isValid: boolean; error?: string } {
  if (rawValue === null || rawValue === undefined) {
    return { value: null, isValid: true };
  }

  if (typeof rawValue === 'number') {
    if (Number.isNaN(rawValue) || !Number.isFinite(rawValue)) {
      return { value: null, isValid: false, error: 'Value is NaN or infinite.' };
    }
    // Apply unit validation
    return validateNumericUnitSemantics(rawValue, unit);
  }

  if (typeof rawValue !== 'string') {
    return { value: null, isValid: false, error: 'Value is of unsupported non-string/non-number type.' };
  }

  const trimmed = rawValue.trim();
  if (trimmed === '') {
    return { value: null, isValid: true };
  }

  // Formula Injection Safety: reject cells starting with formula tokens
  if (trimmed.startsWith('=') || trimmed.startsWith('@')) {
    return {
      value: null,
      isValid: false,
      error: `Formula injection risk detected: Cell begins with formula character ("${trimmed[0]}"). Spreadsheet formulas are prohibited.`,
    };
  }

  // Handle leading '+' safely
  let cleaned = trimmed;
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1).trim();
  }

  // Handle percentage sign
  if (cleaned.endsWith('%')) {
    cleaned = cleaned.substring(0, cleaned.length - 1).trim();
  }

  // Handle currency symbols ($ € £) if present
  if (cleaned.startsWith('$') || cleaned.startsWith('€') || cleaned.startsWith('£')) {
    cleaned = cleaned.substring(1).trim();
  }

  // Handle commas: check if valid thousands separator (e.g. 1,250 or 1,250.50)
  if (cleaned.includes(',')) {
    // Reject ambiguous locale formats like 1.250,50 vs 1,250.50
    const commaCount = (cleaned.match(/,/g) || []).length;
    const dotCount = (cleaned.match(/\./g) || []).length;

    if (commaCount === 1 && dotCount === 1) {
      const commaIndex = cleaned.indexOf(',');
      const dotIndex = cleaned.indexOf('.');
      if (commaIndex > dotIndex) {
        // e.g. 1.250,50 (European notation) -> reject ambiguous locale
        return {
          value: null,
          isValid: false,
          error: `Ambiguous locale numeric format "${trimmed}". Expected standard format with period as decimal point (e.g. 1250.50).`,
        };
      }
    }

    cleaned = cleaned.replace(/,/g, '');
  }

  const parsed = Number(cleaned);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return {
      value: null,
      isValid: false,
      error: `Cannot parse "${trimmed}" as a valid numeric value.`,
    };
  }

  return validateNumericUnitSemantics(parsed, unit);
}

/**
 * Validates domain semantics based on KPI unit (e.g., non-negative counts, percentage range).
 */
function validateNumericUnitSemantics(
  val: number,
  unit?: KPIUnit
): { value: number; isValid: boolean; error?: string } {
  if (unit === 'percentage') {
    if (val < 0 || val > 100) {
      return {
        value: val,
        isValid: false,
        error: `Percentage value ${val} is outside acceptable range of 0.0 to 100.0.`,
      };
    }
  } else if (unit === 'count') {
    if (val < 0) {
      return {
        value: val,
        isValid: false,
        error: `Count value ${val} cannot be negative.`,
      };
    }
  } else if (unit === 'milliseconds' || unit === 'seconds' || unit === 'minutes' || unit === 'hours') {
    if (val < 0) {
      return {
        value: val,
        isValid: false,
        error: `Duration metric (${val} ${unit}) cannot be negative.`,
      };
    }
  } else if (unit === 'score_out_of_5') {
    if (val < 0 || val > 5) {
      return {
        value: val,
        isValid: false,
        error: `CSAT score (${val}) must be between 0 and 5.`,
      };
    }
  } else if (unit === 'score_out_of_10') {
    if (val < 0 || val > 10) {
      return {
        value: val,
        isValid: false,
        error: `Score (${val}) must be between 0 and 10.`,
      };
    }
  } else if (unit === 'nps') {
    if (val < -100 || val > 100) {
      return {
        value: val,
        isValid: false,
        error: `Net Promoter Score (${val}) must be between -100 and +100.`,
      };
    }
  }

  return { value: val, isValid: true };
}

/**
 * Normalizes an optimization direction alias string to canonical KPIDirection.
 *
 * @param rawDirection Raw text from direction column.
 * @returns Object with normalized KPIDirection or error message.
 */
export function normalizeKPIDirection(
  rawDirection: string | null | undefined
): { direction: KPIDirection | null; isValid: boolean; error?: string } {
  if (!rawDirection || typeof rawDirection !== 'string') {
    return {
      direction: null,
      isValid: false,
      error: 'Direction value is empty or missing.',
    };
  }

  const clean = rawDirection.trim().toLowerCase().replace(/[^a-z_]/g, '');

  if (
    clean === 'higher_is_better' ||
    clean === 'higher' ||
    clean === 'high' ||
    clean === 'maximize' ||
    clean === 'max' ||
    clean === 'up' ||
    clean === 'increasing'
  ) {
    return { direction: 'higher_is_better', isValid: true };
  }

  if (
    clean === 'lower_is_better' ||
    clean === 'lower' ||
    clean === 'low' ||
    clean === 'minimize' ||
    clean === 'min' ||
    clean === 'down' ||
    clean === 'decreasing'
  ) {
    return { direction: 'lower_is_better', isValid: true };
  }

  return {
    direction: null,
    isValid: false,
    error: `Invalid direction "${rawDirection}". Supported values are "higher_is_better" (higher, maximize) or "lower_is_better" (lower, minimize).`,
  };
}

/**
 * Normalizes a category string to canonical KPICategory.
 */
export function normalizeKPICategory(
  rawCategory: string | null | undefined
): { category: KPICategory; warning?: FileProcessingWarning } {
  if (!rawCategory || typeof rawCategory !== 'string' || rawCategory.trim() === '') {
    return {
      category: 'custom',
      warning: {
        code: FILE_PROCESSING_WARNING_CODES.CATEGORY_DEFAULTED_TO_CUSTOM,
        message: 'Category was not specified; defaulted to "custom".',
        field: 'category',
      },
    };
  }

  const normalized = normalizeHeaderKey(rawCategory);
  if (normalized in CATEGORY_ALIASES) {
    return { category: CATEGORY_ALIASES[normalized] };
  }

  // Check matching against constant definitions
  for (const cat of KPI_CATEGORIES) {
    if (normalizeHeaderKey(cat.id) === normalized || normalizeHeaderKey(cat.label) === normalized) {
      return { category: cat.domainGroup };
    }
  }

  return {
    category: 'custom',
    warning: {
      code: FILE_PROCESSING_WARNING_CODES.CATEGORY_DEFAULTED_TO_CUSTOM,
      message: `Unrecognized category "${rawCategory}"; classified as "custom".`,
      field: 'category',
    },
  };
}

/**
 * Normalizes a unit string to canonical KPIUnit.
 */
export function normalizeKPIUnit(
  rawUnit: string | null | undefined
): { unit: KPIUnit; warning?: FileProcessingWarning } {
  if (!rawUnit || typeof rawUnit !== 'string' || rawUnit.trim() === '') {
    return {
      unit: 'custom',
      warning: {
        code: FILE_PROCESSING_WARNING_CODES.UNIT_DEFAULTED_TO_CUSTOM,
        message: 'Unit was not specified; defaulted to "custom".',
        field: 'unit',
      },
    };
  }

  const clean = rawUnit.trim().toLowerCase();
  if (clean in UNIT_ALIASES) {
    return { unit: UNIT_ALIASES[clean] };
  }

  const normalized = normalizeHeaderKey(clean);
  if (normalized in UNIT_ALIASES) {
    return { unit: UNIT_ALIASES[normalized] };
  }

  return {
    unit: 'custom',
    warning: {
      code: FILE_PROCESSING_WARNING_CODES.UNIT_DEFAULTED_TO_CUSTOM,
      message: `Unrecognized unit "${rawUnit}"; classified as "custom".`,
      field: 'unit',
    },
  };
}

/**
 * Validates a single parsed row from the spreadsheet and normalizes it into a canonical KPI record.
 *
 * @param row ParsedSpreadsheetRow containing raw cells and row number.
 * @param mapping Active KPIColumnMapping.
 * @param context Authoritative customer and quarter context.
 * @returns Result with normalized KPI object (if valid) and diagnostic errors/warnings.
 */
export function validateKPIRow(
  row: ParsedSpreadsheetRow,
  mapping: KPIColumnMapping,
  context: KPIImportContext
): {
  isValid: boolean;
  normalizedKPI: KPI | null;
  errors: FileProcessingError[];
  warnings: FileProcessingWarning[];
} {
  const errors: FileProcessingError[] = [];
  const warnings: FileProcessingWarning[] = [];
  const rowNumber = row.rowNumber;

  // 1. KPI Name
  const rawName = row.cells[mapping.name] ?? '';
  const cleanName = rawName.trim();
  if (!cleanName) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.MISSING_KPI_NAME,
      message: `Row ${rowNumber}: KPI metric name is required but was empty.`,
      row: rowNumber,
      column: mapping.name,
      field: 'name',
      severity: 'error',
    });
  }

  // Formula injection check on text field
  if (cleanName.startsWith('=') || cleanName.startsWith('@')) {
    warnings.push({
      code: FILE_PROCESSING_ERROR_CODES.FORMULA_INJECTION_RISK,
      message: `Row ${rowNumber}: KPI name begins with formula character ("${cleanName[0]}"). Treated as literal text.`,
      row: rowNumber,
      field: 'name',
    });
  }

  // 2. Unit
  const rawUnit = mapping.unit ? row.cells[mapping.unit] : null;
  const unitResult = normalizeKPIUnit(rawUnit);
  if (unitResult.warning) {
    warnings.push({ ...unitResult.warning, row: rowNumber });
  }
  const unit = unitResult.unit;

  // 3. Current Value (Required)
  const rawValue = row.cells[mapping.value];
  if (rawValue === undefined || rawValue === null || rawValue.trim() === '') {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.INVALID_NUMERIC_VALUE,
      message: `Row ${rowNumber}: Current KPI value is required but was empty.`,
      row: rowNumber,
      column: mapping.value,
      field: 'value',
      severity: 'error',
    });
  }

  const valueResult = normalizeKPIValue(rawValue, unit);
  if (!valueResult.isValid || valueResult.value === null) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.INVALID_NUMERIC_VALUE,
      message: `Row ${rowNumber}: Invalid current value "${rawValue ?? ''}". ${valueResult.error || 'Expected valid number.'}`,
      row: rowNumber,
      column: mapping.value,
      field: 'value',
      severity: 'error',
    });
  }

  // Check integer constraint for count metrics
  if (unit === 'count' && valueResult.value !== null && !Number.isInteger(valueResult.value)) {
    warnings.push({
      code: FILE_PROCESSING_WARNING_CODES.NON_INTEGER_COUNT,
      message: `Row ${rowNumber}: Count metric "${cleanName}" has non-integer value (${valueResult.value}).`,
      row: rowNumber,
      field: 'value',
    });
  }

  // 4. Direction (Required)
  const rawDirection = row.cells[mapping.direction];
  const directionResult = normalizeKPIDirection(rawDirection);
  if (!directionResult.isValid || !directionResult.direction) {
    errors.push({
      code: FILE_PROCESSING_ERROR_CODES.INVALID_DIRECTION,
      message: `Row ${rowNumber}: ${directionResult.error || 'Invalid direction.'}`,
      row: rowNumber,
      column: mapping.direction,
      field: 'direction',
      severity: 'error',
    });
  }

  // 5. Target Benchmark (Optional)
  let target: number | null = null;
  if (mapping.target && row.cells[mapping.target] !== undefined) {
    const rawTarget = row.cells[mapping.target];
    if (rawTarget && rawTarget.trim().length > 0) {
      const targetResult = normalizeKPIValue(rawTarget, unit);
      if (!targetResult.isValid) {
        errors.push({
          code: FILE_PROCESSING_ERROR_CODES.INVALID_NUMERIC_VALUE,
          message: `Row ${rowNumber}: Target benchmark value "${rawTarget}" is invalid: ${targetResult.error || 'Expected valid number.'}`,
          row: rowNumber,
          column: mapping.target,
          field: 'target',
          severity: 'error',
        });
      } else {
        target = targetResult.value;
      }
    } else {
      warnings.push({
        code: FILE_PROCESSING_WARNING_CODES.MISSING_OPTIONAL_TARGET,
        message: `Row ${rowNumber}: Target benchmark is not specified; unrated SLA compliance will apply.`,
        row: rowNumber,
        field: 'target',
      });
    }
  }

  // 6. Previous Quarter Value (Optional)
  let previousQuarterValue: number | null = null;
  if (mapping.previousQuarterValue && row.cells[mapping.previousQuarterValue] !== undefined) {
    const rawPrev = row.cells[mapping.previousQuarterValue];
    if (rawPrev && rawPrev.trim().length > 0) {
      const prevResult = normalizeKPIValue(rawPrev, unit);
      if (!prevResult.isValid) {
        errors.push({
          code: FILE_PROCESSING_ERROR_CODES.INVALID_NUMERIC_VALUE,
          message: `Row ${rowNumber}: Previous quarter value "${rawPrev}" is invalid: ${prevResult.error || 'Expected valid number.'}`,
          row: rowNumber,
          column: mapping.previousQuarterValue,
          field: 'previousQuarterValue',
          severity: 'error',
        });
      } else {
        previousQuarterValue = prevResult.value;
      }
    } else {
      warnings.push({
        code: FILE_PROCESSING_WARNING_CODES.MISSING_PREVIOUS_QUARTER_VALUE,
        message: `Row ${rowNumber}: Previous quarter value is absent; baseline comparison will be marked as unavailable.`,
        row: rowNumber,
        field: 'previousQuarterValue',
      });
    }
  }

  // 7. Category (Optional / Defaulted)
  const rawCat = mapping.category ? row.cells[mapping.category] : null;
  const catResult = normalizeKPICategory(rawCat);
  if (catResult.warning) {
    warnings.push({ ...catResult.warning, row: rowNumber });
  }
  const category = catResult.category;

  // 8. Description (Optional / Defaulted)
  let description = '';
  if (mapping.description && row.cells[mapping.description] !== undefined) {
    description = (row.cells[mapping.description] || '').trim();
  }
  if (!description) {
    description = `${cleanName} metric tracked for ${context.quarterId}.`;
    warnings.push({
      code: FILE_PROCESSING_WARNING_CODES.MISSING_OPTIONAL_DESCRIPTION,
      message: `Row ${rowNumber}: Metric description was empty; generated automatic placeholder description.`,
      row: rowNumber,
      field: 'description',
    });
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      normalizedKPI: null,
      errors,
      warnings,
    };
  }

  const normalizedKPI: KPI = {
    id: generateBrowserSafeId('kpi-imported'),
    customerId: context.customerId,
    quarterId: context.quarterId,
    name: cleanName,
    category,
    description,
    unit,
    value: valueResult.value as number,
    target,
    previousQuarterValue,
    direction: directionResult.direction as KPIDirection,
    sourceFileId: context.sourceFileId ?? null,
  };

  return {
    isValid: true,
    normalizedKPI,
    errors,
    warnings,
  };
}

/**
 * Detects duplicate KPI records within an imported dataset.
 *
 * Uses a strictly scoped identity key:
 * customerId + quarterId + category + normalized KPI name.
 *
 * Preserves customer and quarter isolation: identical KPI names in
 * different quarters or belonging to different customers are NOT duplicates.
 *
 * @param kpis Array of normalized KPI records.
 * @returns Partitioned unique KPIs, duplicate records, errors, and warnings.
 */
export function detectDuplicateKPIs(kpis: readonly KPI[]): {
  uniqueKPIs: KPI[];
  duplicateRecords: Array<{ kpi: KPI; originalId: string }>;
  errors: FileProcessingError[];
  warnings: FileProcessingWarning[];
} {
  const uniqueKPIs: KPI[] = [];
  const duplicateRecords: Array<{ kpi: KPI; originalId: string }> = [];
  const errors: FileProcessingError[] = [];
  const warnings: FileProcessingWarning[] = [];

  const seenIdentities = new Map<string, string>(); // Identity Key -> Original KPI ID

  for (let i = 0; i < kpis.length; i++) {
    const kpi = kpis[i];
    const normalizedName = kpi.name.trim().toLowerCase();
    const identityKey = `${kpi.customerId}::${kpi.quarterId}::${kpi.category}::${normalizedName}`;

    if (seenIdentities.has(identityKey)) {
      const originalId = seenIdentities.get(identityKey)!;
      duplicateRecords.push({ kpi, originalId });

      errors.push({
        code: FILE_PROCESSING_ERROR_CODES.DUPLICATE_KPI,
        message: `Duplicate KPI "${kpi.name}" detected in category "${kpi.category}" for customer ${kpi.customerId} and quarter ${kpi.quarterId}. Second record excluded.`,
        field: 'name',
        severity: 'error',
      });
    } else {
      seenIdentities.set(identityKey, kpi.id);
      uniqueKPIs.push(kpi);
    }
  }

  return {
    uniqueKPIs,
    duplicateRecords,
    errors,
    warnings,
  };
}

/**
 * High-level orchestration function to process an entire parsed spreadsheet into validated KPIs.
 *
 * Enforces:
 * - Scoped customer and quarter context.
 * - Column mapping application.
 * - Row-by-row validation.
 * - Duplicate detection.
 * - Strict classification into complete_success, partial_success, or failure.
 *
 * @param parsedData Parsed spreadsheet table.
 * @param mapping Active column mapping.
 * @param context Authoritative customer and quarter context.
 * @param options Optional file processing parameters.
 * @returns Comprehensive KPIImportResult.
 */
export function processKPIImport(
  parsedData: ParsedSpreadsheetData,
  mapping: KPIColumnMapping,
  context: KPIImportContext,
  options: FileProcessingOptions = {}
): KPIImportResult {
  const errors: FileProcessingError[] = [];
  const warnings: FileProcessingWarning[] = [];

  const mappingValidation = validateColumnMapping(mapping, parsedData.headers);
  errors.push(...mappingValidation.errors);
  warnings.push(...mappingValidation.warnings);

  if (!mappingValidation.isValid) {
    return {
      status: 'failure',
      originalFileName: parsedData.sheetName || 'spreadsheet',
      fileType: 'csv',
      totalDataRows: parsedData.totalRows,
      validRowCount: 0,
      invalidRowCount: parsedData.totalRows,
      warningCount: warnings.length,
      normalizedKPIs: [],
      errors,
      warnings,
      columnMapping: mapping,
      sheetName: parsedData.sheetName,
      context,
    };
  }

  const rawKPIs: KPI[] = [];
  let invalidRowCount = 0;

  for (const row of parsedData.rows) {
    if (options.skipBlankRows && row.isEmpty) {
      continue;
    }

    const rowResult = validateKPIRow(row, mapping, context);
    errors.push(...rowResult.errors);
    warnings.push(...rowResult.warnings);

    if (rowResult.isValid && rowResult.normalizedKPI) {
      rawKPIs.push(rowResult.normalizedKPI);
    } else {
      invalidRowCount++;
    }
  }

  // Detect duplicates among the valid rows
  const duplicateCheck = detectDuplicateKPIs(rawKPIs);
  errors.push(...duplicateCheck.errors);
  warnings.push(...duplicateCheck.warnings);

  const finalKPIs = duplicateCheck.uniqueKPIs;
  if (duplicateCheck.duplicateRecords.length > 0) {
    invalidRowCount += duplicateCheck.duplicateRecords.length;
  }

  const validRowCount = finalKPIs.length;
  const totalDataRows = parsedData.rows.length;

  // Determine overall status
  let status: 'complete_success' | 'partial_success' | 'failure' = 'failure';
  if (validRowCount > 0 && invalidRowCount === 0 && errors.length === 0) {
    status = 'complete_success';
  } else if (validRowCount > 0) {
    status = 'partial_success';
  } else {
    status = 'failure';
  }

  return {
    status,
    originalFileName: parsedData.sheetName || 'uploaded_data.csv',
    fileType: 'csv',
    totalDataRows,
    validRowCount,
    invalidRowCount,
    warningCount: warnings.length,
    normalizedKPIs: finalKPIs,
    errors,
    warnings,
    columnMapping: mapping,
    sheetName: parsedData.sheetName,
    context,
  };
}

/**
 * Generates an immutable, bounded preview array of normalized KPI records.
 *
 * @param normalizedKPIs Array of validated KPI records.
 * @param limit Maximum number of records to return (defaults to 10).
 * @returns Shallow-cloned bounded array of KPIs.
 */
export function generateImportPreview(
  normalizedKPIs: readonly KPI[],
  limit: number = 10
): KPI[] {
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  return normalizedKPIs.slice(0, boundedLimit).map((kpi) => ({ ...kpi }));
}

/**
 * Produces an executive textual summary and quantitative code breakdown of an import result.
 *
 * @param result KPIImportResult to summarize.
 * @returns Diagnostic summary object.
 */
export function summarizeImportResult(result: KPIImportResult): {
  summaryText: string;
  isReadyForIngestion: boolean;
  errorSummary: Record<string, number>;
  warningSummary: Record<string, number>;
} {
  const errorSummary: Record<string, number> = {};
  for (const err of result.errors) {
    errorSummary[err.code] = (errorSummary[err.code] || 0) + 1;
  }

  const warningSummary: Record<string, number> = {};
  for (const warn of result.warnings) {
    warningSummary[warn.code] = (warningSummary[warn.code] || 0) + 1;
  }

  const isReadyForIngestion = result.status === 'complete_success' || (result.status === 'partial_success' && result.validRowCount > 0);

  let summaryText = '';
  if (result.status === 'complete_success') {
    summaryText = `Successfully processed ${result.validRowCount} KPI metrics from "${result.originalFileName}". All rows passed validation with 0 errors.`;
  } else if (result.status === 'partial_success') {
    summaryText = `Partially processed dataset "${result.originalFileName}": ${result.validRowCount} valid KPIs parsed, ${result.invalidRowCount} rows rejected, ${result.warnings.length} warnings.`;
  } else {
    summaryText = `Import failed for "${result.originalFileName}": 0 valid KPIs could be generated (${result.errors.length} errors encountered).`;
  }

  return {
    summaryText,
    isReadyForIngestion,
    errorSummary,
    warningSummary,
  };
}
