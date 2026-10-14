/**
 * FileValidationService — Multi-layer document ingestion guard.
 *
 * Layers:
 *  1. Extension whitelist
 *  2. MIME type whitelist
 *  3. Magic-byte signature verification (actual file content, not client claim)
 *  4. File size limits
 *  5. Per-tenant document count limits
 *  6. Suspicious content pattern scanning (basic quarantine)
 */

import crypto from 'crypto';

// ─── Configuration ────────────────────────────────────────────────────────────
export const FILE_LIMITS = {
  maxFileSizeMB: 25,
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxPOsPerTenant: 500,
  allowedExtensions: ['.pdf'] as const,
  allowedMimeTypes: ['application/pdf'] as const
};

// ─── PDF Magic Bytes ───────────────────────────────────────────────────────────
// PDF files start with %PDF- (hex: 25 50 44 46 2D)
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  detectedMimeType: string | null;
  fileHash: string;
  isSuspicious: boolean;
  suspicionReason?: string;
}

export class FileValidationService {
  /**
   * Validates a file buffer against all security and format rules.
   * Returns structured result; never throws — callers check `.valid`.
   */
  public static validate(
    fileBuffer: Buffer,
    originalFileName: string,
    declaredMimeType: string,
    fileSizeBytes: number
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isSuspicious = false;
    let suspicionReason: string | undefined;

    // ── 1. Compute SHA-256 hash (used for dedup check) ─────────────────────
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // ── 2. File size check ──────────────────────────────────────────────────
    if (fileSizeBytes > FILE_LIMITS.maxFileSizeBytes) {
      errors.push(
        `File too large: ${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB. Maximum allowed: ${FILE_LIMITS.maxFileSizeMB} MB.`
      );
    }

    if (fileSizeBytes === 0) {
      errors.push('Uploaded file is empty (0 bytes).');
    }

    // ── 3. Extension check ──────────────────────────────────────────────────
    const ext = originalFileName.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    if (!FILE_LIMITS.allowedExtensions.includes(ext as any)) {
      errors.push(
        `Unsupported file type: "${ext || 'no extension'}". Only PDF files are accepted.`
      );
    }

    // ── 4. Magic-byte signature check (ignores client MIME claim) ───────────
    const detectedMimeType = this.detectMimeType(fileBuffer);

    if (!detectedMimeType) {
      errors.push(
        'File format unrecognized: the file does not contain a valid PDF signature. ' +
        'Please ensure you are uploading an actual PDF document.'
      );
    } else if (detectedMimeType !== 'application/pdf') {
      errors.push(
        `File content mismatch: the file byte signature indicates "${detectedMimeType}", ` +
        `but only PDF (application/pdf) is accepted. The file extension may have been renamed.`
      );
      isSuspicious = true;
      suspicionReason = `MIME claim "${declaredMimeType}" contradicts byte signature "${detectedMimeType}"`;
    }

    // ── 5. Declared vs detected MIME mismatch warning ───────────────────────
    if (
      detectedMimeType &&
      declaredMimeType &&
      declaredMimeType !== detectedMimeType &&
      !isSuspicious
    ) {
      warnings.push(
        `The browser reported MIME type "${declaredMimeType}" but the file signature indicates "${detectedMimeType}". ` +
        'The detected type has been used for processing.'
      );
    }

    // ── 6. Basic suspicious content scan ────────────────────────────────────
    if (!isSuspicious && fileBuffer.length > 0) {
      const suspicion = this.scanForSuspiciousPatterns(fileBuffer, originalFileName);
      if (suspicion) {
        isSuspicious = true;
        suspicionReason = suspicion;
        warnings.push(
          `Suspicious content detected: ${suspicion}. Document has been flagged for manual review.`
        );
        // We warn and flag but do NOT block — quarantine happens at PO record level via status field
      }
    }

    // ── 7. Minimum sensible size for a PDF (empty PDFs are ~68 bytes) ───────
    if (fileBuffer.length > 0 && fileBuffer.length < 100 && detectedMimeType === 'application/pdf') {
      errors.push('PDF file appears to be corrupted or empty — too small to be a valid document.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      detectedMimeType,
      fileHash,
      isSuspicious,
      suspicionReason
    };
  }

  /**
   * Reads the first bytes of the buffer and identifies the MIME type
   * from magic byte signatures — independent of filename or browser claim.
   */
  private static detectMimeType(buffer: Buffer): string | null {
    if (buffer.length < 5) return null;

    // PDF: %PDF-
    if (buffer.subarray(0, 5).equals(PDF_MAGIC)) {
      return 'application/pdf';
    }

    // PNG: \x89PNG\r\n\x1a\n
    if (
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
      buffer[3] === 0x47 && buffer[4] === 0x0d
    ) {
      return 'image/png';
    }

    // JPEG: \xff\xd8\xff
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    // DOCX / XLSX / ZIP: PK magic
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return 'application/zip';
    }

    // Executables: MZ header
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return 'application/x-msdownload';
    }

    return null;
  }

  /**
   * Scans for suspicious patterns inside the file content.
   * Returns a description if suspicious content is found, null otherwise.
   */
  private static scanForSuspiciousPatterns(buffer: Buffer, fileName: string): string | null {
    const content = buffer.toString('binary');

    // Embedded JavaScript in PDF (common attack vector)
    if (/\/JavaScript\s*<</.test(content) || /\/JS\s*<</.test(content)) {
      return 'Embedded JavaScript detected in PDF document';
    }

    // Embedded executable attachment in PDF
    if (/\/EmbeddedFile\s*<</.test(content) && /\.exe|\.bat|\.cmd|\.vbs|\.ps1/i.test(content)) {
      return 'Potentially executable embedded file attachment detected';
    }

    // Auto-open/Launch actions (PDF phishing pattern)
    if (/\/OpenAction\s*<</.test(content) || /\/Launch\s*<</.test(content)) {
      return 'Auto-open or launch action detected in PDF';
    }

    // Filename looks suspicious (double extensions)
    if (/\.(pdf|jpg)\.(exe|bat|cmd|vbs|ps1)$/i.test(fileName)) {
      return `Suspicious double extension in file name: "${fileName}"`;
    }

    return null;
  }

  /**
   * Computes SHA-256 of a buffer.
   */
  public static computeHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
