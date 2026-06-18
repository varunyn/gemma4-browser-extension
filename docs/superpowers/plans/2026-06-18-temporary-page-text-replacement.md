# Temporary Page Text Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general tool that lets the assistant temporarily replace visible page text by extracted element ID.

**Architecture:** Reuse the existing `ask_website` extraction registry and content-script message channel. The background exposes a `replace_page_text` WebMCP tool, and the content script applies replacements to registered elements only; refresh restores the original page.

**Tech Stack:** Chrome extension MV3, TypeScript, Vite, existing WebMCP-style tool registry.

---

### Task 1: Tool Schema Support

**Files:**
- Modify: `src/background/agent/webMcp.tsx`

- [ ] Add `array` support to `WebMCPProperty`.
- [ ] Update argument validation so array values pass through unchanged.
- [ ] Verify with `pnpm run build`.

### Task 2: Content Script DOM Replacement

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/content/utils/elementRegistry.ts`
- Modify: `src/content/content.ts`

- [ ] Add `REPLACE_TEXT` to `ContentTasks`.
- [ ] Add a registry helper that replaces text for known IDs only.
- [ ] Handle `REPLACE_TEXT` messages and return per-ID results.
- [ ] Keep edits temporary by avoiding storage or persistence.

### Task 3: Background Tool Wiring

**Files:**
- Modify: `src/shared/tools.ts`
- Modify: `src/background/tools/askWebsite.ts`
- Modify: `src/background/background.ts`
- Modify: `src/background/agent/Agent.ts`

- [ ] Add `replace_page_text` to the available tool list.
- [ ] Implement a WebMCP tool that accepts an array of `{ id, text }`.
- [ ] Send the replacement request through the same content-script injection retry path.
- [ ] Update the system prompt so the model knows it can edit visible page text when asked.
- [ ] Verify with `pnpm run build`.
