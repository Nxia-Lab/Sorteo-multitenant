import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function randomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result || ''));
    };

    reader.onerror = () => {
      reject(new Error('No pudimos leer el archivo del logo.'));
    };

    reader.readAsDataURL(file);
  });
}

export async function uploadBrandLogoFile(file, scope = 'tenant') {
  if (!file) {
    return '';
  }

  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('El logo debe ser una imagen.');
  }

  const maxSizeBytes = 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error('El logo debe pesar menos de 1 MB.');
  }

  if (file.size <= 512 * 1024) {
    return readFileAsDataUrl(file);
  }

  const safeScope = sanitizeSegment(scope) || 'tenant';
  const extension = sanitizeSegment(file.name.split('.').pop()) || 'image';
  const logoRef = ref(storage, `brand-logos/${safeScope}/${randomId()}.${extension}`);

  try {
    const snapshot = await uploadBytes(logoRef, file, {
      contentType: file.type,
      customMetadata: {
        scope: safeScope,
      },
    });

    return getDownloadURL(snapshot.ref);
  } catch (error) {
    if (file.size > 512 * 1024) {
      throw error;
    }

    return readFileAsDataUrl(file);
  }
}
