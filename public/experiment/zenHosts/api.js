/* global ExtensionAPI, ChromeUtils, Cc, Ci, Cr */

/**
 * Loopback HTTP proxies that send everything they receive to one fixed IP.
 *
 * WebExtensions cannot change how a hostname resolves, and a hosts-file style
 * override has to work for HTTPS too. So the background script routes a tab's
 * matching requests (via `proxy.onRequest`) to one of these proxies: Firefox
 * sends `CONNECT example.com:443` and the proxy opens a tunnel to the group's
 * IP on that port instead of resolving the name. TLS still runs end to end
 * between the tab and the server, with the original hostname for SNI and
 * certificate checks.
 *
 * There is one listener per IP, bound to loopback only, and it never connects
 * anywhere but that IP, so it cannot be used as an open relay.
 */

// Set from WXT_DEBUG at build time (scripts/experiment-debug.mjs). When on,
// every connection step is traced to the log file, not just failures.
const DEBUG = false;

const MAX_HEAD_BYTES = 16 * 1024;
const COPY_CHUNK_BYTES = 32 * 1024;
const CONNECT_OK = "HTTP/1.1 200 Connection Established\r\n\r\n";
const BAD_REQUEST = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
const BAD_GATEWAY = "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
const IP_PATTERN = /^[0-9a-fA-F:.]+$/;
const CONNECT_TIMEOUT_MS = 15_000;
const CONNECT_POLL_MS = 100;
const LOG_PREFIX = "[zen-tab-search hosts]";
const LOG_FILE_NAME = "zen-tab-search-hosts.log";
const MAX_LOG_BYTES = 2 * 1024 * 1024;

let logFile = null;

/** `zen-tab-search-hosts.log` in the OS temp folder (%TEMP% on Windows). */
function getLogFile() {
  if (!logFile) {
    logFile = Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
      .get("TmpD", Ci.nsIFile);
    logFile.append(LOG_FILE_NAME);
  }
  return logFile;
}

/**
 * Appends a timestamped line to the log file. The file starts over once it
 * passes 2 MB, so a long session cannot fill the disk. Logging never throws.
 */
function writeLog(line) {
  try {
    const file = getLogFile();
    const truncate = file.exists() && file.fileSize > MAX_LOG_BYTES;
    const stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
      Ci.nsIFileOutputStream,
    );
    // PR_WRONLY | PR_CREATE_FILE | (PR_TRUNCATE or PR_APPEND)
    stream.init(file, 0x02 | 0x08 | (truncate ? 0x20 : 0x10), 0o644, 0);
    const converter = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(
      Ci.nsIConverterOutputStream,
    );
    converter.init(stream, "UTF-8");
    converter.writeString(`${new Date().toISOString()} ${line}\n`);
    converter.close();
  } catch {
    // Logging must never break a connection.
  }
}

/** Writes a line to the log file in debug builds only. */
function trace(line) {
  if (DEBUG) {
    writeLog(line);
  }
}

/**
 * Failures go to the log file and the Browser Console (Ctrl+Shift+J) whatever
 * the debug setting, and onto the proxy's stats so the editor can show them.
 */
function logError(message, error, stats) {
  const line = `${message}: ${error?.name || error?.message || String(error)}`;
  stats.lastError = line;
  writeLog(`ERROR ${line}`);
  console.error(`${LOG_PREFIX} ${line}`);
}

function mainThread() {
  return Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager).mainThread;
}

function stringStream(data) {
  const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
    Ci.nsIStringInputStream,
  );
  if (typeof stream.setByteStringData === "function") {
    stream.setByteStringData(data);
  } else {
    stream.setData(data, data.length);
  }
  return stream;
}

/**
 * Copies `source` into `sink` off the main thread and calls `done(status)` at the end.
 *
 * Uses `nsIAsyncStreamCopier2`, which wraps an unbuffered source in a buffer
 * itself. Socket streams are unbuffered on both ends, and the older
 * `nsIAsyncStreamCopier` needs one side buffered: given two sockets it fails
 * at once and every tunnel is reset.
 */
function copyStream(source, sink, closeSource, closeSink, done) {
  const copier = Cc["@mozilla.org/network/async-stream-copier;1"].createInstance(
    Ci.nsIAsyncStreamCopier2,
  );
  copier.init(source, sink, null, COPY_CHUNK_BYTES, closeSource, closeSink);
  copier.asyncCopy(
    {
      onStartRequest() {},
      onStopRequest(_request, status) {
        done(status);
      },
    },
    null,
  );
}

/**
 * Reads the destination port from a proxy request head. `CONNECT host:port`
 * tunnels; anything else is a plain request with an absolute URL, which is
 * forwarded as-is (origin servers must accept the absolute form).
 */
