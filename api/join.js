const { MongoClient } = require('mongodb');
const dns = require('dns').promises;
const crypto = require('crypto');

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

async function domainCanReceiveMail(email) {
  const domain = email.split('@')[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch (err) {
    return false;
  }
}

async function sendConfirmationEmail(email, token, origin) {
  const confirmUrl = `${origin}/api/confirm?token=${token}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'KindEarth <noreply@mail.kindearth.app>',
      to: email,
      subject: 'Confirm your spot on the KindEarth waitlist',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color:#01472e;">You're almost in.</h2>
          <p>Click the button below to confirm your spot on the KindEarth waitlist.</p>
          <p style="margin:32px 0;">
            <a href="${confirmUrl}" style="background:#01472e; color:#fefae0; padding:14px 28px; border-radius:24px; text-decoration:none; font-weight:bold; display:inline-block;">Confirm my spot</a>
          </p>
          <p style="color:#888; font-size:13px;">If you didn't sign up for this, you can safely ignore this email.</p>
        </div>
      `
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Failed to send confirmation email: ' + errText);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body || {};

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    const domainOk = await domainCanReceiveMail(cleanEmail);
    if (!domainOk) {
      return res.status(400).json({ error: 'That email domain doesn\'t look like it can receive mail. Double check for typos.' });
    }

    const client = await getClient();
    const db = client.db('kindearth');
    const collection = db.collection('waitlist');

    const existing = await collection.findOne({ email: cleanEmail });

    if (existing && existing.confirmed) {
      const count = await collection.countDocuments({ confirmed: true });
      return res.status(200).json({ message: 'Already confirmed, you are on the list!', count });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const origin = `https://${req.headers.host}`;

    if (existing) {
      // resend a fresh token if they signed up again before confirming
      await collection.updateOne({ email: cleanEmail }, { $set: { token, tokenCreatedAt: new Date().toISOString() } });
    } else {
      await collection.insertOne({
        email: cleanEmail,
        confirmed: false,
        token,
        joinedAt: new Date().toISOString(),
        tokenCreatedAt: new Date().toISOString()
      });
    }

    await sendConfirmationEmail(cleanEmail, token, origin);

    return res.status(200).json({ message: 'Check your inbox to confirm your spot!' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};