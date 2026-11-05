
"use strict";

const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT が設定されていません。");
  }

  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(serviceAccount)
    ),
    projectId: "studychat-1b39d"
  });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = {
  admin,
  db,
  auth
};
