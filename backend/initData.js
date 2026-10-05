const crypto = require('crypto');

/**
 * Проверка initData, пришедшего из Telegram Mini App.
 *
 * Алгоритм Telegram:
 *   secret_key = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN)
 *   hash       = HMAC_SHA256(key=secret_key,   message=data_check_string)
 * где data_check_string — все поля initData, кроме hash, отсортированные по ключу
 * и склеенные через "\n" в формате "key=value".
 *
 * @param {string} initData — строка tg.initData
 * @param {string} botToken — токен бота
 * @returns {object|null} объект пользователя или null, если подпись неверна/устарела
 */
function validateInitData(initData, botToken) {
  if (typeof initData !== 'string' || initData.length === 0) return null;
  if (typeof botToken !== 'string' || botToken.length === 0) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // Подпись не должна быть старше 24 часов.
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  try {
    const userRaw = params.get('user');
    return userRaw ? JSON.parse(userRaw) : {};
  } catch {
    return null;
  }
}

module.exports = { validateInitData };
