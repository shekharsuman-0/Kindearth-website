const { MongoClient } = require('mongodb');

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

function page(title, message, ok) {
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>${title}</title>
      <style>
        body{ font-family: sans-serif; background:#01472e; color:#fefae0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; padding:24px; }
        .box{ max-width:420px; }
        h1{ font-family: 'Anton', sans-serif; text-transform:uppercase; }
        a{ color:#fefae0; }
      </style>
      </head>
      <body>
        <div class="box">
          <h1>${ok ? 'You are confirmed!' : 'Hmm...'}</h1>
          <p>${message}</p>
          <p><a href="https://www.kindearth.app">Back to KindEarth</a></p>
        </div>
      </body>
    </html>
  `;
}

module.exports = async (req, res) => {
  try {
    const { token } = req.query || {};

    if (!token) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(400).send(page('Invalid link', 'This confirmation link is missing information.', false));
    }

    const client = await getClient();
    const db = client.db('kindearth');
    const collection = db.collection('waitlist');

    const entry = await collection.findOne({ token: token });

    if (!entry) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(400).send(page('Link not found', 'This confirmation link is invalid or has already been used.', false));
    }

    if (!entry.confirmed) {
      await collection.updateOne(
        { token: token },
        { $set: { confirmed: true, confirmedAt: new Date().toISOString() }, $unset: { token: "" } }
      );
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(page('Confirmed', 'You are officially on the KindEarth waitlist. We will be in touch soon.', true));

  } catch (err) {
    console.error(err);
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(page('Something went wrong', 'Please try again in a moment.', false));
  }
};