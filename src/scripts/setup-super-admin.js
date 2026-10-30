import { readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';
import { hashPassword } from '../shared/utils/password-hasher.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(root, '.env');

const readTerminalLine = (prompt, { hidden = false } = {}) => new Promise((resolve, reject) => {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    reject(new Error('Run `npm run admin:setup` in an interactive terminal.'));
    return;
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  const finish = (error) => {
    stdin.setRawMode(false);
    stdin.pause();
    stdin.removeListener('data', onData);
    stdout.write('\n');
    if (error) reject(error);
    else resolve(value);
  };
  const onData = (chunk) => {
    for (const char of chunk.toString('utf8')) {
      if (char === '\u0003') return finish(new Error('Setup cancelled.'));
      if (char === '\r' || char === '\n') return finish();
      if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
        if (!hidden) stdout.write('\b \b');
        continue;
      }
      if (char >= ' ' && char <= '~') {
        value += char;
        if (!hidden) stdout.write(char);
      }
    }
  };
  stdin.on('data', onData);
});

const setEnvValue = (content, key, value) => {
  const lines = content ? content.split(/\r?\n/) : [];
  const encoded = `${key}=${JSON.stringify(value)}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index < 0) lines.push(encoded);
  else lines[index] = encoded;
  return lines.filter((line, lineIndex) => !line.startsWith(`${key}=`) || lineIndex === lines.indexOf(encoded)).join('\n').replace(/\n*$/, '\n');
};

try {
  const id = String(await readTerminalLine('Super Admin login ID: ')).trim().toLowerCase();
  if (!id || id.length > 254 || /\s/.test(id)) throw new Error('Enter an ID without spaces (maximum 254 characters).');
  const password = String(await readTerminalLine('Super Admin password (input hidden): ', { hidden: true }));
  if (password.length < 12 || password.length > 256) throw new Error('Choose a password between 12 and 256 characters.');
  const confirmation = String(await readTerminalLine('Confirm password (input hidden): ', { hidden: true }));
  if (password !== confirmation) throw new Error('Passwords did not match.');

  let content = '';
  try {
    content = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const passwordHash = await hashPassword(password);
  content = setEnvValue(content, 'SUPER_ADMIN_ID', id);
  content = setEnvValue(content, 'SUPER_ADMIN_NAME', 'Dr. Hair Super Admin');
  content = setEnvValue(content, 'SUPER_ADMIN_PASSWORD_HASH', passwordHash);
  await writeFile(envPath, content, { mode: 0o600 });
  await chmod(envPath, 0o600);
  stdout.write('Super Admin credentials saved to the private backend/.env file. The password itself was not stored.\n');
} catch (error) {
  stdout.write(`${error instanceof Error ? error.message : 'Could not configure the Super Admin account.'}\n`);
  process.exitCode = 1;
}
