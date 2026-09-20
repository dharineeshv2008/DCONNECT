/**
 * Telegram Bot Helper Module for Admin Approval Workflow
 * Handles Telegram Bot API calls, webhook processing, admin security validation, and Supabase status updates.
 */

const https = require('https');
const { supabaseDb } = require('./supabaseClient');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8778978825:AAFoTE5ixdli9HGYVpyArQOIZ-vc7Pkpps4';
let registeredAdminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || null;

function getAdminChatId() {
  return process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || registeredAdminChatId || global.TELEGRAM_ADMIN_CHAT_ID || null;
}

function setAdminChatId(chatId) {
  registeredAdminChatId = String(chatId);
  global.TELEGRAM_ADMIN_CHAT_ID = String(chatId);
}

/**
 * Low-level HTTP client for Telegram API
 */
function callTelegramApi(method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
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
      console.error('Telegram API error:', err);
      reject(err);
    });

    req.write(data);
    req.end();
  });
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
    console.error('Failed to answer callback query:', err);
  }
}

/**
 * Edit Telegram message text and remove inline buttons to prevent duplicate clicks
 */
async function editMessageStatus(chatId, messageId, originalText, statusText) {
  try {
    const updatedText = `${originalText}\n\n📌 <b>DECISION:</b> ${statusText}`;
    return await callTelegramApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: updatedText,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    });
  } catch (err) {
    console.error('Failed to edit message status:', err);
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

  const text = 
`🚨 <b>NEW INCIDENT REPORTED</b> 🚨

<b>ID:</b> <code>#${disaster.id}</code>
<b>Type:</b> <code>${disaster.type || 'FLOOD'}</code>
<b>Title:</b> ${escapeHtml(title)}
<b>Description:</b> ${escapeHtml(desc)}
<b>Location:</b> ${escapeHtml(location)} (<code>${disaster.latitude}, ${disaster.longitude}</code>)
<b>Reported By:</b> ${escapeHtml(reporter)}
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
    console.log(`📡 [Telegram Bot]: Incident #${disaster.id} notification sent to chat ${adminChatId}`);
    return result;
  } catch (err) {
    console.error(`❌ [Telegram Bot]: Failed to send incident #${disaster.id} notification:`, err);
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
  const provider = resource.providerName || resource.provider_name || 'Relief Agency';

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
    console.log(`📡 [Telegram Bot]: Resource #${resource.id} notification sent to chat ${adminChatId}`);
    return result;
  } catch (err) {
    console.error(`❌ [Telegram Bot]: Failed to send resource #${resource.id} notification:`, err);
    return null;
  }
}

/**
 * Process incoming Telegram Webhook payload (/api/telegram/webhook)
 */
