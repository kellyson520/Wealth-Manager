import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LogEntry, LogLevel } from '../../shared/types';
import { logger } from '../../core/logger/logger';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '#6B7280',
  info: '#60A5FA',
  warn: '#FBBF24',
  error: '#EF4444',
  fatal: '#DC2626',
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: 'rgba(107,114,128,0.15)',
  info: 'rgba(96,165,250,0.15)',
  warn: 'rgba(251,191,36,0.15)',
  error: 'rgba(239,68,68,0.15)',
  fatal: 'rgba(220,38,38,0.2)',
};

const FILTER_LEVELS: (LogLevel | 'all')[] = ['all', 'error', 'warn', 'info', 'debug'];

export default function LogScreen() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setEntries(logger.getLogs());
  }, []);

  useEffect(() => {
    refresh();
    return logger.subscribe(refresh);
  }, [refresh]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => e.level === filter);
  }, [entries, filter]);

  const handleCopyAll = useCallback(async () => {
    const text = logger.exportString();
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
        Alert.alert('已复制', `已复制 ${entries.length} 条日志到剪贴板`);
      } catch {
        Alert.alert('复制失败', '请手动选择并复制日志内容');
      }
    } else {
      try {
        await Clipboard.setStringAsync(text);
        Alert.alert('已复制', `已复制 ${entries.length} 条日志到剪贴板`);
      } catch {
        Alert.alert('复制失败', '请重试');
      }
    }
  }, [entries.length]);

  const handleCopyOne = useCallback(async (entry: LogEntry) => {
    const text = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.tag}] ${entry.message}${entry.detail ? '\n' + entry.detail : ''}`;
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
      } catch { /* ignore */ }
    } else {
      try {
        await Clipboard.setStringAsync(text);
      } catch { /* ignore */ }
    }
  }, []);

  const handleClear = useCallback(() => {
    logger.clear();
    setEntries([]);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LogEntry }) => {
      const isExpanded = expandedId === item.id;
      const time = item.timestamp.slice(11, 19);
      return (
        <TouchableOpacity
          style={[styles.entry, { backgroundColor: LEVEL_BG[item.level] }]}
          onPress={() => toggleExpand(item.id)}
          onLongPress={() => handleCopyOne(item)}
          activeOpacity={0.7}
        >
          <View style={styles.entryHeader}>
            <Text style={styles.entryTime}>{time}</Text>
            <View style={[styles.levelBadge, { backgroundColor: LEVEL_COLORS[item.level] }]}>
              <Text style={styles.levelText}>{item.level.toUpperCase()}</Text>
            </View>
            <Text style={styles.entryTag}>{item.tag}</Text>
          </View>
          <Text style={styles.entryMessage} numberOfLines={isExpanded ? undefined : 2}>
            {item.message}
          </Text>
          {isExpanded && item.detail ? (
            <Text style={styles.entryDetail}>{item.detail}</Text>
          ) : null}
        </TouchableOpacity>
      );
    },
    [expandedId, toggleExpand, handleCopyOne]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      c[e.level] = (c[e.level] || 0) + 1;
    }
    return c;
  }, [entries]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>应用日志</Text>
          <Text style={styles.headerSub}>{entries.length} 条记录</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleClear}>
            <Text style={styles.actionBtnText}>清空</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.copyBtn} onPress={handleCopyAll}>
            <Text style={styles.copyBtnText}>复制全部</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTER_LEVELS.map((lvl) => (
          <TouchableOpacity
            key={lvl}
            style={[styles.filterBtn, filter === lvl && styles.filterBtnActive]}
            onPress={() => setFilter(lvl)}
          >
            <Text style={[styles.filterText, filter === lvl && styles.filterTextActive]}>
              {lvl === 'all' ? '全部' : lvl.toUpperCase()}
              {counts[lvl] !== undefined && (
                <Text style={styles.filterCount}> ({counts[lvl]})</Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {entries.length === 0 ? '暂无日志记录' : '没有匹配的日志'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#12122a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  headerSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2a2a3e',
  },
  actionBtnText: {
    fontSize: 13,
    color: '#ccc',
  },
  copyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#4A90D9',
  },
  copyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#0f0f23',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e3e',
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#1e1e3e',
  },
  filterBtnActive: {
    backgroundColor: '#4A90D9',
  },
  filterText: {
    fontSize: 12,
    color: '#999',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  filterCount: {
    fontSize: 11,
    color: '#888',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 8,
  },
  entry: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  entryTime: {
    fontSize: 11,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  entryTag: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
  },
  entryMessage: {
    fontSize: 13,
    color: '#ddd',
    lineHeight: 18,
  },
  entryDetail: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
});
