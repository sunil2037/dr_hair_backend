import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

export const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });

  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
};

export const verifyPassword = async (password, encodedHash) => {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') return false;
  const [algorithm, costText, blockText, parallelText, saltText, hashText, extra] = encodedHash.split('$');
  if (algorithm !== 'scrypt' || extra !== undefined || !saltText || !hashText) return false;

  const cost = Number(costText);
  const blockSize = Number(blockText);
  const parallelization = Number(parallelText);
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(hashText, 'base64url');
  if (
    !Number.isInteger(cost) || cost < 2 ** 14 || cost > 2 ** 18
    || !Number.isInteger(blockSize) || blockSize < 1 || blockSize > 16
    || !Number.isInteger(parallelization) || parallelization < 1 || parallelization > 4
    || salt.length < 16 || expected.length !== KEY_LENGTH
  ) return false;

  const actual = await scrypt(password, salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: MAX_MEMORY,
  });
  return timingSafeEqual(expected, actual);
};
