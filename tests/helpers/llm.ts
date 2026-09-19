import { createServer } from 'node:http';

export async function mockLlm() {
  const state = { status: 200, content: '{"ok":true}', connectionTest: false, delay: 0, finish: 'stop', requests: [] as { url: string; authorization: string; body: { model?: string; messages: { role: string; content: string }[]; response_format?: { type: string } } }[] };
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    state.requests.push({ url: req.url || '', authorization: req.headers.authorization || '', body: JSON.parse(text) });
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    res.writeHead(state.status, { 'Content-Type': 'application/json' });
    const content = state.connectionTest && JSON.parse(text).messages.some((message: { content: string }) => message.content.includes('connectivity test')) ? '{"ok":true}' : state.content;
    res.end(JSON.stringify({ choices: [{ finish_reason: state.finish, message: { content } }], error: { message: 'PRIVATE_PROVIDER_DETAIL' } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
