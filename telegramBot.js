/**
 * Telegram Bot Helper Module for Admin Approval Workflow
 * Dual Mode support: Works via local long-polling AND Vercel Serverless Webhook (/api/telegram/webhook)
 */

const https = require('https');
const { supabaseDb } = require('./supabaseClient');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8778978825:AAFoTE5ixdli9HGYVpyArQOIZ-vc7Pkpps4';
let registeredAdminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '6868121119';

let pollingInterval = null;
let lastUpdateId = 0;

function getAdminChatId() {
  return process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || registeredAdminChatId || global.TELEGRAM_ADMIN_CHAT_ID || '6868121119';
}

function setAdminChatId(chatId) {
  if (!chatId) return;
  registeredAdminChatId = String(chatId);
  global.TELEGRAM_ADMIN_CHAT_ID = String(chatId);
}

/**
 * Low-level HTTP client for Telegram API with exponential backoff retry
 */
async function callTelegramApi(method, payload, maxRetries = 3) {
  const data = (payload !== undefined && payload !== null) ? JSON.stringify(payload) : '';
  const baseUrlStr = process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org';
  const targetUrl = `${baseUrlStr.replace(/\/$/, '')}/bot${BOT_TOKEN}/${method}`;
  const parsedUrl = new URL(targetUrl);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : require('http');

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        };

        const req = httpModule.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed);
            } catch (e) {
              resolve({ ok: false, description: 'Invalid JSON from Telegram API' });
            }
          });
        });

        req.on('error', (err) => {
          reject(err);
        });

        if (data) {
          req.write(data);
        }
        req.end();
      });

      return result;
    } catch (err) {
      const isNetworkErr = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.message?.includes('socket disconnected');
      if (attempt < maxRetries && isNetworkErr) {
        const delayMs = attempt * 500;
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      console.warn(`⚠️ [Telegram Bot]: API call '${method}' failed (attempt ${attempt}/${maxRetries}):`, err.message);
      return { ok: false, description: err.message, error: err };
    }
  }
}

/**
 * Send System Startup Notification to Admin Telegram
 */
async function sendStartupNotification() {
  const adminChatId = getAdminChatId();
  if (!adminChatId) return null;

  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

  const text = 
`🚀 <b>SYSTEM RUNNING SUCCESSFULLY!</b> 🚀

<b>AppName:</b> D-Connect Disaster Management System
<b>Status:</b> 🟢 ACTIVE & ONLINE
<b>Time:</b> <code>${nowStr} IST</code>
<b>Admin Chat ID:</b> <code>${adminChatId}</code>

<i>Realtime disaster requests & resource contributions will be forwarded here for instant approval/rejection.</i>`;

  try {
    const res = await callTelegramApi('sendMessage', {
      chat_id: adminChatId,
      text: text,
      parse_mode: 'HTML'
    });
    console.log(`✅ [Telegram Bot]: Startup notification sent to Admin chat #${adminChatId}`);
    return res;
  } catch (err) {
    console.warn('⚠️ [Telegram Bot]: Could not send startup notification:', err.message);
    return null;
  }
}

/**
 * Answer Telegram callback query (removes loading state on button)
 */
async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
  try {
    return await callTelegramApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text,
      show_alert: showAlert
    });
  } catch (err) {
    console.error('Failed to answer callback query:', err.message);
  }
}

/**
 * Edit Telegram message text and remove inline buttons to prevent duplicate clicks
 */
async function editMessageStatus(chatId, messageId, originalText, statusText) {
  try {
    const updatedText = `${originalText}\n\n📌 DECISION: ${statusText}`;
    return await callTelegramApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: updatedText,
      reply_markup: { inline_keyboard: [] }
    });
  } catch (err) {
    console.error('Failed to edit message status:', err.message);
  }
}

/**
 * Send Telegram message for new incident report with inline Approve/Reject buttons
 */
