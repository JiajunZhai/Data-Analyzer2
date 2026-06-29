import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

const DATA_FILE = path.resolve(process.cwd(), 'public/data/sql-templates.json');

export function sqlTemplatesPlugin(): Plugin {
  return {
    name: 'sql-templates-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/sql-templates')) {
          next();
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        try {
          if (req.method === 'GET') {
            const data = await fs.readFile(DATA_FILE, 'utf-8');
            res.end(data);
            return;
          }

          if (req.method === 'POST' || req.method === 'PUT') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.from(chunk));
            }
            const body = Buffer.concat(chunks).toString('utf-8');
            const data = JSON.parse(body);
            await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
            res.end(JSON.stringify({ success: true }));
            return;
          }

          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        } catch (err: unknown) {
          console.error('SQL templates API error:', err);
          const message = err instanceof Error ? err.message : 'Internal server error';
          res.statusCode = 500;
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}
