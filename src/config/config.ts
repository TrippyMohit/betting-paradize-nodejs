import { config as conf } from "dotenv";
conf();

const _config = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.MONGOURL,
  env: process.env.NODE_ENV,
  jwtSecret: process.env.JWT_SECRET,
  adminApiKey: process.env.ADMIN_API_KEY,
  oddsApi: {
    url: process.env.ODDS_API_URL,
    key: process.env.ODDS_API_KEY,
  },
  betCommission: process.env.BET_COMMISSION,
  redisUrl:
    process.env.NODE_ENV === "development"
      ? "redis://localhost:6379"
      : process.env.REDIS_URL,
  sentToMail: process.env.SENT_TO_MAIL,
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_REGION,
  emailSource: process.env.EMAIL_SOURCE,
  hosted_url_cors: process.env.HOSTED_URL_CORS,
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_NAME_API_KEY,
  api_secret: process.env.CLOUDINARY_NAME_API_SECRET,
  cloud_folder: process.env.CLOUDINARY_FOLDER_NAME,
};

export const config = Object.freeze(_config);

if (['production'].includes(process.env.NODE_ENV)) {
  console.log = () => {};
}