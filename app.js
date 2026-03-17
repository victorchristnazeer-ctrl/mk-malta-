/**
 * MK Malta Jobs — tawk.to Webhook Receiver
 * Deployed on: https://mk-malta.onrender.com
 * Storage: Supabase (persistent)
 */

const express = require('express');
const app     = express();

app.use(express.json());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const PORT         = process.env.PORT       || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── LAST WEBHOOK (debug) ─────────────────────────────────────────────────────
let lastWebhook = null;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function upsertChat(chatId, visitorName, agentName, lastMsg, ts) {
  const { error } = await supabase.from('wa_threads').upsert({
    phone:        chatId,
    contact_name: visitorName || 'Visitor',
    last_message: lastMsg     || '',
    last_time:    ts,
    unread:       0,
  }, { onConflict: 'phone' });
  if (error) console.error('upsertChat error:', error.message);
}

async function insertMsg(chatId, msgId, senderName, senderType, text, ts) {
  const { error } = await supabase.from('wa_messages').upsert({
    id:        msgId,
    phone:     chatId,
    direction: senderType === 'agent' ? 'outbound' : 'inbound',
    from_name: senderName || senderType,
    text:      text || '',
    type:      'text',
    status:    'received',
    timestamp: ts,
    time_iso:  new Date(ts).toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.error('insertMsg error:', error.message);
}

// ─── TAWK.TO WEBHOOK ──────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const payload = req.body;
  lastWebhook   = { received_at: new Date().toISOString(), payload };
  console.log('TAWK EVENT:', payload.event, '| chat:', payload.chatId || payload.ticketId);

  const event    = payload.event;
  const chatId   = payload.chatId || payload.ticketId || ('ticket_' + Date.now());
  const ts       = payload.time ? new Date(payload.time).getTime() : Date.now();
  const visitor  = payload.visitor  || payload.requester || {};
  const agent    = payload.agent    || {};
  const property = payload.property || {};

  try {
    switch (event) {

      case 'chat:start': {
        await upsertChat(chatId, visitor.name, agent.name, 'Chat started', ts);
        console.log(`💬 Chat started — ${visitor.name || 'Visitor'} | ${chatId}`);
        break;
      }

      case 'chat:end': {
        await supabase.from('wa_threads')
          .update({ last_message: 'Chat ended', last_time: ts })
          .eq('phone', chatId);
        console.log(`🔚 Chat ended — ${chatId}`);
        break;
      }

      case 'chat:message': {
        const msg        = payload.message || {};
        const sender     = msg.sender      || {};
        const senderType = sender.type     || 'visitor';
        const senderName = sender.name     || (senderType === 'agent' ? (agent.name || 'Agent') : (visitor.name || 'Visitor'));
        const text       = msg.text        || '';
        const msgId      = msg.id          || `${chatId}_${ts}`;

        await upsertChat(chatId, visitor.name || senderName, agent.name, text, ts);
        await insertMsg(chatId, msgId, senderName, senderType, text, ts);
        console.log(`📨 [${senderType}] ${senderName}: ${text.slice(0, 60)}`);
        break;
      }

      case 'chat:agentAssigned':
      case 'chat:agent_assigned': {
        await supabase.from('wa_threads')
          .update({ last_message: `Agent assigned: ${agent.name || '?'}`, last_time: ts })
          .eq('phone', chatId);
        console.log(`👤 Agent assigned: ${agent.name} → ${chatId}`);
        break;
      }

      case 'ticket:create': {
        const text  = payload.message || 'New ticket';
        const msgId = `ticket_${chatId}_${ts}`;
        await upsertChat(chatId, visitor.name, null, text, ts);
        await insertMsg(chatId, msgId, visitor.name || 'Visitor', 'visitor', text, ts);
        console.log(`🎫 Ticket — ${visitor.name || chatId}: ${text.slice(0, 60)}`);
        break;
      }

      default:
        console.log(`ℹ️  Unhandled event: ${event}`);
    }
  } catch (e) {
    console.error('Webhook handler error:', e.message);
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
    thread_id:    t.phone,
    contact_name: t.contact_name,
    phone:        t.phone,
    last_message: t.last_message,
    last_time:    t.last_time,
    unread:       t.unread,
  }));

  res.json({ ok: true, count: conversations.length, conversations });
});

// ─── API: Single conversation ──────────────────────────────────────────────────
app.get('/api/conversations/:id', async (req, res) => {
  const id = req.params.id;

  const [threadRes, msgsRes] = await Promise.all([
    supabase.from('wa_threads').select('*').eq('phone', id).single(),
    supabase.from('wa_messages').select('*').eq('phone', id).order('timestamp', { ascending: true }),
  ]);

  if (threadRes.error) return res.status(404).json({ ok: false, error: 'Not found' });

  await supabase.from('wa_threads').update({ unread: 0 }).eq('phone', id);

  res.json({
    ok: true,
    conversation: { ...threadRes.data, messages: msgsRes.data || [] },
  });
});

// ─── API: Stats ───────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [threadsRes, totalRes, todayRes, unreadRes] = await Promise.all([
    supabase.from('wa_threads').select('phone', { count: 'exact', head: true }),
    supabase.from('wa_messages').select('id',   { count: 'exact', head: true }),
    supabase.from('wa_messages').select('id',   { count: 'exact', head: true }).gte('timestamp', today.getTime()),
    supabase.from('wa_threads').select('unread').gt('unread', 0),
  ]);

  const unread = (unreadRes.data || []).reduce((s, r) => s + (r.unread || 0), 0);

  res.json({
    ok:             true,
    total_messages: totalRes.count   || 0,
    today_messages: todayRes.count   || 0,
    total_contacts: threadsRes.count || 0,
    unread,
  });
});

// ─── DEBUG ────────────────────────────────────────────────────────────────────
app.get('/last-webhook', (req, res) => res.json(lastWebhook || { message: 'No webhook received yet' }));

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const { count } = await supabase.from('wa_threads').select('phone', { count: 'exact', head: true });
  res.json({ service: 'MK Malta Jobs — tawk.to Webhook', status: 'running', chats: count || 0 });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ MK Malta Jobs tawk.to Webhook — port ${PORT}`);
  console.log(`   Webhook: https://mk-malta.onrender.com/webhook\n`);
});
