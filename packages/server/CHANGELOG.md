# @apostel/visual-config-server

## 0.2.0

### Patch Changes

- Updated dependencies [[`9c46cad`](https://github.com/Sam-Apostel/project-config-tools/commit/9c46cad412b30319dda9342fc73c4c04577b6a69)]:
  - @apostel/visual-config-core@0.2.0
  - @apostel/visual-config-protocol@0.2.0

## 0.1.2

### Patch Changes

- [#7](https://github.com/Sam-Apostel/project-config-tools/pull/7) [`dbb01b0`](https://github.com/Sam-Apostel/project-config-tools/commit/dbb01b01d85b3dd7cb49b14879479027ecce380a) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Fix the daemon hanging on Ctrl+C (SIGINT). `httpServer.close()` waits for open
  connections to drain, and the browser UI's live WebSocket kept a socket (and the
  process) open indefinitely — so pressing Ctrl+C in the terminal running
  `npx @apostel/visual-config` appeared to do nothing. The daemon's `close()` now
  terminates client WebSocket connections and destroys lingering sockets before
  closing the HTTP server, so shutdown completes and the process exits. Running
  script tasks are still SIGTERM'd on shutdown.
- Updated dependencies []:
  - @apostel/visual-config-core@0.1.2
  - @apostel/visual-config-protocol@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.1
  - @apostel/visual-config-protocol@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.0
  - @apostel/visual-config-protocol@0.1.0
