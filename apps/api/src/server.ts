import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { connectDB } from './db/connection';
import { seedPilotData } from './scripts/seed';
import { authRouter } from './routes/authRoutes';
import { tenantRouter } from './routes/tenantRoutes';
import { customerRouter } from './routes/customerRoutes';
import { descriptionRuleRouter } from './routes/descriptionRuleRoutes';
import { purchaseOrderRouter } from './routes/purchaseOrderRoutes';
import { invoiceRouter } from './routes/invoiceRoutes';
import { auditRouter } from './routes/auditRoutes';
import { jobRouter } from './routes/jobRoutes';
import { JobQueueService } from './services/jobQueueService';
import { registerPOIngestionWorker } from './services/poIngestionWorker';

import cookieParser from 'cookie-parser';

const app = express();

// Standard middleware
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'InvoiceAI Core API',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/customers', customerRouter);
app.use('/api/description-rules', descriptionRuleRouter);
app.use('/api/purchase-orders', purchaseOrderRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/jobs', jobRouter);

// Global 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API_ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error.',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

async function bootstrap() {
  try {
    await connectDB();

    // Register background job workers
    registerPOIngestionWorker();

    // Initialize job queue (BullMQ if Redis available, in-process fallback otherwise)
    await JobQueueService.init();

    // Seed pilot data
    await seedPilotData();

    app.listen(config.port, () => {
      console.log(`=======================================================`);
      console.log(`  🚀 INVOICEAI API v2.0 running on port ${config.port}`);
      console.log(`  🔗 Health: http://localhost:${config.port}/api/health`);
      console.log(`  🏢 Pilot Tenant: Swamy Slabs Industries`);
      console.log(`  👤 Login: admin@swamyslabs.com / admin123`);
      console.log(`  📦 Storage: ${process.env.AWS_S3_BUCKET ? 'S3' : 'Local disk'}`);
      console.log(`  📬 Queue: ${process.env.REDIS_URL ? 'BullMQ (Redis)' : 'In-process fallback'}`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal API bootstrap error:', err);
    process.exit(1);
  }
}

bootstrap();

export default app;