async function handleTelegramWebhook(req, res) {
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  // Handle standard message (e.g. /start command to auto-register admin chat ID)
  if (body.message && body.message.chat) {
    const chatId = body.message.chat.id;
    const text = (body.message.text || '').trim();

    if (text.startsWith('/start') || text.startsWith('/admin')) {
      setAdminChatId(chatId);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `✅ <b>Admin Chat Registered!</b>\n\nYour Chat ID (<code>${chatId}</code>) is now set for incident and resource approval workflows.\n\nYou will receive instant alerts with Approve/Reject buttons when citizens or relief agencies submit new reports.`,
        parse_mode: 'HTML'
      });
      return sendJsonResponse(res, 200, { success: true, message: 'Admin chat ID registered', chatId });
    }

    return sendJsonResponse(res, 200, { success: true, message: 'Message received' });
  }

  // Handle Callback Query (Inline Button Clicks)
  if (body.callback_query) {
    const callbackQuery = body.callback_query;
    const callbackId = callbackQuery.id;
    const data = callbackQuery.data || '';
    const message = callbackQuery.message || {};
    const chatId = message.chat ? message.chat.id : (callbackQuery.from ? callbackQuery.from.id : null);
    const messageId = message.message_id;
    const originalText = message.text || '';

    // Security Check: Verify admin chat ID
    const configuredAdminChatId = getAdminChatId();
    if (configuredAdminChatId && String(chatId) !== String(configuredAdminChatId)) {
      console.warn(`🔒 [Telegram Webhook]: Unauthorized callback query from chat_id ${chatId} (Expected: ${configuredAdminChatId})`);
      await answerCallbackQuery(callbackId, '⚠️ Unauthorized: Only authorized Admin can approve/reject.', true);
      return sendJsonResponse(res, 403, { success: false, error: 'Unauthorized admin chat_id' });
    }

    // Auto-bind admin chat ID if not set yet
    if (!configuredAdminChatId && chatId) {
      setAdminChatId(chatId);
    }

    // Parse callback data: inc_approve_<id>, inc_reject_<id>, res_approve_<id>, res_reject_<id>
    let action = null; // 'APPROVED' or 'REJECTED'
    let targetType = null; // 'INCIDENT' or 'RESOURCE'
    let targetId = null;

    if (data.startsWith('inc_approve_')) {
      action = 'APPROVED';
      targetType = 'INCIDENT';
      targetId = parseInt(data.replace('inc_approve_', ''));
    } else if (data.startsWith('inc_reject_')) {
      action = 'REJECTED';
      targetType = 'INCIDENT';
      targetId = parseInt(data.replace('inc_reject_', ''));
    } else if (data.startsWith('res_approve_')) {
      action = 'APPROVED';
      targetType = 'RESOURCE';
      targetId = parseInt(data.replace('res_approve_', ''));
    } else if (data.startsWith('res_reject_')) {
      action = 'REJECTED';
      targetType = 'RESOURCE';
      targetId = parseInt(data.replace('res_reject_', ''));
    }

    if (!action || isNaN(targetId)) {
      await answerCallbackQuery(callbackId, 'Invalid approval action.');
      return sendJsonResponse(res, 400, { success: false, error: 'Bad Request', message: 'Invalid callback data format' });
    }

    // Map Action to Target Status: APPROVED -> VERIFIED_ACTIVE, REJECTED -> CANCELLED
    const targetStatus = action === 'APPROVED' ? 'VERIFIED_ACTIVE' : 'CANCELLED';

    try {
      let updatedRecord = null;

      if (targetType === 'INCIDENT') {
        updatedRecord = await supabaseDb.updateDisaster(targetId, {
          status: targetStatus,
          updated_at: new Date().toISOString()
        });
      } else if (targetType === 'RESOURCE') {
        updatedRecord = await supabaseDb.updateResource(targetId, {
          status: targetStatus
        });
      }

      const statusBadge = action === 'APPROVED' ? '✅ APPROVED (VERIFIED_ACTIVE)' : '❌ REJECTED (CANCELLED)';
      
      // Answer button spinner immediately
      await answerCallbackQuery(callbackId, `${targetType} #${targetId} ${action}: status updated to ${targetStatus}`);

      // Edit message text and remove buttons to prevent duplicate requests
      if (chatId && messageId) {
        await editMessageStatus(chatId, messageId, originalText, statusBadge);
      }

      console.log(`✅ [Telegram Webhook]: ${targetType} #${targetId} updated to ${targetStatus} via Telegram admin approval.`);

      return sendJsonResponse(res, 200, {
        success: true,
        message: `${targetType} #${targetId} status updated to ${targetStatus}`,
        data: {
          targetType,
          targetId,
          action,
          status: targetStatus,
          updatedRecord
        }
      });
    } catch (err) {
      console.error(`❌ [Telegram Webhook Error]: Failed to update ${targetType} #${targetId}:`, err);
      await answerCallbackQuery(callbackId, `Error updating ${targetType}: ${err.message}`, true);
      return sendJsonResponse(res, 500, {
        success: false,
        error: 'Internal Server Error',
        message: err.message
      });
    }
  }

  return sendJsonResponse(res, 200, { success: true, message: 'Webhook endpoint active' });
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
  sendAdminIncidentNotification,
  sendAdminResourceNotification,
  handleTelegramWebhook,
  setAdminChatId,
  getAdminChatId,
  callTelegramApi
};
