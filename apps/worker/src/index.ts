import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('=======================================================');
console.log('  ⚙️  INVOICEAI Background Worker Service Initialized');
console.log('  🕒 Ready to process extraction & rendering queues');
console.log('=======================================================');

export function startWorker() {
  console.log('[WORKER] Standing by for asynchronous tasks...');
}

if (require.main === module) {
  startWorker();
}
