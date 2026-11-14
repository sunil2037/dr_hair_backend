import { BadRequestError } from '../../../shared/errors/index.js';

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 1200;
const MAX_HISTORY_LENGTH = 6000;

export class StreamPatientAssistantReplyUseCase {
  constructor({ geminiAiService }) {
    this.geminiAiService = geminiAiService;
  }

  normalizeMessages(input) {
    if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) {
      throw new BadRequestError(`messages must contain between 1 and ${MAX_MESSAGES} entries.`);
    }

    const messages = input.map((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '';
      const content = typeof item?.content === 'string' ? item.content.trim() : '';
      if (!role || !content || content.length > MAX_MESSAGE_LENGTH) {
        throw new BadRequestError('Each message needs a supported role and text up to 1200 characters.');
      }
      return { role, content };
    });

    if (messages[0].role !== 'user' || messages.at(-1).role !== 'user') {
      throw new BadRequestError('Conversation must start with a user message and end with a user message.');
    }
    for (let index = 1; index < messages.length; index += 1) {
      if (messages[index].role === messages[index - 1].role) {
        throw new BadRequestError('Conversation messages must alternate between user and assistant.');
      }
    }
    if (messages.reduce((sum, message) => sum + message.content.length, 0) > MAX_HISTORY_LENGTH) {
      throw new BadRequestError('Conversation history is too long. Start a new chat and try again.');
    }
    return messages;
  }

  async execute({ messages, onToken, signal }) {
    const normalizedMessages = this.normalizeMessages(messages);
    return this.geminiAiService.streamAssistantReply({
      messages: normalizedMessages,
      onToken,
      signal,
    });
  }
}
