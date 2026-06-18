# Local AI Browser Assistant

## About this extension

A local AI browser assistant that uses Ollama or OMLX for chat inference. The extension provides a sidebar chat agent that can understand natural language commands and interact with your browser through a set of tools.

Chat stays on your machine through your selected local inference provider. Page search and history search use a small local embeddings model cached by the browser.

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
- Ollama or OMLX running locally
- A loaded chat model in your selected provider
- Node.js and pnpm

The default Ollama endpoint is:

```bash
http://127.0.0.1:11434/v1
```

OMLX is also supported at:

```bash
http://127.0.0.1:8090/v1
```

Choose the provider with `.env`:

```bash
VITE_INFERENCE_PROVIDER=ollama
VITE_INFERENCE_MODEL_ID=gemma3:latest
```

The sidebar can override only the selected model. Provider, base URL, and API key come from the build defaults.

Provider-specific env vars are also supported:

```bash
VITE_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
VITE_OLLAMA_MODEL_ID=gemma3:latest
VITE_OLLAMA_API_KEY=not-needed
VITE_OLLAMA_NUM_CTX=4096
VITE_INFERENCE_MAX_TOKENS=1024
VITE_INFERENCE_REQUEST_TIMEOUT_MS=120000
```

For a generic OpenAI-compatible local server:

```bash
VITE_INFERENCE_PROVIDER=openai
VITE_OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:3001/v1
VITE_OPENAI_COMPATIBLE_MODEL_ID=
VITE_OPENAI_COMPATIBLE_API_KEY=not-needed
```

The legacy OMLX env vars still work for OMLX builds:

```bash
VITE_OMLX_BASE_URL=http://127.0.0.1:8090/v1
VITE_OMLX_MODEL_ID=gemma-4-26b-a4b-it-4bit
VITE_OMLX_API_KEY=not-needed
```

If no model is selected, the extension discovers models from `/v1/models` and prefers a model with `gemma` in its id. You can also pick the model from the extension header.

For memory-constrained local runs, keep `VITE_OLLAMA_NUM_CTX` modest. Ollama may default to a much larger context on Apple Silicon, which increases memory pressure for larger models.

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

1. Start Ollama or OMLX.
2. Click the extension icon to open the sidebar.
3. Pick the model in the sidebar header.
4. On first use, download the small embeddings model for page search.
5. Chat with the assistant.

## Architecture

```txt
User Input (Side Panel)
    ↓
Background Script (Agent)
    ↓
Ollama or OMLX /v1/chat/completions
    ↓
Local model running on your Mac
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
