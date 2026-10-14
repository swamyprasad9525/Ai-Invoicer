import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../config/env';

let memoryServer: MongoMemoryServer | null = null;

export async function connectDB(): Promise<typeof mongoose> {
  let uri = config.mongoUri;

  if (!uri) {
    console.log('[DB] No MONGODB_URI provided. Initializing local in-memory MongoDB server...');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.log(`[DB] In-memory MongoDB running at: ${uri}`);
  } else {
    console.log(`[DB] Connecting to MongoDB instance at ${uri.replace(/:[^:]*@/, ':****@')}...`);
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    dbName: 'invoiceai'
  });

  console.log('[DB] Successfully connected to MongoDB database.');
  return mongoose;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
  }
}
