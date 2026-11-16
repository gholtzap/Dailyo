import {createHmac, timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const signature = /^[A-Za-z0-9_-]{43}$/;
const maxBody = 4096;
const bursts = new Map();
let currentMinute;

function digest(secret, scope, value) {
  return createHmac('sha256', secret).update(scope + ':' + value).digest('base64url');
}

export function browserOriginAllowed(req) {
  const {origin, host, 'sec-fetch-site': site} = req.headers;
  if (site === 'cross-site' || site === 'same-site') return false;
  const scheme = process.env.VERCEL === '1' || req.socket.encrypted ? 'https' : 'http';
  return origin === undefined || origin === scheme + '://' + host;
}

export function cookieIdentity(header, secret) {
  const token = header?.match(/(?:^|;\s*)dailyo_player=([^;]*)(?:;|$)/)?.[1] ?? '';
  const [id, mac, extra] = token.split('.');
  if (!uuid.test(id) || extra !== undefined) return {};
  if (mac === undefined) return {legacy: id};
  if (!signature.test(mac)) return {};
  const expected = digest(secret, 'player', id);
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? {player: id} : {};
}

export function playerCookie(player, secret) {
  const secure = process.env.VERCEL === '1' ? '; Secure' : '';
  return `dailyo_player=${player}.${digest(secret, 'player', player)}; Path=/api; Max-Age=31536000; HttpOnly; SameSite=Strict${secure}`;
}

export function clientNetwork(req) {
  const address = process.env.VERCEL === '1' ? req.headers['x-forwarded-for'] : req.socket.remoteAddress;
  const version = typeof address === 'string' ? isIP(address) : 0;
  if (version === 4) return address;
  if (version !== 6) return null;

  const canonical = new URL('http://[' + address.split('%')[0] + ']/').hostname.slice(1, -1);
  const [prefix, suffix] = canonical.split('::');
  const left = prefix ? prefix.split(':') : [];
  const right = suffix ? suffix.split(':') : [];
  const groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  if (canonical.startsWith('::ffff:') && groups.slice(0, 5).every(group => group === '0')) {
    return groups.slice(-2).flatMap(group => {
      const value = parseInt(group, 16);
      return [value >> 8, value & 255];
    }).join('.');
  }
  return groups.slice(0, 4).join(':') + '::/64';
}

export function burstRetryAfter(network, now) {
  const minute = Math.floor(now / 60_000);
  if (minute !== currentMinute) {
    bursts.clear();
    currentMinute = minute;
  }
  const count = bursts.get(network);
  if (count >= 120) return 60 - Math.floor(now / 1000) % 60;
  // Keep memory bounded during bursts from many different networks.
  if (count !== undefined || bursts.size < 4096) bursts.set(network, (count ?? 0) + 1);
  return 0;
}

export function admissionKey(secret, hour, network) {
  return digest(secret, 'admission', hour + ':' + network);
}

export async function readScoreBody(req) {
  if (Number(req.headers['content-length']) > maxBody) return {status: 413};
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of req.iterator({destroyOnReturn: false})) {
      bytes += chunk.length;
      if (bytes > maxBody) {
        req.resume();
        return {status: 413};
      }
      chunks.push(chunk);
    }
    return {body: JSON.parse(Buffer.concat(chunks).toString('utf8'))};
  } catch {
    return {status: 400};
  }
}
