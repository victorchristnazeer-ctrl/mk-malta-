/**
 * MK Malta Jobs — Meta WhatsApp Cloud API Webhook
 * Deployed on: https://mk-malta.onrender.com
 * Storage: Supabase (persistent)
 */

const express = require('express');
const app     = express();

app.use(express.json());

// ─── CORS (dashboard access) ──────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const PORT           = process.env.PORT              || 3000;
const VERIFY_TOKEN   = process.env.VERIFY_TOKEN      || 'mk_malta_verify_2024';
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_KEY;
const PHONE_ID       = process.env.WHATSAPP_PHONE_ID;
const WA_TOKEN       = process.env.WHATSAPP_TOKEN;

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function upsertThread(phone, name, text, timestamp) {
  const { error } = await supabase.from('wa_threads').upsert({
    phone,
    contact_name: name || phone,
    last_message: text,
    last_time:    timestamp,
    unread:       supabase.rpc ? undefined : 0, // incremented separately
  }, { onConflict: 'phone', ignoreDuplicates: false });

  if (error) console.error('upsertThread error:', error.message);

  // Increment unread for inbound
  await supabase.rpc('increment_unread', { p_phone: phone }).catch(() => {});
}

async function insertMessage(record) {
  const { error } = await supabase.from('wa_messages').upsert(record, {
    onConflict: 'id',
    ignoreDuplicates: true,
  });
  if (error) console.error('insertMessage error:', error.message);
}

async function updateMessageStatus(id, status) {
  const { error } = await supabase
    .from('wa_messages')
    .update({ status })
    .eq('id', id);
  if (error) console.error('updateMessageStatus error:', error.message);
}

// ─── WEBHOOK VERIFICATION ─────────────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  console.log('❌ Verification failed');
  res.sendStatus(403);
});

// ─── WEBHOOK EVENT RECEIVER ───────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;

      // ── Inbound messages ─────────────────────────────────────────────────
      if (value.messages) {
        for (const msg of value.messages) {
          const contact   = (value.contacts || []).find(c => c.wa_id === msg.from);
          const name      = contact?.profile?.name || msg.from;
          const timestamp = parseInt(msg.timestamp) * 1000;

          let text = '';
          switch (msg.type) {
            case 'text':     text = msg.text?.body || '';                          break;
            case 'image':    text = '📷 Image';                                    break;
            case 'audio':    text = '🎤 Voice message';                            break;
            case 'video':    text = '🎥 Video';                                    break;
            case 'document': text = `📄 ${msg.document?.filename || 'Document'}`; break;
            case 'location': text = '📍 Location';                                 break;
            case 'sticker':  text = '🖼 Sticker';                                  break;
            default:         text = `[${msg.type}]`;
          }

          await upsertThread(msg.from, name, text, timestamp);
          await insertMessage({
            id:        msg.id,
            phone:     msg.from,
            direction: 'inbound',
            from_name: name,
            text,
            type:      msg.type,
            status:    'received',
            timestamp,
            time_iso:  new Date(timestamp).toISOString(),
          });

          console.log(`📥 ${name} (${msg.from}): ${text}`);
        }
      }

      // ── Outbound status updates ───────────────────────────────────────────
      if (value.statuses) {
        for (const status of value.statuses) {
          await updateMessageStatus(status.id, status.status);
          console.log(`📤 ${status.id} → ${status.status}`);
        }
      }
    }
  }

  res.sendStatus(200);
});

// ─── API: All conversations ────────────────────────────────────────────────────
app.get('/api/conversations', async (req, res) => {
  const { data, error } = await supabase
    .from('wa_threads')
    .select('*')
    .order('last_time', { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const conversations = (data || []).map(t => ({
    thread_id:     t.phone,
    contact_name:  t.contact_name,
    phone:         t.phone,
    last_message:  t.last_message,
    last_time:     t.last_time,
    unread:        t.unread,
  }));

  res.json({ ok: true, count: conversations.length, conversations });
});

// ─── API: Single thread messages ──────────────────────────────────────────────
app.get('/api/conversations/:phone', async (req, res) => {
  const phone = req.params.phone;

  const [threadRes, msgsRes] = await Promise.all([
    supabase.from('wa_threads').select('*').eq('phone', phone).single(),
    supabase.from('wa_messages').select('*').eq('phone', phone).order('timestamp', { ascending: true }),
  ]);

  if (threadRes.error) return res.status(404).json({ ok: false, error: 'Not found' });

  // Mark as read
  await supabase.from('wa_threads').update({ unread: 0 }).eq('phone', phone);

  res.json({
    ok: true,
    conversation: {
      ...threadRes.data,
      messages: msgsRes.data || [],
    },
  });
});

// ─── API: Stats ───────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();

  const [threadsRes, totalRes, todayRes, unreadRes] = await Promise.all([
    supabase.from('wa_threads').select('phone', { count: 'exact', head: true }),
    supabase.from('wa_messages').select('id',   { count: 'exact', head: true }),
    supabase.from('wa_messages').select('id',   { count: 'exact', head: true }).gte('timestamp', todayTs),
    supabase.from('wa_threads') .select('unread').gt('unread', 0),
  ]);

  const unread = (unreadRes.data || []).reduce((sum, r) => sum + (r.unread || 0), 0);

  res.json({
    ok:               true,
    total_messages:   totalRes.count   || 0,
    today_messages:   todayRes.count   || 0,
    total_contacts:   threadsRes.count || 0,
    unread,
  });
});

// ─── API: Send message ────────────────────────────────────────────────────────
app.post('/api/send', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ ok: false, error: 'phone and message required' });
  if (!PHONE_ID || !WA_TOKEN) return res.status(500).json({ ok: false, error: 'WhatsApp credentials not configured' });

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: message },
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) return res.status(400).json({ ok: false, error: data });

    const msgId    = data.messages?.[0]?.id || Date.now().toString();
    const timestamp = Date.now();

    // Store outbound message
    await supabase.from('wa_threads').upsert(
      { phone, contact_name: phone, last_message: message, last_time: timestamp },
      { onConflict: 'phone' }
    );
    await supabase.from('wa_messages').insert({
      id: msgId, phone, direction: 'outbound', from_name: 'MK Malta Jobs',
      text: message, type: 'text', status: 'sent', timestamp, time_iso: new Date(timestamp).toISOString(),
    });

    res.json({ ok: true, message_id: msgId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const { count } = await supabase
    .from('wa_threads')
    .select('phone', { count: 'exact', head: true });
  res.json({
    service:      'MK Malta Jobs — WhatsApp Webhook',
    status:       'running',
    contacts:     count || 0,
    supabase:     !!SUPABASE_URL,
    whatsapp:     !!PHONE_ID && !!WA_TOKEN,
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ MK Malta Jobs WhatsApp Webhook — port ${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL ? 'connected' : '⚠️  SUPABASE_URL not set'}`);
  console.log(`   Webhook:  https://mk-malta.onrender.com/webhook`);
  console.log(`   Token:    ${VERIFY_TOKEN}\n`);
});