function parseRequestHead(head) {
  const line = head.split("\r\n", 1)[0] || "";
  const [method, target] = line.split(" ");
  if (!method || !target) {
    return undefined;
  }

  const tunnel = method.toUpperCase() === "CONNECT";
  let port;
  if (tunnel) {
    const match = /:(\d+)$/.exec(target);
    port = match ? Number(match[1]) : undefined;
  } else {
    const match = /^([a-z][a-z0-9+.-]*):\/\/(?:\[[^\]]*\]|[^/:?#]*)(?::(\d+))?/i.exec(target);
    if (match) {
      port = match[2] ? Number(match[2]) : match[1].toLowerCase() === "https" ? 443 : 80;
    }
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }
  return { tunnel, port, line };
}

/** XPCOM status codes are failures when the top bit is set. */
function isSuccess(status) {
  return (status & 0x80000000) === 0;
}

let statusNames = null;

/** The Cr name of an XPCOM status code, for logs. */
function statusName(status) {
  statusNames ??= new Map(Object.entries(Cr).map(([name, code]) => [code, name]));
  return statusNames.get(status) || `0x${(status >>> 0).toString(16)}`;
}

function closeTransport(transport) {
  try {
    transport.close(Cr.NS_OK);
  } catch {
    // Already closed.
  }
}

function handleClient(ip, id, client, connections, stats) {
  const tag = `[${ip} #${id}]`;
  trace(`${tag} accepted`);
  const clientIn = client.openInputStream(0, 0, 0).QueryInterface(Ci.nsIAsyncInputStream);
  const clientOut = client.openOutputStream(0, 0, 0);
  const reader = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
  reader.setInputStream(clientIn);

  let upstream = null;
  let closed = false;
  const connection = {
    close() {
      if (!closed) {
        trace(`${tag} closed`);
      }
      closed = true;
      connections.delete(connection);
      closeTransport(client);
      if (upstream) {
        closeTransport(upstream);
      }
    },
  };
  connections.add(connection);

  const replyAndClose = (response) => {
    copyStream(stringStream(response), clientOut, true, false, () => connection.close());
  };

  const pipe = (upIn, upOut, port) => {
    // Either direction ending ends the tunnel. Errors after we closed it are our own doing.
    const finish = (direction) => (status) => {
      trace(`${tag} ${direction} ended: ${statusName(status)}`);
      if (!closed && !isSuccess(status) && status !== Cr.NS_BASE_STREAM_CLOSED) {
        logError(`Tunnel to ${ip}:${port} failed (${direction})`, statusName(status), stats);
      }
      connection.close();
    };
    copyStream(clientIn, upOut, true, true, finish("tab to server"));
    copyStream(upIn, clientOut, true, true, finish("server to tab"));
  };

  const connect = (request, head) => {
    const sts = Cc["@mozilla.org/network/socket-transport-service;1"].getService(
      Ci.nsISocketTransportService,
    );
    trace(`${tag} connecting to ${ip}:${request.port}`);
    upstream = sts.createTransport([], ip, request.port, null, null);

    // The socket reports its own connect through the event sink; that is what
    // starts the tunnel. Output-stream readiness is no signal: it fires before
    // the TCP connection exists, so a timer polls for a failed socket instead.
    let settled = false;
    const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;

    const settle = () => {
      if (settled || closed) {
        return false;
      }
      settled = true;
      timer.cancel();
      return true;
    };

    const fail = (reason) => {
      if (settle()) {
        logError(`Could not connect to ${ip}:${request.port}`, reason, stats);
        replyAndClose(BAD_GATEWAY);
      }
    };

    // Set before the streams open, since opening them starts the connect.
    upstream.setEventSink(
      {
        onTransportStatus(_transport, status) {
          if (status === Ci.nsISocketTransport.STATUS_CONNECTED_TO) {
            start();
          }
        },
      },
      mainThread(),
    );
    const upIn = upstream.openInputStream(0, 0, 0);
    const upOut = upstream.openOutputStream(0, 0, 0);

    function start() {
      if (!settle()) {
        return;
      }
      stats.connected += 1;
      trace(`${tag} connected to ${ip}:${request.port}`);
      // A tunnel answers the browser first; a plain request goes on to the server whole.
      const sink = request.tunnel ? clientOut : upOut;
      copyStream(stringStream(request.tunnel ? CONNECT_OK : head), sink, true, false, (status) => {
        if (!isSuccess(status)) {
          connection.close();
          return;
        }
        pipe(upIn, upOut, request.port);
      });
    }

    /** A failed socket throws its error on any write; one still connecting only would-blocks. */
    timer.initWithCallback(
      {
        notify() {
          if (settled) {
            return;
          }
          try {
            upOut.write("", 0);
          } catch (error) {
            if (error?.result !== Cr.NS_BASE_STREAM_WOULD_BLOCK) {
              fail(error);
              return;
            }
          }
          if (Date.now() > deadline) {
            fail(`no connection after ${CONNECT_TIMEOUT_MS / 1000}s`);
          }
        },
      },
      CONNECT_POLL_MS,
      Ci.nsITimer.TYPE_REPEATING_SLACK,
    );
  };

  let head = "";
  const onReady = {
    onInputStreamReady() {
      let available = 0;
      try {
        available = clientIn.available();
      } catch {
        connection.close();
        return;
      }
      if (available === 0) {
        connection.close();
        return;
      }

      head += reader.readBytes(available);
      const end = head.indexOf("\r\n\r\n");
      if (end < 0) {
        if (head.length > MAX_HEAD_BYTES) {
          replyAndClose(BAD_REQUEST);
          return;
        }
        clientIn.asyncWait(onReady, 0, 0, mainThread());
        return;
      }

      const request = parseRequestHead(head.slice(0, end));
      if (!request) {
        replyAndClose(BAD_REQUEST);
        return;
      }
      trace(`${tag} request: ${request.line}`);
      // A tunnel only starts after our 200, so nothing follows its head. A plain
      // request is forwarded whole, including any body bytes already read.
      connect(request, head);
    },
  };
  clientIn.asyncWait(onReady, 0, 0, mainThread());
}

function createHostProxy(ip) {
  const server = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
  // Any free port, loopback only, default backlog.
  server.init(-1, true, -1);
  trace(`[${ip}] proxy listening on 127.0.0.1:${server.port}`);
  const connections = new Set();
  /** Counters for the editor's status line. */
  const stats = { connected: 0, lastError: "" };
  let accepted = 0;
  server.asyncListen({
    onSocketAccepted(_server, client) {
      accepted += 1;
      try {
        handleClient(ip, accepted, client, connections, stats);
      } catch (error) {
        logError(`Could not accept a connection for ${ip}`, error, stats);
        closeTransport(client);
      }
    },
    onStopListening() {},
  });

  return {
    port: server.port,
    status() {
      return { ip, port: server.port, open: connections.size, ...stats };
    },
    close() {
      trace(`[${ip}] proxy stopped`);
      try {
        server.close();
      } catch {
        // Already closed.
      }
      for (const connection of [...connections]) {
        connection.close();
      }
    },
  };
}

function getExtensionError() {
  try {
    return ChromeUtils.importESModule("resource://gre/modules/ExtensionUtils.sys.mjs")
      .ExtensionUtils.ExtensionError;
  } catch {
    return undefined;
  }
}

/**
 * Firefox replaces any error an experiment throws with "An unexpected error
 * occurred" unless it is an ExtensionError, so rethrow as one to keep the
 * message. Same as the zenTabs experiment's helper.
 */
function exposeErrors(api) {
  const ExtensionError = getExtensionError();
  if (!ExtensionError) {
    return api;
  }
  return Object.fromEntries(
    Object.entries(api).map(([name, method]) => [
      name,
      async (...args) => {
        try {
          return await method(...args);
        } catch (error) {
          if (error instanceof ExtensionError) {
            throw error;
          }
          throw new ExtensionError(error?.message || String(error) || `${name} failed`);
        }
      },
    ]),
  );
}

this.zenHosts = class extends ExtensionAPI {
  onShutdown() {
    for (const proxy of this.proxies?.values() ?? []) {
      proxy.close();
    }
    this.proxies?.clear();
  }

  getAPI() {
    this.proxies ??= new Map();
    const proxies = this.proxies;

    return {
      zenHosts: exposeErrors({
        async startHostProxy(ip) {
          if (typeof ip !== "string" || !IP_PATTERN.test(ip)) {
            throw new Error("Invalid IP address.");
          }
          let proxy = proxies.get(ip);
          if (!proxy) {
            proxy = createHostProxy(ip);
            proxies.set(ip, proxy);
          }
          return proxy.port;
        },

        async getHostProxyStatus() {
          return {
            logPath: getLogFile().path,
            proxies: [...proxies.values()].map((proxy) => proxy.status()),
          };
        },

        async stopHostProxy(ip) {
          const proxy = proxies.get(ip);
          if (!proxy) {
            return false;
          }
          proxies.delete(ip);
          proxy.close();
          return true;
        },
      }),
    };
  }
};