async function sendAdminIncidentNotification(disaster) {
  const adminChatId = getAdminChatId();
  if (!adminChatId) {
    console.warn('⚠️ [Telegram Bot]: TELEGRAM_ADMIN_CHAT_ID not configured. Skipping notification.');
    return null;
  }

  const title = disaster.title || `${disaster.type || 'EMERGENCY'} Incident`;
  const desc = disaster.description || 'No description provided.';
  const location = disaster.location_name || disaster.locationName || `Lat: ${disaster.latitude}, Lon: ${disaster.longitude}`;
  const reporter = disaster.createdByName || disaster.reporterName || 'Citizen Reporter';
  const role = disaster.createdByRole || disaster.reporterRole || 'USER / VOLUNTEER';

  const text = 
`🚨 <b>NEW DISASTER REQUEST / INCIDENT REPORTED</b> 🚨

<b>ID:</b> <code>#${disaster.id}</code>
<b>Type:</b> <code>${disaster.type || 'FLOOD'}</code>
<b>Title:</b> ${escapeHtml(title)}
<b>Description:</b> ${escapeHtml(desc)}
<b>Location:</b> ${escapeHtml(location)} (<code>${disaster.latitude}, ${disaster.longitude}</code>)
<b>Reported By:</b> ${escapeHtml(reporter)} (${escapeHtml(role)})
<b>Current Status:</b> <code>${disaster.status || 'PENDING'}</code>`;

  const payload = {
    chat_id: adminChatId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `inc_approve_${disaster.id}` },
          { text: '❌ Reject', callback_data: `inc_reject_${disaster.id}` }
        ]
      ]
    }
  };

  try {
    const result = await callTelegramApi('sendMessage', payload);
    console.log(`📡 [Telegram Bot]: Incident #${disaster.id} notification sent to Admin chat #${adminChatId}`);
    return result;
  } catch (err) {
    console.error(`❌ [Telegram Bot]: Failed to send incident #${disaster.id} notification:`, err.message);
    return null;
  }
}

/**
 * Send Telegram message for new emergency resource contribution with inline Approve/Reject buttons
 */
async function sendAdminResourceNotification(resource) {
  const adminChatId = getAdminChatId();
  if (!adminChatId) {
    console.warn('⚠️ [Telegram Bot]: TELEGRAM_ADMIN_CHAT_ID not configured. Skipping notification.');
    return null;
  }

  const name = resource.resource_name || resource.resourceName || resource.description || 'Emergency Resource';
  const desc = resource.description || resource.resource_name || 'Emergency Supply Post';
  const qty = `${resource.quantity || 1} ${resource.unit || 'units'}`;
  const location = resource.address || resource.location_name || 'Central Command Pool';
  const provider = resource.providerName || resource.provider_name || 'Relief Agency / Volunteer';

  const text = 
`📦 <b>NEW RESOURCE OFFERED</b> 📦

<b>ID:</b> <code>#${resource.id}</code>
<b>Type:</b> <code>${resource.resource_type || resource.resourceType || 'OTHER'}</code>
<b>Name:</b> ${escapeHtml(name)}
<b>Description:</b> ${escapeHtml(desc)}
<b>Quantity:</b> <b>${escapeHtml(qty)}</b>
<b>Location:</b> ${escapeHtml(location)}
<b>Provided By:</b> ${escapeHtml(provider)}
<b>Current Status:</b> <code>${resource.status || 'PENDING'}</code>`;

  const payload = {
    chat_id: adminChatId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `res_approve_${resource.id}` },
          { text: '❌ Reject', callback_data: `res_reject_${resource.id}` }
        ]
      ]
    }
  };

  try {
    const result = await callTelegramApi('sendMessage', payload);
    console.log(`📡 [Telegram Bot]: Resource #${resource.id} notification sent to Admin chat #${adminChatId}`);
    return result;
  } catch (err) {
    console.error(`❌ [Telegram Bot]: Failed to send resource #${resource.id} notification:`, err.message);
    return null;
  }
}

