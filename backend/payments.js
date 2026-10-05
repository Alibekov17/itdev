// Оплата размещения вакансии через Telegram Stars (Bot API, без сторонних библиотек).
//
// Если BOT_TOKEN задан — создаём реальный инвойс и слушаем обновления (polling).
// Если нет — работает demo-режим: оплата подтверждается вручную через
// POST /api/payments/:id/demo-confirm (см. index.js).

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const PRICE_STARS = Math.max(1, Number(process.env.JOB_POST_PRICE_STARS || 100));

const enabled = Boolean(BOT_TOKEN);
const apiBase = () => `https://api.telegram.org/bot${BOT_TOKEN}`;

async function callTelegram(method, body) {
  const res = await fetch(`${apiBase()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

// Создаёт ссылку на оплату (Telegram Stars, currency = XTR).
async function createInvoiceLink({ title, description, payload, amount = PRICE_STARS }) {
  const data = await callTelegram('createInvoiceLink', {
    title: title.slice(0, 32),
    description: description.slice(0, 255),
    payload,
    currency: 'XTR',
    prices: [{ label: 'Размещение вакансии', amount }],
  });
  if (!data.ok) {
    throw new Error(`createInvoiceLink: ${data.description || 'unknown error'}`);
  }
  return data.result; // URL для tg.openInvoice
}

async function answerPreCheckoutQuery(preCheckoutQueryId, ok = true, errorMessage) {
  return callTelegram('answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(errorMessage ? { error_message: errorMessage } : {}),
  });
}

// Длинный polling getUpdates. onUpdate(update) вызывается для каждого апдейта.
function startPolling(onUpdate) {
  if (!enabled) return;
  let offset = 0;
  let stopped = false;

  async function loop() {
    while (!stopped) {
      try {
        const data = await callTelegram('getUpdates', {
          offset,
          timeout: 25,
          allowed_updates: ['message', 'pre_checkout_query'],
        });
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            try {
              await onUpdate(update);
            } catch (e) {
              console.error('Ошибка обработки апдейта:', e.message);
            }
          }
        } else if (!data.ok) {
          console.error('getUpdates error:', data.description);
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (e) {
        console.error('polling error:', e.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  loop();
  console.log('[payments] Telegram polling запущен (Stars)');
}

module.exports = {
  enabled,
  PRICE_STARS,
  createInvoiceLink,
  answerPreCheckoutQuery,
  startPolling,
};
