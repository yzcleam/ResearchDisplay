import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:5173');
  const webPort = Number(origin.port || (origin.protocol === 'https:' ? 443 : 80));
  const apiPort = Number(env.PORT || 3001);
  if (
    !Number.isInteger(webPort) ||
    webPort < 1 ||
    webPort > 65535 ||
    !Number.isInteger(apiPort) ||
    apiPort < 1 ||
    apiPort > 65535 ||
    webPort === apiPort
  ) {
    throw new Error('APP_ORIGIN 和 PORT 必须使用不同的有效端口。');
  }
  const apiHost = env.HOST || '127.0.0.1';
  const proxyHost = apiHost === '0.0.0.0' ? '127.0.0.1' : apiHost === '::1' ? '[::1]' : apiHost;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: origin.hostname === '[::1]' ? '::1' : '127.0.0.1',
      port: webPort,
      strictPort: true,
      proxy: { '/api': env.API_PROXY_TARGET || `http://${proxyHost}:${apiPort}` },
    },
  };
});
