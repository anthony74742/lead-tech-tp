const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

initializeApp({
  databaseURL: 'https://ecni2-2026-default-rtdb.firebaseio.com'
});

const db = getDatabase();

module.exports = { db };
