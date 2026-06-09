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
import { colors, radius, shadow, spacing } from '../theme';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: colors.textSubtle,
  info: colors.info,
  warn: colors.warning,
  error: colors.expense,
  fatal: colors.danger,
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: 'rgba(120,132,126,0.12)',
  info: colors.infoSoft,
  warn: colors.warningSoft,
  error: colors.expenseSoft,
  fatal: colors.dangerSoft,
};

const FILTER_LEVELS: (LogLevel | 'all')[] = ['all', 'fatal', 'error', 'warn', 'info', 'debug'];

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
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgAlt,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  headerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '700',
  },
  copyBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentStrong,
  },
  copyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterBtn: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  filterText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.accent,
  },
  filterCount: {
    fontSize: 11,
    color: colors.textSubtle,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.sm,
  },
  entry: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  entryTime: {
    fontSize: 11,
    color: colors.textSubtle,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.white,
  },
  entryTag: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  entryMessage: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  entryDetail: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    color: colors.textSubtle,
  },
});
