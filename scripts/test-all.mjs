import { spawn } from 'node:child_process';
const port = process.env.STORYBOOK_TEST_PORT || '6007';
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: port },
  stdio: 'ignore',
});
async function run(script) {
  await new Promise((resolve, reject) => {
    const task = spawn(process.execPath, [script], {
      env: { ...process.env, STORYBOOK_URL: base },
      stdio: 'inherit',
    });
    task.on('error', reject);
    task.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)),
    );
  });
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error('Could not start test server; choose a free STORYBOOK_TEST_PORT');
    try {
      if ((await fetch(base + '/index.json')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error('Storybook test server did not start');
  await run('scripts/verify-catalog.mjs');
  await run('scripts/test-storybook.mjs');
  await run('scripts/check-docs.mjs');
  await run('scripts/check-interactions.mjs');
  await run('scripts/check-themes.mjs');
} finally {
  server.kill();
}
