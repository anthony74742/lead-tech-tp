import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig =
  (await import('./firebase_config.js')).firebaseConfig ||
  globalThis.firebaseConfig ||
  (typeof process !== 'undefined' && process.env?.FIREBASE_CONFIG
    ? JSON.parse(process.env.FIREBASE_CONFIG)
    : undefined);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

document.getElementById('sign-in').addEventListener('click', () => {
  signInWithPopup(auth, provider).catch(error => console.error('Sign-in error', error));
});

document.getElementById('sign-out').addEventListener('click', () => {
  signOut(auth).catch(error => console.error('Sign-out error', error));
});

onAuthStateChanged(auth, user => {
  document.getElementById('sign-in').hidden = !!user;
  document.getElementById('sign-out').hidden = !user;
  document.getElementById('user-info').textContent = user ? `Connecte en tant que ${user.displayName}` : '';
});