/**
 * Unified update payload processor (shared by long-polling & Vercel webhook)
 */
async function processTelegramUpdate(body) {
  if (!body) return { success: true, message: 'No body provided' };

  // Handle standard message (e.g. /start command)
  if (body.message && body.message.chat) {
    const chatId = body.message.chat.id;
    const text = (body.message.text || '').trim();

    if (text.startsWith('/start') || text.startsWith('/admin')) {
      setAdminChatId(chatId);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `✅ <b>Admin Chat Registered!</b>\n\nYour Chat ID (<code>${chatId}</code>) is set for incident and resource approval workflows.\n\nYou will receive instant alerts with Approve/Reject buttons when citizens, users, or volunteers submit new disaster requests.`,
        parse_mode: 'HTML'
      });
      return { success: true, message: 'Admin chat ID registered', chatId };
    }

    return { success: true, message: 'Message received' };
  }

  // Handle Callback Query (Inline Button Clicks)
  if (body.callback_query) {
    const callbackQuery = body.callback_query;
    const callbackId = callbackQuery.id;
    const data = (callbackQuery.data || '').trim();
    const message = callbackQuery.message || {};
    const chatId = message.chat ? message.chat.id : (callbackQuery.from ? callbackQuery.from.id : null);
    const fromId = callbackQuery.from ? callbackQuery.from.id : null;
    const messageId = message.message_id;
    const originalText = message.text || '';

    // Security Check: Verify admin chat ID
    const configuredAdminChatId = getAdminChatId();
    const matchesAdmin = [chatId, fromId, message.chat?.id].some(id => id && String(id) === String(configuredAdminChatId));

    if (configuredAdminChatId && !matchesAdmin && (process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID)) {
      console.warn(`🔒 [Telegram Bot]: Unauthorized callback query from chat_id ${chatId} / from_id ${fromId} (Expected: ${configuredAdminChatId})`);
      await answerCallbackQuery(callbackId, '⚠️ Unauthorized: Only authorized Admin can approve/reject.', true);
      return { success: false, error: 'Unauthorized admin chat_id' };
    }

    if (chatId) {
      setAdminChatId(chatId);
    }

    // Flexible parsing for callback data:
    // Formats: inc_approve_123, inc_reject_123, res_approve_123, res_reject_123, approve:123, reject:123, etc.
    let action = null; // 'APPROVED' or 'REJECTED'
    let targetType = 'INCIDENT'; // 'INCIDENT' or 'RESOURCE'
    let targetId = null;

    const lowerData = data.toLowerCase();

    if (lowerData.includes('approve')) {
      action = 'APPROVED';
    } else if (lowerData.includes('reject') || lowerData.includes('deny')) {
      action = 'REJECTED';
    }

    if (lowerData.includes('res') || lowerData.includes('resource')) {
      targetType = 'RESOURCE';
    } else {
      targetType = 'INCIDENT';
    }

    const numericMatch = data.match(/\d+/);
    if (numericMatch) {
      targetId = parseInt(numericMatch[0], 10);
    }

    if (!action || !targetId || isNaN(targetId)) {
      await answerCallbackQuery(callbackId, 'Invalid approval action format.');
      return { success: false, error: 'Bad Request', message: 'Invalid callback data format' };
    }

    const targetStatus = action === 'APPROVED' ? 'VERIFIED_ACTIVE' : 'CANCELLED_BY_ADMIN';

    try {
      let updatedRecord = null;

      if (targetType === 'INCIDENT') {
        updatedRecord = await supabaseDb.updateDisasterStatus(targetId, targetStatus);
      } else if (targetType === 'RESOURCE') {
        const resStatus = action === 'APPROVED' ? 'AVAILABLE' : 'EXHAUSTED';
        updatedRecord = await supabaseDb.updateResource(targetId, {
          status: resStatus
        });
      }

      if (!updatedRecord) {
        throw new Error(`Failed to update ${targetType} #${targetId}`);
      }

      // Audit log approval action in approvals table
      await supabaseDb.logApprovalAction(1, targetId, targetType, action);

      const statusBadge = action === 'APPROVED' ? `✅ APPROVED (${targetStatus})` : `❌ REJECTED (${targetStatus})`;

      // Confirm to Telegram UI
      await answerCallbackQuery(callbackId, `Success: ${targetType} #${targetId} updated to ${targetStatus}`);

      // Edit message text and remove inline buttons to prevent duplicate clicks
      if (chatId && messageId) {
        await editMessageStatus(chatId, messageId, originalText, statusBadge);
      }

      console.log(`✅ [Telegram Bot]: ${targetType} #${targetId} verified & updated to ${targetStatus}`);

      return {
        success: true,
        updatedStatus: targetStatus,
        data: {
          targetType,
          targetId,
          action,
          status: targetStatus,
          updatedRecord
        }
      };
    } catch (err) {
      console.error(`❌ [Telegram Bot Verification Error]: Failed to update ${targetType} #${targetId}:`, err.message || err);
      
      await answerCallbackQuery(callbackId, `❌ Action Failed: ${err.message || 'Could not update status'}`, true);

      return {
        success: false,
        error: 'Update Failed',
        message: err.message || 'Could not update status'
      };
    }
  }

  return { success: true, message: 'Update processed' };
}

