import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  kopisApiKey: process.env.KOPIS_API_KEY || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Validate required configuration
if (!config.kopisApiKey) {
  console.error('[Config Error] KOPIS_API_KEY is required');
  console.error('[Config Error] Please set KOPIS_API_KEY environment variable in Railway');
  process.exit(1);
}