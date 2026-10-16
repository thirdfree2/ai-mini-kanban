import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = ['.env', '.env.local'].map(name => resolve(root, name)).find(existsSync);
if (envFile) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Run neon deploy to pull your database environment.');
  process.exit(1);
}
const binary = resolve(root, 'dist/server');
if (!existsSync(binary)) {
  console.error('Build the application first with npm run build.');
  process.exit(1);
}
const port = process.env.PORT || '3002';
const server = spawn(binary, [], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT: port, STATIC_DIR: resolve(root, 'frontend/dist'), GIN_MODE: process.env.GIN_MODE || 'release' },
});
console.log(`Kanban with the configured PostgreSQL database: http://localhost:${port}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 1; });
