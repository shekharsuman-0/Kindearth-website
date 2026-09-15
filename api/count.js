const { MongoClient } = require('mongodb');

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = await getClient();
    const db = client.db('kindearth');
    const collection = db.collection('waitlist');
    const count = await collection.countDocuments({ confirmed: true });
    return res.status(200).json({ count });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not fetch count' });
  }
};