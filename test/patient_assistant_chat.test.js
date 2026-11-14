import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { StreamPatientAssistantReplyUseCase } from '../src/modules/ai/application/StreamPatientAssistantReplyUseCase.js';
import { GeminiAiService } from '../src/modules/ai/infrastructure/GeminiAiService.js';
import { PatientAssistantController } from '../src/modules/ai/presentation/patient-assistant.controller.js';

test('patient assistant validates bounded, alternating chat history before calling AI', async () => {
  const calls = [];
  const useCase = new StreamPatientAssistantReplyUseCase({
    geminiAiService: {
      async streamAssistantReply(args) { calls.push(args); },
    },
  });

  await assert.rejects(
    useCase.execute({ messages: [{ role: 'user', content: '  ' }], onToken() {} }),
    /supported role and text/,
  );
  await assert.rejects(
    useCase.execute({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'user', content: 'Again' },
      ],
      onToken() {},
    }),
    /alternate/,
  );
  await assert.rejects(
    useCase.execute({ messages: [{ role: 'assistant', content: 'Not a user turn' }], onToken() {} }),
    /start with a user message/,
  );

  await useCase.execute({
    messages: [
      { role: 'user', content: 'What can cause dry scalp?' },
      { role: 'assistant', content: 'There are several common causes.' },
      { role: 'user', content: 'What should I try first?' },
    ],
    onToken() {},
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].messages.length, 3);
});

test('Gemini assistant streams SSE text and keeps the API key out of query strings', async () => {
  let request;
  const encoder = new TextEncoder();
  const events = [
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Start ' }] } }] })}\n\n`,
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'streaming.' }] } }] })}\n\n`,
  ];
  const service = new GeminiAiService({
    apiKey: 'server-only-test-key',
    model: 'gemini-test',
    logger: { warn() {} },
    fetchFn: async (url, options) => {
      request = { url, options };
      return new Response(new ReadableStream({
        start(controller) {
          for (const event of events) controller.enqueue(encoder.encode(event));
          controller.close();
        },
      }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    },
  });
  const chunks = [];
  await service.streamAssistantReply({
    messages: [{ role: 'user', content: 'Help with dry scalp' }],
    onToken: async (chunk) => chunks.push(chunk),
  });

  assert.match(request.url, /models\/gemini-test:streamGenerateContent\?alt=sse/);
  assert.doesNotMatch(request.url, /server-only-test-key/);
  assert.equal(request.options.headers['x-goog-api-key'], 'server-only-test-key');
  assert.deepEqual(chunks, ['Start ', 'streaming.']);
});

test('Gemini assistant fails closed when no API key or provider response is available', async () => {
  const missingKey = new GeminiAiService({ apiKey: '', logger: { warn() {} } });
  await assert.rejects(
    missingKey.streamAssistantReply({ messages: [{ role: 'user', content: 'Help' }], onToken() {} }),
    /not configured/,
  );

  const unavailable = new GeminiAiService({
    apiKey: 'test-key',
    fetchFn: async () => new Response('not available', { status: 503 }),
    logger: { warn() {} },
  });
  await assert.rejects(
    unavailable.streamAssistantReply({ messages: [{ role: 'user', content: 'Help' }], onToken() {} }),
    /temporarily unavailable/,
  );
});

test('patient assistant controller returns incrementally framed SSE deltas', async () => {
  const useCase = new StreamPatientAssistantReplyUseCase({
    geminiAiService: {
      async streamAssistantReply({ onToken }) {
        await onToken('Hello ');
        await onToken('there.');
      },
    },
  });
  const controller = new PatientAssistantController({
    streamPatientAssistantReplyUseCase: useCase,
  });
  class MockResponse extends EventEmitter {
    statusCode = 0;
    headers = {};
    chunks = [];
    writableEnded = false;
    destroyed = false;

    status(code) { this.statusCode = code; return this; }
    set(headers) { this.headers = headers; return this; }
    flushHeaders() {}
    flush() {}
    write(chunk) { this.chunks.push(chunk); return true; }
    end() { this.writableEnded = true; }
  }

  const response = new MockResponse();
  let forwardedError = null;
  await controller.streamChat(
    { body: { messages: [{ role: 'user', content: 'Hello' }] } },
    response,
    (error) => { forwardedError = error; },
  );

  assert.equal(forwardedError, null);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.equal(response.writableEnded, true);
  assert.ok(response.chunks.some((chunk) => chunk.includes('"text":"Hello "')));
  assert.ok(response.chunks.some((chunk) => chunk.includes('"text":"there."')));
  assert.ok(response.chunks.some((chunk) => chunk.includes('"type":"done"')));
});
