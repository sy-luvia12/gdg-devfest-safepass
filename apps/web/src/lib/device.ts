// 기기 묶기 (docs/api.md 9장). 폰마다 꺼낼 수 없는 ECDSA P-256 키를 만들어 IndexedDB에 두고,
// QR을 받을 때마다 `TTV1-REFRESH:{ticketId}:{signedAt}`에 서명해서 이 기기임을 증명한다.
import type { DeviceKey, DeviceProof } from '../../../../functions/src/api';
import type { QrSignature } from '../types';

const DB_NAME = 'safepass-device';
const STORE = 'keys';
const KEY_ID = 'device';

type Stored = { keys: CryptoKeyPair; registered: boolean; uid: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function load(uid: string): Promise<Stored | null> {
  const stored = await withStore<Stored | undefined>('readonly', (s) => s.get(KEY_ID));
  // 같은 폰에서 다른 계정으로 로그인하면 그 계정용 키를 새로 만든다
  return stored && stored.uid === uid ? stored : null;
}

async function save(value: Stored): Promise<void> {
  await withStore('readwrite', (s) => s.put(value, KEY_ID));
}

/** 이 기기의 키. 없으면 새로 만든다 (개인키는 extractable: false라 밖으로 꺼낼 수 없다) */
export async function getDeviceKeys(uid: string): Promise<Stored> {
  const existing = await load(uid);
  if (existing) return existing;
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const fresh = { keys, registered: false, uid };
  await save(fresh);
  return fresh;
}

export async function setRegistered(stored: Stored, registered: boolean): Promise<void> {
  await save({ ...stored, registered });
}

export async function publicKeyJwk(keys: CryptoKeyPair): Promise<DeviceKey> {
  const { x, y } = await crypto.subtle.exportKey('jwk', keys.publicKey);
  return { kty: 'EC', crv: 'P-256', x: x ?? '', y: y ?? '' };
}

function base64url(buf: ArrayBuffer): string {
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** WebCrypto ECDSA 서명은 r||s(IEEE P1363) 형식이라 서버가 그대로 검증한다 */
async function signNow(keys: CryptoKeyPair, message: (signedAt: number) => string): Promise<QrSignature> {
  const signedAt = Date.now();
  const data = new TextEncoder().encode(message(signedAt));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, data);
  return { signedAt, signature: base64url(sig) };
}

export function signRefresh(keys: CryptoKeyPair, ticketId: string): Promise<DeviceProof> {
  return signNow(keys, (signedAt) => `TTV1-REFRESH:${ticketId}:${signedAt}`);
}

/** 화면에 띄울 QR에 붙이는 서명. 토큰을 받을 때마다 새로 만든다 (서버는 60초 안의 서명만 받는다) */
export function signQr(keys: CryptoKeyPair, ticketId: string, token: string): Promise<QrSignature> {
  return signNow(keys, (signedAt) => `TTV2:${ticketId}:${token}:${signedAt}`);
}

/** 화면에 보여줄 이 기기 이름 (예: iPhone · Safari). 기기를 특정하는 정보는 쓰지 않는다 */
export function describeThisDevice(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : '기기';
  const browser = /SamsungBrowser/.test(ua)
    ? '삼성 인터넷'
    : /KAKAOTALK/.test(ua)
      ? '카카오톡'
      : /Edg\//.test(ua)
        ? 'Edge'
        : /CriOS|Chrome\//.test(ua)
          ? 'Chrome'
          : /FxiOS|Firefox\//.test(ua)
            ? 'Firefox'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '브라우저';
  return `${os} · ${browser}`;
}
