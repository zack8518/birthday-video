const { google } = require('googleapis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { full_name, recipient, mime_type, file_extension } = req.body;

  if (!full_name || !recipient || !mime_type) {
    res.status(400).json({ error: 'Missing required fields.' });
    return;
  }

  const validRecipients = ['Brian', 'Jim', 'BrianAndJim'];
  if (!validRecipients.includes(recipient)) {
    res.status(400).json({ error: 'Invalid recipient value.' });
    return;
  }

  let serviceAccountKey;
  try {
    serviceAccountKey = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
  } catch (err) {
    console.error('Failed to parse service account key:', err);
    res.status(500).json({ error: 'Server configuration error.' });
    return;
  }

  const birthdayFolderId = process.env.BIRTHDAY_FOLDER_ID;
  if (!birthdayFolderId) {
    console.error('BIRTHDAY_FOLDER_ID is not set');
    res.status(500).json({ error: 'Server configuration error.' });
    return;
  }

  // Build filename: JohnSmith_Brian_20240603.mov
  const nameSlug = full_name.trim().replace(/\s+/g, '');
  const timestamp = getTimestamp();
  const ext = file_extension || '.mp4';
  const filename = `${nameSlug}_${recipient}_${timestamp}${ext}`;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const accessToken = await auth.getAccessToken();

    // Create a resumable upload session directly with the Drive API
    // Pass the browser's Origin so Drive sets up CORS for the upload URL
    const origin = req.headers.origin || 'https://birthday-video-dun.vercel.app';

    const initResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mime_type,
          'Origin': origin,
        },
        body: JSON.stringify({
          name: filename,
          parents: [birthdayFolderId],
        }),
      }
    );

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      console.error('Drive resumable upload init failed:', errText);
      res.status(500).json({ error: 'Could not initialize upload. Please try again.' });
      return;
    }

    const uploadUrl = initResponse.headers.get('location');
    res.status(200).json({ upload_url: uploadUrl, filename });

  } catch (err) {
    console.error('Error creating resumable upload session:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

function getTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
