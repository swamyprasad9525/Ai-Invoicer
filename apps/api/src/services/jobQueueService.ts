/**
 * JobQueueService — BullMQ-backed async processing with in-process fallback.
 *
 * Strategy:
 *   - When REDIS_URL is set: uses BullMQ (Redis-backed). Full persistence, retries, UI dashboards.
 *   - When REDIS_URL is not set: uses an in-process EventEmitter queue.
 *     — jobs run async in-process with simulated retry semantics.
 *     — all job records are persisted in MongoDB (JobModel) so status is visible.
 *     — this lets dev/test work without any Redis installation.
 *
 * Worker processors register themselves via JobQueueService.registerProcessor().
 */

import { EventEmitter } from 'events';
import mongoose, { Schema, Document } from 'mongoose';

// ─── Job Document Model ───────────────────────────────────────────────────────
export interface IJob {
  name: string;
  data: Record<string, any>;
  tenantId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  attempts: number;
  maxAttempts: number;
  result?: any;
  failureReason?: string;
  failureStack?: string;
  completedAt?: Date;
  failedAt?: Date;
  nextRetryAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface JobDocument extends IJob, Document {}

const JobSchema = new Schema<JobDocument>(
  {
    name: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    tenantId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['waiting', 'active', 'completed', 'failed', 'delayed'],
      default: 'waiting',
      index: true
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    result: { type: Schema.Types.Mixed },
    failureReason: { type: String },
    failureStack: { type: String },
    completedAt: { type: Date },
    failedAt: { type: Date },
    nextRetryAt: { type: Date }
  },
  { timestamps: true }
);

JobSchema.index({ tenantId: 1, status: 1 });
JobSchema.index({ name: 1, status: 1 });

// Use a conditional model registration to avoid Mongoose "Cannot overwrite model" errors in tests
export const JobModel: mongoose.Model<JobDocument> =
  mongoose.models['Job'] ||
  mongoose.model<JobDocument>('Job', JobSchema);

// ─── Processor Registry ───────────────────────────────────────────────────────
type JobProcessor = (jobData: Record<string, any>, tenantId: string, jobId: string) => Promise<any>;
const processors = new Map<string, JobProcessor>();

// ─── In-process queue bus ─────────────────────────────────────────────────────
const bus = new EventEmitter();
bus.setMaxListeners(50);

// ─── BullMQ optional ─────────────────────────────────────────────────────────
let Queue: any, Worker: any, bullQueue: any, bullWorker: any;

async function initBullMQ(queueName: string): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || bullQueue) return !!bullQueue;

  try {
    const bullmq = await import('bullmq');
    Queue = bullmq.Queue;
    Worker = bullmq.Worker;

    const connection = { url: redisUrl };

    bullQueue = new Queue(queueName, { connection });

    bullWorker = new Worker(
      queueName,
      async (job: any) => {
        const { jobDbId, jobName, data, tenantId } = job.data;
        return runProcessor(jobName, data, tenantId, jobDbId);
      },
      {
        connection,
        concurrency: 5,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 }
        }
      }
    );

    bullWorker.on('completed', async (job: any, result: any) => {
      await JobModel.findByIdAndUpdate(job.data.jobDbId, {
        status: 'completed',
        result,
        completedAt: new Date()
      });
    });

    bullWorker.on('failed', async (job: any, err: Error) => {
      const isLastAttempt = job.attemptsMade >= (job.opts?.attempts || 3);
      await JobModel.findByIdAndUpdate(job.data.jobDbId, {
        status: isLastAttempt ? 'failed' : 'delayed',
        failureReason: err.message,
        failureStack: err.stack?.substring(0, 2000),
        failedAt: isLastAttempt ? new Date() : undefined,
        nextRetryAt: isLastAttempt ? undefined : new Date(Date.now() + 5000)
      });
    });

    console.log(`[QUEUE] BullMQ initialized with Redis: ${redisUrl}`);
    return true;
  } catch (err: any) {
    console.warn(`[QUEUE] BullMQ unavailable (${err.message}). Using in-process fallback queue.`);
    return false;
  }
}

// ─── In-process job runner ────────────────────────────────────────────────────
async function runProcessor(
  jobName: string,
  data: Record<string, any>,
  tenantId: string,
  jobDbId: string
): Promise<any> {
  const processor = processors.get(jobName);
  if (!processor) {
    throw new Error(`No processor registered for job type: "${jobName}"`);
  }
  return processor(data, tenantId, jobDbId);
}

