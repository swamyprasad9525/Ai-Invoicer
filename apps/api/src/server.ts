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
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount modular API routes
app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/customers', customerRouter);
app.use('/api/description-rules', descriptionRuleRouter);
app.use('/api/purchase-orders', purchaseOrderRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/audit-logs', auditRouter);

// Start server
async function bootstrap() {
  try {
    await connectDB();
    await seedPilotData();

    app.listen(config.port, () => {
      console.log(`=======================================================`);
      console.log(`  🚀 INVOICEAI Enterprise API running on port ${config.port}`);
      console.log(`  🔗 Health: http://localhost:${config.port}/api/health`);
      console.log(`  🏢 Pilot Tenant: Swamy Slabs Industries`);
      console.log(`  👤 Default Login: admin@swamyslabs.com / admin123`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal API bootstrap error:', err);
    process.exit(1);
  }
}

bootstrap();

export default app;
