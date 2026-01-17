import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  kopisApiKey: process.env.KOPIS_API_KEY || '', // Optional - can be provided via header
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'development',
};

// API key can be provided either via:
// 1. X-Kopis-Api-Key header (recommended for PlayMCP)
// 2. Authorization Bearer token
// 3. KOPIS_API_KEY environment variable (fallback)
console.log('[Config] API Key authentication methods:');
console.log('  1. X-Kopis-Api-Key header (priority)');
console.log('  2. Authorization: Bearer <token>');
console.log('  3. KOPIS_API_KEY env variable (fallback)');

if (!config.kopisApiKey) {
  console.warn('[Config Warning] KOPIS_API_KEY not set in environment. API key must be provided via request headers.');
}