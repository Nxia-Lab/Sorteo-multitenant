import { browserLocalPersistence, onAuthStateChanged, setPersistence } from 'firebase/auth';
import { auth } from './firebase';

let snapshot = {
  authReady: false,
  authUser: auth.currentUser,
};

const listeners = new Set();
let initialized = false;

function notify() {
  listeners.forEach((listener) => {
    listener();
  });
}

function initializeAuthSession() {
  if (initialized) {
    return;
  }

  initialized = true;

  setPersistence(auth, browserLocalPersistence).catch(() => {});

  onAuthStateChanged(auth, (user) => {
    snapshot = {
      authReady: true,
      authUser: user,
    };
    notify();
  });
}

initializeAuthSession();

export function subscribeAuthSession(listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSessionSnapshot() {
  return snapshot;
}
