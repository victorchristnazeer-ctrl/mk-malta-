/**
 * MK Malta Jobs — Meta WhatsApp Cloud API Webhook Receiver
 * Deployed on: https://mk-malta.onrender.com
 * Storage: Supabase (persistent)
 */

const express = require('express');
const app     = express();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT         = process.env.PORT         || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'mk_malta_verify_token';

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function formatPhone(phone) {
  return phone ? phone.replace(/^356/, '+356 ') : phone;
}

async function upsertThread(phone, contactName, lastMsg, ts) {
  const { error } = await supabase.from('wa_threads').upsert({
    phone, contact_name: contactName || phone, last_message: lastMsg || '', last_time: ts,
  }, { onConflict: 'phone', ignoreDuplicates: false });
  if (error) console.error('upsertThread error:', error.message);
}

async function insertMessage(id, phone, direction, fromName, text, type, ts) {
  const { error } = await supabase.from('wa_messages').upsert({
    id, phone, direction, from_name: fromName || phone,
    text: text || '', type: type || 'text', status: 'received',
    timestamp: ts, time_iso: new Date(ts).toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.error('insertMessage error:', error.message);
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  console.log('Webhook verification failed');
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }
  res.sendStatus(200);
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (change.field !== 'messages') continue;
      if (value.messages) {
        for (const msg of value.messages) {
          const contact = (value.contacts || []).find(c => c.wa_id === msg.from);
          const name = (contact && contact.profile) ? contact.profile.name : msg.from;
          const ts = parseInt(msg.timestamp) * 1000;
          let text = '';
          if (msg.type === 'text') text = (msg.text && msg.text.body) ? msg.text.body : '';
          else if (msg.type === 'image') text = '[Image]';
          else if (msg.type === 'audio') text = '[Voice message]';
          else if (msg.type === 'document') text = '[Document: ' + ((msg.document && msg.document.filename) ? msg.document.filename : 'file') + ']';
          else if (msg.type === 'video') text = '[Video]';
          else if (msg.type === 'sticker') text = '[Sticker]';
          else text = '[' + msg.type + ']';
          await upsertThread(msg.from, name, text, ts);
          await insertMessage(msg.id, msg.from, 'inbound', name, text, msg.type, ts);
          console.log('INBOUND from ' + name + ': ' + text.substring(0, 80));
        }
      }
      if (value.statuses) {
        for (const status of value.statuses) {
          await supabase.from('wa_messages').update({ status: status.status }).eq('id', status.id);
        }
      }
    }
  }
});

app.get('/api/conversations', async (req, res) => {
  const { data, error } = await supabase.from('wa_threads').select('*').order('last_time', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, count: data.length, conversations: data.map(t => ({
    thread_id: t.phone, contact_name: t.contact_name, phone: t.phone,
    last_message: t.last_message, last_time: t.last_time, unread: t.unread || 0,
  }))});
});

app.get('/api/conversations/:id', async (req, res) => {
  const id = req.params.id;
  const [threadRes, msgsRes] = await Promise.all([
    supabase.from('wa_threads').select('*').eq('phone', id).single(),
    supabase.from('wa_messages').select('*').eq('phone', id).order('timestamp', { ascending: true }),
  ]);
  if (threadRes.error) return res.status(404).json({ ok: false, error: 'Not found' });
  await supabase.from('wa_threads').update({ unread: 0 }).eq('phone', id);
  res.json({ ok: true, conversation: Object.assign({}, threadRes.data, { messages: msgsRes.data || [] }) });
});

app.get('/api/stats', async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [threadsRes, totalRes, todayRes, unreadRes] = await Promise.all([
    supabase.from('wa_threads').select('phone', { count: 'exact', head: true }),
    supabase.from('wa_messages').select('id',   { count: 'exact', head: true }),
    supabase.from('wa_messages').select('id',   { count: 'exact', head: true }).gte('timestamp', today.getTime()),
    supabase.from('wa_threads').select('unread').gt('unread', 0),
  ]);
  const unread = (unreadRes.data || []).reduce((s, r) => s + (r.unread || 0), 0);
  res.json({ ok: true, total_messages: totalRes.count || 0, today_messages: todayRes.count || 0, total_contacts: threadsRes.count || 0, unread });
});

app.get('/', async (req, res) => {
  const { count } = await supabase.from('wa_threads').select('phone', { count: 'exact', head: true });
  res.json({ service: 'MK Malta Jobs - WhatsApp Webhook', status: 'running', contacts: count || 0 });
});

app.listen(PORT, () => {
  console.log('MK Malta Jobs WhatsApp Webhook - port ' + PORT);
  console.log('Webhook: https://mk-malta.onrender.com/webhook');
});
