const { MongoClient } = require('mongodb');
const dns = require('dns').promises;

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
    // NXDOMAIN, ENODATA, timeout etc. all mean "can't verify this domain"
    return false;
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
    if (existing) {
      const count = await collection.countDocuments();
      return res.status(200).json({ message: 'Already on the list!', count });
    }

    await collection.insertOne({
      email: cleanEmail,
      joinedAt: new Date().toISOString()
    });

    const count = await collection.countDocuments();
    return res.status(200).json({ message: 'You are in!', count });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};