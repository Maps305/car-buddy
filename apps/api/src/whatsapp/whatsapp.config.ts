import { registerAs } from '@nestjs/config';

export default registerAs('whatsapp', () => ({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
  appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? 'v26.0',
  skipSignatureCheck: process.env.NODE_ENV !== 'production' && process.env.WHATSAPP_SKIP_SIGNATURE === 'true',
  maxMediaBytes: Number(process.env.WHATSAPP_MAX_MEDIA_BYTES ?? 25 * 1024 * 1024),
}));
