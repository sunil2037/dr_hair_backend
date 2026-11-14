export class PatientAssistantController {
  constructor({ streamPatientAssistantReplyUseCase }) {
    this.streamPatientAssistantReplyUseCase = streamPatientAssistantReplyUseCase;
  }

  streamChat = async (req, res, next) => {
    let messages;
    try {
      messages = this.streamPatientAssistantReplyUseCase.normalizeMessages(req.body?.messages);
    } catch (error) {
      return next(error);
    }

    const abortController = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abortController.abort();
    };
    res.on('close', onClose);
    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(': assistant stream ready\n\n');
    res.flush?.();

    try {
      await this.streamPatientAssistantReplyUseCase.execute({
        messages,
        signal: abortController.signal,
        onToken: async (text) => {
          if (res.destroyed || abortController.signal.aborted) return;
          res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
          res.flush?.();
        },
      });
      if (!res.destroyed && !abortController.signal.aborted) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      }
    } catch (error) {
      if (!res.destroyed && !abortController.signal.aborted) {
        const message = error?.statusCode === 503
          ? error.message
          : 'The assistant could not finish this reply. Please try again.';
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.end();
      }
    } finally {
      res.off('close', onClose);
    }
  };
}
