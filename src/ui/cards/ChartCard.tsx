import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChartCardData } from '../../shared/types';

interface ChartCardProps {
  data: ChartCardData;
}

const CHART_ICONS: Record<string, string> = {
  pie: '🍩',
  line: '📈',
  bar: '📊',
  gauge: '⏱️',
  stacked_bar: '📊',
  sankey: '🔀',
  radar: '📡',
  heatmap: '🌡️',
};

const CHART_LABELS: Record<string, string> = {
  pie: '分类饼图',
  line: '趋势折线图',
  bar: '收支柱状图',
  gauge: '预算仪表盘',
  stacked_bar: '堆叠柱状图',
  sankey: '桑基图',
  radar: '雷达图',
  heatmap: '热力图',
};

export default function ChartCard({ data }: ChartCardProps) {
  const icon = CHART_ICONS[data.chartType] || '📊';
  const label = CHART_LABELS[data.chartType] || data.chartType;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{data.title || label}</Text>
          <Text style={styles.subtitle}>{label}</Text>
        </View>
      </View>

      <View style={styles.chartPlaceholder}>
        <Text style={styles.placeholderIcon}>{icon}</Text>
        <Text style={styles.placeholderText}>图表区域</Text>
        <Text style={styles.placeholderHint}>
          点击查看完整图表
        </Text>
      </View>

      {data.insight ? (
        <View style={styles.insightRow}>
          <Text style={styles.insightIcon}>💡</Text>
          <Text style={styles.insightText}>{data.insight}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 0,
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  chartPlaceholder: {
    margin: 14,
    height: 180,
    backgroundColor: '#12122a',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4e',
    borderStyle: 'dashed',
  },
  placeholderIcon: {
    fontSize: 40,
    marginBottom: 8,
    opacity: 0.6,
  },
  placeholderText: {
    fontSize: 14,
    color: '#aaa',
    fontWeight: '600',
  },
  placeholderHint: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  insightRow: {
    flexDirection: 'row',
    padding: 14,
    paddingTop: 0,
    alignItems: 'flex-start',
  },
  insightIcon: {
    fontSize: 14,
    marginRight: 6,
    marginTop: 1,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: '#bbb',
    lineHeight: 18,
  },
});
