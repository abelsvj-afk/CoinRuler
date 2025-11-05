try { require('dotenv').config(); } catch (e) {}
const axios = require('axios');
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const Twilio = require('twilio');
    twilioClient = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (e) {
    console.warn('Twilio package not installed or failed to initialize:', e && e.message ? e.message : e);
  }
}

async function sendSms(to, body) {
  if (!twilioClient) {
    console.log('[SMS - dryrun] to=' + to + ' body=' + body);
    return false;
  }
  try {
    const from = process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER;
    if (!from) throw new Error('TWILIO_FROM not set');
    const msg = await twilioClient.messages.create({ body, from, to });
    return msg;
  } catch (e) {
    console.error('sendSms failed:', e && e.message ? e.message : e);
    return null;
  }
}

async function sendDiscordWebhook(body) {
  const url = process.env.DISCORD_MONITOR_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log('[DiscordWebhook - dryrun]', body);
    return false;
  }
  try {
    await axios.post(url, { content: typeof body === 'string' ? body : JSON.stringify(body) });
    return true;
  } catch (e) {
    console.error('sendDiscordWebhook failed:', e && e.message ? e.message : e);
    return false;
  }
}

module.exports = { sendSms, sendDiscordWebhook };
