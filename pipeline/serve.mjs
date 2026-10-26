// Mini serveur pour tester l'appli sur téléphone avec les données locales : node pipeline/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const root = join(process.cwd(), 'pipeline', 'out');
const port = Number(process.argv[2]) || 8080;

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.startsWith('..')) return res.writeHead(400).end();
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, () => console.log(`Données servies sur http://localhost:${port} (dossier pipeline/out)`));
