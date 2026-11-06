---
title: DevTools
description: A DevTools panel that lists calls and streams with their inputs and decoded responses.
---

# DevTools

Bodies are binary, so the Network tab shows bytes. The ts-bin-rpc extension adds a panel to
Chrome and Firefox DevTools that lists the page's calls and streams and shows each one decoded: the
input as the client passed it, the response with its types (dates, bigints, typed arrays, maps),
errors with their code and data.

## Install

The extension is not in the Chrome Web Store or on Firefox Add-ons yet. To install it from the
build:

**Chrome, Edge and other Chromium browsers**

1. Download [ts-bin-rpc-devtools.zip](https://tom4ikss.github.io/ts-bin-RPC/ts-bin-rpc-devtools.zip)
   and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the
   unzipped folder.

**Firefox 128 or later**

1. Download [ts-bin-rpc-devtools-firefox.zip](https://tom4ikss.github.io/ts-bin-RPC/ts-bin-rpc-devtools-firefox.zip).
2. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick the zip
   itself, without unzipping it.

Firefox keeps a temporary add-on until it restarts: load it again after that. Firefox Developer
Edition and Nightly can keep it for good with `xpinstall.signatures.required` set to `false` in
`about:config`, installed from `about:addons`.
If the panel keeps asking to reload the page, Firefox has not let the extension into the site: in
`about:addons`, open the extension's **Permissions** and allow access to all websites.

Then reload the page you are debugging and open DevTools: the panel is called **ts-bin-rpc**.
Clients report to it from ts-bin-rpc 0.3.2; there is nothing to set up in your code.

To build it from the repository instead: `pnpm --filter @tbr/devtools build`, then load
`packages/devtools/dist/chromium` or `packages/devtools/dist/firefox`.

## The panel

- **The list** has one row per call or stream: procedure, `POST`, `GET` for
  [queries](./queries.md) or `stream`, status, sizes, time. Failed calls are red. A ⚠ marks a
  procedure whose contract hash differs between the client and the server: one side runs an old
  `tbr.gen.ts`.
- **Response** shows the output as a tree, as the Console does. An array of objects can be
  switched to a table, one column per field.
- **Request** shows the input as the caller passed it.
- **Info** has the status, times, sizes and both contract hashes.
- **Batches**, for a stream, lists the batches as they arrive and shows the latest one, usually as
  a table. Pick a batch to stay on it.

The filter matches procedure names; ↑ and ↓ move between rows, Esc closes the details.

## How it works

The extension defines `globalThis.__TBR_DEVTOOLS__` before the page's scripts run. After each call
the client hands it the input, the response bytes and the generated codec of the procedure; a
subscription hands it every batch. Nothing is decoded until you open a row, and then it is the
page's own codecs that decode it, so the panel needs no schema and always matches the generated
code. Without the extension the client finds no hook and does nothing more.

The page keeps the last 500 calls and streams, 200 batches per stream and 64 MB of bodies; older
ones drop out. A reload starts over.

Calls that never reach the server, such as a failed `fetch` or an input the encoder rejects, are
not listed: they throw in your code, and the Network tab shows the failed request.

Without the extension, `debug: true` on the client logs every call to the console, and
`tbr decode` prints a captured body: see [debugging](./server-client.md#debugging).
