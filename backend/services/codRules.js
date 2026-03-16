const { db } = require('./firebase');

async function isCODBlocked(phone) {
  try {
    const doc = await db.collection('customers').doc(phone).get();
    if (!doc.exists) return false;
    return doc.data().codBlocked === true;
  } catch {
    return false;
  }
}

async function recordCODAttempt(phone) {
  const ref = db.collection('customers').doc(phone);
  const doc = await ref.get();

  if (!doc.exists) {
    await ref.set({ doorRejections: 1, codBlocked: false });
    return;
  }

  const rejections = (doc.data().doorRejections || 0) + 1;
  const codBlocked = rejections >= 2;

  await ref.update({ doorRejections: rejections, codBlocked });
}

module.exports = { isCODBlocked, recordCODAttempt };
