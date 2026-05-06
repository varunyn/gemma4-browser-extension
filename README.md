# Gemma 4 OMLX Browser Assistant

## About this extension

A local AI browser assistant that uses your OMLX server for Gemma 4 chat inference. The extension provides a sidebar chat agent that can understand natural language commands and interact with your browser through a set of tools.

Chat stays on your machine through OMLX. Page search and history search use a small local embeddings model cached by the browser.

### What can it do?

#### Tab Management

- **get_open_tabs**: List open tabs with their titles, URLs, and descriptions
- **go_to_tab**: Switch to a specific tab by ID
- **open_url**: Open URLs in background or foreground tabs
- **close_tab**: Close specific tabs

#### Website Interaction

- **ask_website**: Extract and search content from the current webpage, then answer using the relevant page excerpts.
- **highlight_website_element**: Highlight and scroll to a referenced page element.

#### History Search

- **find_history**: Search browsing history semantically using embedded page titles, descriptions, and URLs stored in IndexedDB.

## Setup

### Prerequisites

- Chrome
- OMLX running locally
- A loaded Gemma model in OMLX
- Node.js and pnpm

The default OMLX endpoint is:

```bash
http://127.0.0.1:8090/v1
```

You can override it with `.env`:

```bash
VITE_OMLX_BASE_URL=http://127.0.0.1:8090/v1
VITE_OMLX_MODEL_ID=gemma-4-26b-a4b-it-4bit
VITE_OMLX_API_KEY=not-needed
```

If `VITE_OMLX_MODEL_ID` is empty, the extension discovers models from `/v1/models` and prefers a model with `gemma` in its id.

### Install

```bash
pnpm install
pnpm run build
```

Then load the extension:

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click Load unpacked
4. Select the `dist` folder

## Usage

1. Start OMLX.
2. Click the extension icon to open the sidebar.
3. On first use, download the small embeddings model for page search.
4. Chat with the assistant.

## Architecture

```txt
User Input (Side Panel)
    ↓
Background Script (Agent)
    ↓
OMLX /v1/chat/completions
    ↓
Gemma 4 running locally on your Mac
    ↓
Browser tools when needed
    ↓
Side Panel response
```

The content script extracts visible page content and can highlight elements. The background script coordinates the agent, tools, embeddings, and OMLX chat requests.

## Debugging

Expand a tool call in the chat to inspect the raw tool result. For page extraction debugging, open the page DevTools console and look for:

```txt
[gemma4-extension] extracted page parts
[gemma4-extension] ask_website result
```
