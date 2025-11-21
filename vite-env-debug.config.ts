import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  console.log('=== VITE ENV DEBUG ===');
  console.log('Mode:', mode);
  console.log('CWD:', process.cwd());
  console.log('VITE_AUTH_URL from loadEnv:', env.VITE_AUTH_URL);
  console.log('process.env.VITE_AUTH_URL:', process.env.VITE_AUTH_URL);
  console.log('=====================');

  return {};
});
