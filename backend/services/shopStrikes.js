const { db } = require('./firebase');

async function incrementShopStrike() {
  const today = new Date().toISOString().split('T')[0];
  const ref = db.collection('shopStrikes').doc(today);
  const doc = await ref.get();

  const current = doc.exists ? doc.data().count : 0;
  await ref.set({ count: current + 1, date: today });

  if (current + 1 >= 3) {
    console.error(`SHOP ALERT: ${current + 1} cancellations today (${today})`);
  }
}

module.exports = { incrementShopStrike };