async function processInProcess(jobDbId: string): Promise<void> {
  const job = await JobModel.findById(jobDbId);
  if (!job) return;

  const MAX_RETRIES = job.maxAttempts;
  const RETRY_DELAYS = [2000, 8000, 30000]; // Exponential-ish

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await JobModel.findByIdAndUpdate(jobDbId, {
        status: 'active',
        attempts: attempt
      });

      const result = await runProcessor(job.name, job.data, job.tenantId, jobDbId);

      await JobModel.findByIdAndUpdate(jobDbId, {
        status: 'completed',
        result,
        completedAt: new Date()
      });
      return;
    } catch (err: any) {
      const isLast = attempt >= MAX_RETRIES;
      console.error(
        `[QUEUE] Job ${jobDbId} (${job.name}) attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`
      );

      if (isLast) {
        await JobModel.findByIdAndUpdate(jobDbId, {
          status: 'failed',
          failureReason: err.message,
          failureStack: err.stack?.substring(0, 2000),
          failedAt: new Date()
        });
        return;
      }

      const delay = RETRY_DELAYS[attempt - 1] || 30000;
      await JobModel.findByIdAndUpdate(jobDbId, {
        status: 'delayed',
        failureReason: err.message,
        nextRetryAt: new Date(Date.now() + delay)
      });

      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
const QUEUE_NAME = 'invoiceai-jobs';
let bullMQReady = false;

export class JobQueueService {
  /**
   * Initialize the queue (call once at server startup).
   */
  public static async init(): Promise<void> {
    bullMQReady = await initBullMQ(QUEUE_NAME);

    if (!bullMQReady) {
      // In-process queue: listen for job dispatch events
      bus.on('job:dispatch', async (jobDbId: string) => {
        // Small delay so HTTP response can return before processing starts
        setTimeout(() => processInProcess(jobDbId), 100);
      });
      console.log('[QUEUE] In-process fallback queue ready.');
    }
  }

  /**
   * Register a processor function for a named job type.
   * Must be called before any jobs of that type are enqueued.
   */
  public static registerProcessor(jobName: string, processor: JobProcessor): void {
    processors.set(jobName, processor);
    console.log(`[QUEUE] Registered processor for: "${jobName}"`);
  }

  /**
   * Enqueue a new job. Creates a persisted JobModel record in MongoDB
   * regardless of backend (BullMQ or in-process).
   *
   * Always includes tenantId in job data to preserve tenant context in workers.
   */
  public static async enqueue(params: {
    name: string;
    data: Record<string, any>;
    tenantId: string;
    maxAttempts?: number;
  }): Promise<string> {
    const jobDoc = await JobModel.create({
      name: params.name,
      data: { ...params.data, tenantId: params.tenantId }, // tenant context always embedded
      tenantId: params.tenantId,
      status: 'waiting',
      attempts: 0,
      maxAttempts: params.maxAttempts || 3
    });

    const jobDbId = jobDoc._id.toString();

    if (bullMQReady && bullQueue) {
      await bullQueue.add(
        params.name,
        { jobDbId, jobName: params.name, data: params.data, tenantId: params.tenantId },
        { jobId: jobDbId, attempts: params.maxAttempts || 3 }
      );
    } else {
      bus.emit('job:dispatch', jobDbId);
    }

    console.log(`[QUEUE] Enqueued job "${params.name}" (${jobDbId}) for tenant ${params.tenantId}`);
    return jobDbId;
  }

  /**
   * Retry a failed job manually.
   * Creates a fresh JobModel record derived from the failed one.
   */
  public static async retryJob(jobDbId: string, requestingTenantId: string): Promise<string> {
    const original = await JobModel.findById(jobDbId);
    if (!original) throw new Error('Job not found.');
    if (original.tenantId !== requestingTenantId) {
      throw new Error('Access denied: Job does not belong to your tenant.');
    }
    if (original.status !== 'failed') {
      throw new Error(`Cannot retry job with status "${original.status}". Only failed jobs can be retried.`);
    }

    return this.enqueue({
      name: original.name,
      data: original.data,
      tenantId: original.tenantId,
      maxAttempts: original.maxAttempts
    });
  }

  /**
   * Fetch paginated job history for a tenant.
   */
  public static async getJobsForTenant(
    tenantId: string,
    options: { status?: string; limit?: number; skip?: number } = {}
  ): Promise<{ jobs: JobDocument[]; total: number }> {
    const filter: any = { tenantId };
    if (options.status) filter.status = options.status;

    const [jobs, total] = await Promise.all([
      JobModel.find(filter)
        .sort({ createdAt: -1 })
        .limit(options.limit || 20)
        .skip(options.skip || 0),
      JobModel.countDocuments(filter)
    ]);

    return { jobs, total };
  }

  /**
   * Get a specific job, verifying tenant ownership.
   */
  public static async getJob(jobId: string, tenantId: string): Promise<JobDocument | null> {
    return JobModel.findOne({ _id: jobId, tenantId });
  }
}
