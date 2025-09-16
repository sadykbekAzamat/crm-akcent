const { onRequest } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Point Admin SDK at your RTDB instance explicitly
admin.initializeApp({
  databaseURL: 'https://akcent-academy.firebaseio.com'
});
const db = admin.database();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// --- Вспомогалка: безопасный чтение списка как массива объектов ---
const snapshotToArray = (snap) => {
  const val = snap.val() || {};
  return Object.entries(val).map(([id, obj]) => ({ id, ...obj }));
};

// --- ROOT ---
app.get('/', (req, res) => {
  res.send('Backend for Akcent CRM is working (Firebase)!');
});

// --- ENTRIES ---

// GET /entries  (отсортированы по createdAt DESC)
app.get('/api/entries', async (req, res) => {
  try {

    const {
      none, status
    } = req.query;

    if(!none){
      const updateSnap = await db.ref('update').once('value'); // or .get()
      const update = updateSnap.val();

      if (update === false) {
        return res.status(429).send('Too many requests');
      }
    }

    await db.ref('update').set(false);

    const ref = db.ref('entries');
    let snap;
    if(!status || !status.trim() || status.trim().length < 3){
      snap = await ref.orderByChild('createdAt').once('value');
    }else {
      snap = await ref
        .orderByChild('status')
        .equalTo(status.trim())
        .once('value');
    }
    const list = snapshotToArray(snap).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json(list);
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).send('Server Error');
  }
});

// POST /entries
app.post('/api/entries', async (req, res) => {
  try {
    const {
      action, // undefined | "replace"
      clientName, phone, trialDate, trialTime, rop, source,
      comment, status, createdAt, score, age
    } = req.body;

    if (!phone) return res.status(400).send('empty phone');

    // build stable key from ASCII digits
    let id_ = String(phone).replace(/\D/g, '');
    if (!id_ || id_.length < 10) return res.status(403).send('bad phone');
    id_ = id_ + 'id';

    const ref = db.ref('entries').child(id_);
    const existingSnap = await ref.once('value');
    const exists = existingSnap.exists();

    const makePayload = () => ({
      clientName: clientName ?? null,
      phone: phone ?? null,
      trialDate: trialDate ?? null,
      trialTime: trialTime ?? null,
      rop: rop ?? null,
      source: source ?? null,
      comment: comment ?? null,
      status: status ?? null,
      createdAt:
        typeof createdAt === 'number'
          ? createdAt
          : admin.database.ServerValue.TIMESTAMP,
      assignedTeacher: null,
      assignedTime: null,
      paymentType: null,
      packageType: null,
      paymentAmount: 0,
      age: age ?? null,
      score: score ?? null,
    });

    if (!action) {
      if (exists) return res.status(409).send('Already exists');
      await ref.set(makePayload());
      await db.ref('update').set(true);
      const snap = await ref.once('value');
      return res.json({ id: ref.key, ...snap.val(), _action: 'created' });
    }

    if (action === 'replace') {
      // remove if present, then write fresh
      try { await ref.remove(); } catch (_) {}
      await ref.set(makePayload());
      await db.ref('update').set(true);
      const snap = await ref.once('value');
      return res.json({ id: ref.key, ...snap.val(), _action: 'replaced' });
    }

    return res.status(400).send('Unknown action');
  } catch (err) {
    console.error('Error creating entry:', err);
    return res.status(500).send('Server Error');
  }
});

// PUT /entries/:id
app.put('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status, trialDate, assignedTeacher, assignedTime,
      paymentType, packageType, paymentAmount, age, score
    } = req.body;

    const ref = db.ref(`entries/${id}`);
    const snap = await ref.once('value');
    if (!snap.exists()) return res.status(404).send('Entry not found');

    const update = {
      ...(status !== undefined && { status }),
      ...(trialDate !== undefined && { trialDate }),
      ...(assignedTeacher !== undefined && { assignedTeacher }),
      ...(assignedTime !== undefined && { assignedTime }),
      ...(paymentType !== undefined && { paymentType }),
      ...(packageType !== undefined && { packageType }),
      ...(paymentAmount !== undefined && { paymentAmount }),
      ...(age !== undefined && { age }),
      ...(score !== undefined && { score }),
    };

    await ref.update(update);
    const after = await ref.once('value');


    const update_ = db.ref('update');
    await update_.set(true);

    res.json({ id, ...after.val() });
  } catch (err) {
    console.error('Error updating entry:', err);
    res.status(500).send('Server Error');
  }
});

// --- BLOCKED SLOTS ---

// GET /blocked-slots
app.get('/api/blocked-slots', async (req, res) => {
  try {
    const ref = db.ref('blocked_slots');
    const snap = await ref.once('value');
    res.json(snapshotToArray(snap));
  } catch (err) {
    console.error('Error fetching blocked slots:', err);
    res.status(500).send('Server Error');
  }
});

// POST /blocked-slots  (аналог ON CONFLICT DO NOTHING через transaction)
app.post('/api/blocked-slots', async (req, res) => {
  try {
    const { id, date, teacher, time } = req.body;
    if (!id) return res.status(400).send('id is required');

    const ref = db.ref(`blocked_slots/${id}`);
    const result = await ref.transaction(current => {
      if (current) return;        // уже существует -> NOOP
      return { id, date, teacher, time };
    });

    if (!result.committed && result.snapshot.exists()) {
      return res.json(result.snapshot.val());
    }

    const snap = await ref.once('value');
    res.json(snap.val());
  } catch (err) {
    console.error('Error blocking slot:', err);
    res.status(500).send('Server Error');
  }
});

// DELETE /blocked-slots/:id
app.delete('/api/blocked-slots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.ref(`blocked_slots/${id}`).remove();
    res.status(204).send();
  } catch (err) {
    console.error('Error unblocking slot:', err);
    res.status(500).send('Server Error');
  }
});

// Экспортируем как одну HTTP Function
exports.akcent = onRequest(app);
