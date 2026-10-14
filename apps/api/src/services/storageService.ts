/**
 * StorageService — Secure, tenant-isolated document storage.
 *
 * Strategy:
 *   - When AWS_S3_BUCKET + AWS_REGION are set: uses AWS S3 (or any S3-compatible endpoint).
 *   - Otherwise: falls back to local disk storage under config.uploadDir.
 *
 * In both cases, routes NEVER expose permanent public URLs.
 * File retrieval is always through time-limited signed URLs or
 * short-lived signed tokens verified by the API itself.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/env';

// ─── Optional S3 imports (only loaded when env vars are present) ─────────────
let S3Client: any, PutObjectCommand: any, GetObjectCommand: any, DeleteObjectCommand: any;
let getSignedUrl: any;
let s3Client: any = null;

async function initS3() {
  if (s3Client) return;
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return;

  try {
    const s3Module = await import('@aws-sdk/client-s3');
    const presignModule = await import('@aws-sdk/s3-request-presigner');
    S3Client = s3Module.S3Client;
    PutObjectCommand = s3Module.PutObjectCommand;
    GetObjectCommand = s3Module.GetObjectCommand;
    DeleteObjectCommand = s3Module.DeleteObjectCommand;
    getSignedUrl = presignModule.getSignedUrl;

    s3Client = new S3Client({
      region,
      endpoint: process.env.AWS_ENDPOINT_URL || undefined, // MinIO support
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      },
      forcePathStyle: !!process.env.AWS_ENDPOINT_URL // required for MinIO
    });
    console.log(`[STORAGE] S3 storage initialized. Bucket: ${bucket}, Region: ${region}`);
  } catch (err) {
    console.warn('[STORAGE] S3 initialization failed. Falling back to local disk.', err);
    s3Client = null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StoredFile {
  storageKey: string;   // Internal reference (never exposes real path)
  storageBackend: 'S3' | 'LOCAL';
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
}

export interface UploadParams {
  tenantId: string;
  fileBuffer: Buffer;
  originalFileName: string;
  mimeType: string;
  fileHash: string;
}

// ─── Signed download token store (in-memory; survives process lifetime) ──────
const signedTokens = new Map<string, { storageKey: string; tenantId: string; expiresAt: number }>();

export class StorageService {
  private static readonly SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * Stores an uploaded file buffer securely, namespaced under the tenant.
   * Returns the internal storage key (never publicly guessable).
   */
  public static async storeFile(params: UploadParams): Promise<StoredFile> {
    await initS3();

    const ext = path.extname(params.originalFileName).toLowerCase();
    // Storage key: <tenantId>/<hash>.<ext>  — hash-based to prevent enumeration
    const storageKey = `${params.tenantId}/${params.fileHash}${ext}`;

    if (s3Client && process.env.AWS_S3_BUCKET) {
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: storageKey,
        Body: params.fileBuffer,
        ContentType: params.mimeType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          tenantId: params.tenantId,
          originalFileName: params.originalFileName,
          fileHash: params.fileHash
        }
      }));
      console.log(`[STORAGE] Stored to S3: ${storageKey}`);
    } else {
      // Local disk storage
      const tenantDir = path.join(config.uploadDir, params.tenantId);
      if (!fs.existsSync(tenantDir)) {
        fs.mkdirSync(tenantDir, { recursive: true });
      }
      const localPath = path.join(tenantDir, `${params.fileHash}${ext}`);
      fs.writeFileSync(localPath, params.fileBuffer);
      console.log(`[STORAGE] Stored locally: ${localPath}`);
    }

    return {
      storageKey,
      storageBackend: s3Client ? 'S3' : 'LOCAL',
      originalFileName: params.originalFileName,
      mimeType: params.mimeType,
      sizeBytes: params.fileBuffer.length,
      fileHash: params.fileHash
    };
  }

  /**
   * Issues a short-lived signed download token for a specific document.
   * The actual file content is served by the API — never via permanent public URL.
   *
   * Security: validates tenantId matches the stored file's tenant prefix.
   */
  public static async generateSignedDownloadToken(
    storageKey: string,
    requestingTenantId: string
  ): Promise<string> {
    // Tenant prefix check — storageKey always starts with tenantId/
    if (!storageKey.startsWith(`${requestingTenantId}/`)) {
      throw new Error('Access denied: Storage key does not belong to your tenant.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    signedTokens.set(token, {
      storageKey,
      tenantId: requestingTenantId,
      expiresAt: Date.now() + this.SIGNED_URL_TTL_MS
    });

    // Clean up expired tokens periodically
    this.cleanupExpiredTokens();
    return token;
  }

  /**
   * Resolves a signed token back to a readable file stream.
   * Returns null if token is invalid, expired, or tenant doesn't match.
   */
  public static async resolveSignedToken(
    token: string,
    requestingTenantId: string
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
    await initS3();

    const entry = signedTokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      signedTokens.delete(token);
      return null;
    }
    if (entry.tenantId !== requestingTenantId) return null;

    // Consume token (one-time use per request window)
    signedTokens.delete(token);

    const { storageKey } = entry;
    const ext = path.extname(storageKey).toLowerCase();
    const mimeType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
    const fileName = path.basename(storageKey);

    if (s3Client && process.env.AWS_S3_BUCKET) {
      const { Body } = await s3Client.send(new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: storageKey
      }));
      const chunks: Buffer[] = [];
      for await (const chunk of Body as any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return { buffer: Buffer.concat(chunks), mimeType, fileName };
    } else {
      // Local disk
      const localPath = path.join(config.uploadDir, storageKey);
      if (!fs.existsSync(localPath)) return null;
      return { buffer: fs.readFileSync(localPath), mimeType, fileName };
    }
  }

  /**
   * Reads file directly (internal use — worker processes, not HTTP responses).
   * Validates tenant prefix before returning data.
   */
  public static async readFileInternal(storageKey: string, tenantId: string): Promise<Buffer> {
    await initS3();

    if (!storageKey.startsWith(`${tenantId}/`)) {
      throw new Error('Tenant isolation violation: unauthorized storage access.');
    }

    if (s3Client && process.env.AWS_S3_BUCKET) {
      const { Body } = await s3Client.send(new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: storageKey
      }));
      const chunks: Buffer[] = [];
      for await (const chunk of Body as any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } else {
      const localPath = path.join(config.uploadDir, storageKey);
      if (!fs.existsSync(localPath)) {
        throw new Error(`File not found in local storage: ${storageKey}`);
      }
      return fs.readFileSync(localPath);
    }
  }

  /**
   * Deletes a stored file. Used when a PO record is hard-deleted.
   */
  public static async deleteFile(storageKey: string, tenantId: string): Promise<void> {
    await initS3();

    if (!storageKey.startsWith(`${tenantId}/`)) {
      throw new Error('Tenant isolation violation: unauthorized delete attempt.');
    }

    if (s3Client && process.env.AWS_S3_BUCKET) {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: storageKey
      }));
    } else {
      const localPath = path.join(config.uploadDir, storageKey);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }
  }

  private static cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [token, entry] of signedTokens.entries()) {
      if (now > entry.expiresAt) {
        signedTokens.delete(token);
      }
    }
  }
}
