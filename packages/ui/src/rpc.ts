import { createBirpc, type BirpcReturn } from 'birpc';
import type { ClientFunctions, FaceBootstrap, ServerFunctions } from '@visual-config/protocol';

export type ServerRpc = BirpcReturn<ServerFunctions, ClientFunctions>;

function getBootstrap(): FaceBootstrap | undefined {
  return (window as unknown as { __VC__?: FaceBootstrap }).__VC__;
}

/** Connect to the daemon over WebSocket and return a typed RPC handle. */
export function connect(clientFunctions: ClientFunctions): Promise<ServerRpc> {
  return new Promise((resolvePromise, rejectPromise) => {
    const bootstrap = getBootstrap();
    if (!bootstrap) {
      rejectPromise(
        new Error('No daemon connection info. Launch this UI with `npx visual-config`.'),
      );
      return;
    }
    const ws = new WebSocket(bootstrap.wsUrl);
    const rpc = createBirpc<ServerFunctions, ClientFunctions>(clientFunctions, {
      post: (data) => ws.send(data),
      on: (fn) => ws.addEventListener('message', (event) => fn(event.data)),
      serialize: (v) => JSON.stringify(v),
      deserialize: (v) => JSON.parse(v as string),
    });
    ws.addEventListener('open', () => resolvePromise(rpc));
    ws.addEventListener('error', () =>
      rejectPromise(new Error('Could not connect to the daemon.')),
    );
  });
}
