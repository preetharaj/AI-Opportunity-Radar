// scripts/phase3/lib/ollama.mjs
//
// Wraps local Ollama inference (primary) with a free-tier cloud fallback
// (Groq or Google AI Studio), per PRD §7.1.
//
// IMPORTANT ASSUMPTION (flagging, not deciding for you):
// The PRD says the workflow should "programmatically spin up an ephemeral
// background instance of Ollama" inside the GitHub Actions runner. This file
// assumes Ollama is already installed and the daemon already started by the
// workflow YAML (see .github/workflows/discovery.yml — it uses
// `ollama serve &` plus a healthcheck loop before this script ever runs).
// This script does not install or launch the Ollama binary itself, because
// doing process management for a long-running daemon from inside a one-shot
// Node script is fragile (orphaned processes, log capture, shutdown races).
// Provisioning belongs in the workflow step, inference calls belong here.
//
// FALLBACK ASSUMPTION: PRD §7.1 names two free-tier cloud options (Google AI
// Studio Gemini Flash free tier, Groq). This implements Groq's OpenAI-
// compatible chat completions endpoint, since it has the simplest
// structured-output story (json_schema response_format) and the most
// generous free-tier rate limit as of this writing. If you'd rather use
// Gemini Flash, the call site in discover.mjs only depends on the
// `structuredChat()` function below, so swapping the implementation is a
// contained change to this one file.

import { z } from "zod";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 4 * 60 * 60 * 1000); // 4h, PRD risk mitigation
const GROQ_API_KEY = process.env.GROQ_API_KEY; // optional — only needed for fallback
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

/**
 * Checks whether the local Ollama daemon is up and the target model is
 * pulled. Used by discover.mjs to decide local-vs-cloud before spending any
 * inference time.
 */
export async function isOllamaReady() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return models.some((name) => name === OLLAMA_MODEL || name.startsWith(OLLAMA_MODEL.split(":")[0]));
  } catch {
    return false;
  }
}

/**
 * Runs one structured-output chat completion against local Ollama, using
 * the JSON-Schema-constrained `format` field (Ollama >= 0.3.0) so the model
 * is decode-constrained to the schema rather than just asked nicely.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {import('zod').ZodSchema} zodSchema
 * @returns {Promise<{ raw: string, source: 'ollama' | 'groq' }>}
 */
export async function structuredChat(systemPrompt, userPrompt, zodSchema) {
  // CRITICAL: do not reintroduce the `zod-to-json-schema` npm package here.
  // It is built against Zod v3's internal `_def` shape and, as of Zod v4,
  // silently returns `{}` for any real schema — no error thrown, it just
  // produces an empty/useless JSON Schema, which means Ollama's `format`
  // constraint (and Groq's response_format) would do nothing. Confirmed by
  // direct testing against this exact schema during implementation review.
  // Zod v4 ships its own correct converter — use that.
  const jsonSchema = z.toJSONSchema(zodSchema);

  const ready = await isOllamaReady();
  if (ready) {
    try {
      return { raw: await callOllama(systemPrompt, userPrompt, jsonSchema), source: "ollama" };
    } catch (err) {
      console.warn(`[ollama] local inference failed, falling back to cloud: ${err.message}`);
    }
  } else {
    console.warn("[ollama] local daemon/model not ready, falling back to cloud");
  }

  if (!GROQ_API_KEY) {
    throw new Error(
      "Local Ollama unavailable and GROQ_API_KEY not set — cannot run discovery pass. " +
        "Set GROQ_API_KEY as a repo secret to enable the free-tier fallback, or fix local inference."
    );
  }
  return { raw: await callGroq(systemPrompt, userPrompt, jsonSchema), source: "groq" };
}

async function callOllama(systemPrompt, userPrompt, jsonSchema) {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      format: jsonSchema,
      stream: false,
      options: { temperature: 0 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama returned HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.message?.content ?? "";
}

async function callGroq(systemPrompt, userPrompt, jsonSchema) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "discovery_response", schema: jsonSchema },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Groq returned HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
