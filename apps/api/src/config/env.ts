import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  jwtSecret: process.env.JWT_SECRET || 'invoiceai-super-secret-jwt-key-2026',
  mongoUri: process.env.MONGODB_URI || '', // If empty, MongoMemoryServer is launched automatically
  uploadDir: path.resolve(__dirname, '../../uploads'),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};