/**
 * Handle HTTP Webhook endpoint (/api/telegram/webhook)
 */
async function handleTelegramWebhook(req, res) {
  let body = req.body;

  // Handle case where body is not pre-parsed (standard Node http.createServer)
  if (!body && req && typeof req.on === 'function') {
    let raw = '';
    await new Promise((resolve) => {
      req.on('data', chunk => raw += chunk.toString());
      req.on('end', () => {
        try { body = JSON.parse(raw); } catch (e) { body = {}; }
        resolve();
      });
      req.on('error', () => { body = {}; resolve(); });
    });
  }

  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const result = await processTelegramUpdate(body);
  const statusCode = result.error === 'Unauthorized admin chat_id' ? 403 : (result.success ? 200 : 500);

  return sendJsonResponse(res, statusCode, result);
}

/**
 * Start long-polling loop for local development environment
 */
function startPollingLoop() {
  if (pollingInterval) return;

  // Clear any active webhooks so getUpdates works in local mode
  callTelegramApi('deleteWebhook', { drop_pending_updates: false })
    .then(() => {
      console.log('🤖 [Telegram Bot]: Polling mode enabled for local server.');
    })
    .catch(err => console.warn('Telegram deleteWebhook warning:', err.message));

  pollingInterval = setInterval(async () => {
    try {
      const res = await callTelegramApi('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 1,
        allowed_updates: ['message', 'callback_query']
      });

      if (res && res.ok && Array.isArray(res.result) && res.result.length > 0) {
        for (const update of res.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          await processTelegramUpdate(update);
        }
      }
    } catch (err) {
      // Ignore network hiccup logs during polling
    }
  }, 2500);
}

/**
 * Initialize Telegram Bot on system startup
 */
async function initTelegramBot() {
  console.log('🤖 Initializing Telegram Bot Service...');
  
  // Set fallback Admin chat ID
  setAdminChatId(process.env.TELEGRAM_ADMIN_CHAT_ID || '6868121119');

  // Start polling loop for local server
  startPollingLoop();

  // Send startup notification to admin
  await sendStartupNotification();
}

function sendJsonResponse(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, apikey'
  });
  res.end(JSON.stringify(data));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  initTelegramBot,
  sendStartupNotification,
  sendAdminIncidentNotification,
  sendAdminResourceNotification,
  handleTelegramWebhook,
  processTelegramUpdate,
  setAdminChatId,
  getAdminChatId,
  callTelegramApi
};
