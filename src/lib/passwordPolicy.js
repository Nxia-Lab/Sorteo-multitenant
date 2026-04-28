const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

export function generateStrongTemporaryPassword(length = 12) {
  const size = Math.max(8, Number(length) || 12);
  const chars = [];

  chars.push(randomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
  chars.push(randomChar('abcdefghijklmnopqrstuvwxyz'));
  chars.push(randomChar('0123456789'));
  chars.push(randomChar('!@#$%^&*'));

  while (chars.length < size) {
    chars.push(randomChar(TEMP_PASSWORD_ALPHABET));
  }

  return shuffle(chars).join('');
}

export function validateStrongPassword(password) {
  const value = String(password || '');
  const issues = [];

  if (value.length < 8) {
    issues.push('Al menos 8 caracteres.');
  }

  if (!/[A-Z]/.test(value)) {
    issues.push('Al menos una mayúscula.');
  }

  if (!/[0-9]/.test(value)) {
    issues.push('Al menos un número.');
  }

  if (!/[!@#$%^&*()[\]{}\-_=+;:'",.<>/?`~|\\]/.test(value)) {
    issues.push('Al menos un símbolo.');
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

function randomChar(source) {
  const pool = String(source || '');
  if (!pool) {
    return '';
  }

  const randomValues = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(randomValues);
  const index = randomValues[0] % pool.length;
  return pool[index];
}

function shuffle(items) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomValues = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(randomValues);
    const swapIndex = randomValues[0] % (index + 1);
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }

  return array;
}
