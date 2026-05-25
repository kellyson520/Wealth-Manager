import { v4 as uuidv4 } from 'uuid';
import { storeMemory, MemoryType } from '../memory-engine';
import { storeVector } from '../../vector/vector-store';
import { generateEmbedding } from '../embedding/embedding-service';
import { captureError } from '../../logger/logger';
import type { AgentId } from '../../../shared/types';

export interface BufferItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokens: number;
  embedding?: number[];
}

interface BufferStats {
  turns: number;
  totalTokens: number;
  avgTokensPerTurn: number;
  oldestTimestamp: string;
  newestTimestamp: string;
}

const CJK_RATIO = 2.0;

export class EpisodicBuffer {
  private maxTurns: number;
  private maxTokens: number;
  private buffer: BufferItem[] = [];
  private sessionId: string;
  private agentId: AgentId;
  private totalTokens: number = 0;

  constructor(
    sessionId: string,
    agentId: AgentId = 'master',
    maxTurns: number = 20,
    maxTokens: number = 4000
  ) {
    this.sessionId = sessionId;
    this.agentId = agentId;
    this.maxTurns = maxTurns;
    this.maxTokens = maxTokens;
  }

  async add(
    role: 'user' | 'assistant' | 'system',
    content: string,
    persistToDb: boolean = true
  ): Promise<BufferItem> {
    const item: BufferItem = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date().toISOString(),
      tokens: this.countTokens(content),
    };

    this.buffer.push(item);
    this.totalTokens += item.tokens;

    try {
      await generateEmbedding(content, 128).then((emb) => {
        item.embedding = emb;
      });
    } catch {
      /* embedding is optional for buffer operation */
    }

    this.trimToLimit();

    if (persistToDb) {
      await this.persist(item);
    }

    return item;
  }

  getRecent(count: number = 10): BufferItem[] {
    return this.buffer.slice(-count);
  }

  getLastN(n: number): BufferItem[] {
    return this.buffer.slice(-n);
  }

  getTurnByIndex(index: number): BufferItem | undefined {
    if (index < 0) {
      return this.buffer[this.buffer.length + index];
    }
    return this.buffer[index];
  }

  formatAsPrompt(maxChars: number = 2000): string {
    const lines: string[] = [];
    let charCount = 0;

    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const item = this.buffer[i];
      const roleLabel =
        item.role === 'user' ? '用户' :
        item.role === 'assistant' ? '助手' : '系统';
      const line = `${roleLabel}: ${item.content}`;
      if (charCount + line.length > maxChars) break;
      lines.unshift(line);
      charCount += line.length;
    }

    return lines.join('\n');
  }

  formatForAgent(
    systemPrompt: string = '',
    maxHistoryChars: number = 3000
  ): { role: 'system' | 'user' | 'assistant'; content: string }[] {
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    let charCount = systemPrompt.length;

    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const item = this.buffer[i];
      if (charCount + item.content.length > maxHistoryChars) break;

      messages.unshift({
        role: item.role,
        content: item.content,
      });
      charCount += item.content.length;
    }

    return messages;
  }

  getAllContent(): string {
    const labels: Record<string, string> = {
      user: 'User',
      assistant: 'Assistant',
      system: 'System',
    };
    return this.buffer
      .map((item) => `${labels[item.role]}: ${item.content}`)
      .join('\n');
  }

  getOnlyUserMessages(): BufferItem[] {
    return this.buffer.filter((item) => item.role === 'user');
  }

  getOnlyAssistantMessages(): BufferItem[] {
    return this.buffer.filter((item) => item.role === 'assistant');
  }

  getTokenCount(): number {
    return this.totalTokens;
  }

  getTurnCount(): number {
    return this.buffer.length;
  }

  getBufferStats(): BufferStats {
    const turns = this.buffer.length;
    const totalTokens = this.totalTokens;
    const avgTokensPerTurn = turns > 0 ? Math.round(totalTokens / turns) : 0;

    const timestamps = this.buffer
      .map((item) => item.timestamp)
      .sort();

    return {
      turns,
      totalTokens,
      avgTokensPerTurn,
      oldestTimestamp: timestamps[0] || '',
      newestTimestamp: timestamps[timestamps.length - 1] || '',
    };
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getAgentId(): AgentId {
    return this.agentId;
  }

  clear(): void {
    this.buffer = [];
    this.totalTokens = 0;
  }

  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  countTokens(text: string): number {
    let tokens = 0;

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);

      if (code >= 0x4E00 && code <= 0x9FFF) {
        tokens += CJK_RATIO;
      } else if (code >= 0x3400 && code <= 0x4DBF) {
        tokens += CJK_RATIO;
      } else if (
        (code >= 0x30A0 && code <= 0x30FF) ||
        (code >= 0x3040 && code <= 0x309F)
      ) {
        tokens += CJK_RATIO * 0.5;
      } else if (
        (code >= 0x41 && code <= 0x5A) ||
        (code >= 0x61 && code <= 0x7A)
      ) {
        tokens += 1;
      } else if (code >= 0x30 && code <= 0x39) {
        tokens += 1;
      } else if (
        code === 0x20 || code === 0x0A || code === 0x0D || code === 0x09
      ) {
        tokens += 0.5;
      } else if (code < 0x80) {
        tokens += 1;
      } else {
        tokens += CJK_RATIO * 0.5;
      }
    }

    return Math.max(1, Math.ceil(tokens / 2));
  }

  private trimToLimit(): void {
    while (this.buffer.length > this.maxTurns) {
      const removed = this.buffer.shift();
      if (removed) {
        this.totalTokens -= removed.tokens;
      }
    }

    while (this.totalTokens > this.maxTokens && this.buffer.length > 2) {
      const removed = this.buffer.shift();
      if (removed) {
        this.totalTokens -= removed.tokens;
      }
    }
  }

  private async persist(item: BufferItem): Promise<void> {
    try {
      const memoryType: MemoryType =
        item.role === 'user' ? 'context' :
        item.role === 'assistant' ? 'fact' : 'context';

      const memEntry = await storeMemory({
        layer: 'working',
        type: memoryType,
        agentId: this.agentId,
        content: item.content,
        metadata: {
          sessionId: this.sessionId,
          role: item.role,
          timestamp: item.timestamp,
          tokens: item.tokens,
        },
        importance: item.role === 'user' ? 0.5 : 0.3,
        tags: ['session', this.sessionId],
      });

      if (memEntry && item.embedding) {
        await storeVector({
          text: item.content,
          sourceType: 'memory',
          sourceId: memEntry.id,
          metadata: {
            sessionId: this.sessionId,
            role: item.role,
            memoryId: memEntry.id,
          },
          dim: 128,
        });
      }
    } catch (e) {
      captureError('EpisodicBuffer.persist', e, 'Failed to persist buffer item');
    }
  }
}
