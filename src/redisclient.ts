import Redis from 'ioredis';
import { config } from './config/config';


// Create and configure your Redis client
const redisClient = new Redis(config.redisUrl);

// Log errors from Redis
redisClient.on('error', (err) => {
  console.error('Redis error:', err);
  process.exit(1);
});


// Ensure that Redis is connected before proceeding
redisClient.on('connect', () => {
  console.log('Redis client connected');
});

export { redisClient };
