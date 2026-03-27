exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, body: 'GITHUB_TOKEN not configured' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }

  const { weekCommencing, content } = payload;
  if (!weekCommencing || !content) {
    return { statusCode: 400, body: 'Missing weekCommencing or content' };
  }

  const [year, month, day] = weekCommencing.split('-').map(Number);
  const y = year % 100;
  const filename = `WC_${y}.${month}.${day}.json`;
  const filePath = `Data/Weeks/${filename}`;
  const repo = 'benedictreed-source/RFH-Plastic-Surgery-Rota';
  const branch = 'main';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  const headers = {
    'Authorization': `token ${token}`,
    'User-Agent': 'Rota-App',
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  const fileContent = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');

  async function getSha() {
    const res = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (res.ok) return (await res.json()).sha;
    return null;
  }

  async function tryPut(sha) {
    const putBody = { message: `Rota update: ${weekCommencing} [skip cd]`, content: fileContent, branch };
    if (sha) putBody.sha = sha;
    return fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(putBody) });
  }

  // Retry once on 409 with a fresh SHA
  let sha = await getSha();
  let putRes = await tryPut(sha);
  if (putRes.status === 409) {
    sha = await getSha();
    putRes = await tryPut(sha);
  }

  if (putRes.ok) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, file: filePath })
    };
  } else {
    const err = await putRes.text();
    return { statusCode: putRes.status, body: err };
  }
};
