import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChartCardData } from '../../shared/types';
import { EChartsSandbox } from '../charts';
import { colors, radius, shadow, spacing } from '../theme';

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

const CHART_COLORS = [colors.accent, colors.income, colors.expense, colors.purple, colors.warning];

function buildEChartsConfig(data: ChartCardData): Record<string, unknown> {
  const { config, chartType, title } = data;
  const series = config.series as Record<string, unknown> | undefined;

  const baseOption: Record<string, unknown> = {
    backgroundColor: 'transparent',
    title: {
      text: title || CHART_LABELS[chartType],
      textStyle: { color: colors.textMuted, fontSize: 12 },
      left: 'center',
      top: 4,
    },
    tooltip: { trigger: chartType === 'pie' ? 'item' : 'axis' },
    grid: { top: 40, bottom: 30, left: 50, right: 20 },
    legend: {
      bottom: 0,
      textStyle: { color: colors.textMuted, fontSize: 10 },
      itemWidth: 10,
      itemHeight: 10,
    },
  } as Record<string, unknown>;

  switch (chartType) {
    case 'pie': {
      const pieData = (series as { data?: { name: string; value: number }[] })?.data || [];
      const legend = baseOption.legend as Record<string, unknown>;
      return {
        ...baseOption,
        grid: undefined,
        tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
        legend: {
          ...legend,
          orient: 'vertical',
          right: 4,
          top: 30,
          bottom: undefined,
        },
        series: [{
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['40%', '55%'],
          avoidLabelOverlap: false,
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' },
          },
          data: pieData,
        }],
      };
    }

    case 'line': {
      const lineData = series as { xAxis?: string[]; data?: { name: string; data: number[] }[] } | undefined;
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: lineData?.xAxis || [],
          axisLine: { lineStyle: { color: colors.borderStrong } },
          axisLabel: { color: colors.textSubtle, fontSize: 10, rotate: 30 },
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          axisLabel: { color: colors.textSubtle, fontSize: 10 },
          splitLine: { lineStyle: { color: colors.border } },
        },
        series: (lineData?.data || []).map((s, i) => ({
          type: 'line',
          name: s.name,
          data: s.data,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2 },
          color: CHART_COLORS[i % CHART_COLORS.length],
        })),
      };
    }

    case 'bar':
    case 'stacked_bar': {
      const barData = series as { xAxis?: string[]; data?: { name: string; data: number[] }[] } | undefined;
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: barData?.xAxis || [],
          axisLine: { lineStyle: { color: colors.borderStrong } },
          axisLabel: { color: colors.textSubtle, fontSize: 10, rotate: 30 },
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          axisLabel: { color: colors.textSubtle, fontSize: 10 },
          splitLine: { lineStyle: { color: colors.border } },
        },
        series: (barData?.data || []).map((s, i) => ({
          type: 'bar',
          name: s.name,
          data: s.data,
          stack: chartType === 'stacked_bar' ? 'total' : undefined,
          color: CHART_COLORS[i % CHART_COLORS.length],
          barMaxWidth: 30,
        })),
      };
    }

    case 'gauge': {
      const gaugeData = (series as { data?: { value: number; max: number }[] })?.data || [];
      const val = gaugeData[0]?.value || 0;
      const max = gaugeData[0]?.max || 1000;
      const pct = max > 0 ? Math.round((val / max) * 100) : 0;
      return {
        ...baseOption,
        grid: undefined,
        legend: undefined,
        series: [{
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          center: ['50%', '60%'],
          radius: '80%',
          min: 0,
          max,
          splitNumber: 5,
          axisLine: {
            show: true,
            lineStyle: {
              width: 18,
              color: [
                [0.5, colors.income],
                [0.8, colors.warning],
                [1, colors.expense],
              ],
            },
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '70%',
            width: 6,
            itemStyle: { color: 'auto' },
          },
          axisTick: { distance: -18, length: 6, lineStyle: { color: colors.white, width: 1 } },
          splitLine: { distance: -22, length: 16, lineStyle: { color: colors.white, width: 2 } },
          axisLabel: { color: colors.textSubtle, distance: 30, fontSize: 10 },
          detail: {
            valueAnimation: true,
            formatter: `¥{value}\n${pct}%已用`,
            color: colors.text,
            fontSize: 16,
            offsetCenter: [0, '70%'],
          },
          data: [{ value: val, name: '已用预算' }],
        }],
      };
    }

    case 'radar': {
      const radarData = series as { indicators?: { name: string; max: number }[]; data?: { name: string; value: number[] }[] } | undefined;
      const radarLegend = baseOption.legend as Record<string, unknown>;
      return {
        ...baseOption,
        grid: undefined,
        legend: { ...radarLegend, bottom: 0 },
        radar: {
          center: ['50%', '55%'],
          radius: '65%',
          indicator: radarData?.indicators || [],
          axisName: { color: colors.textMuted, fontSize: 10 },
          splitArea: { areaStyle: { color: ['transparent'] } },
          splitLine: { lineStyle: { color: colors.border } },
          axisLine: { lineStyle: { color: colors.borderStrong } },
        },
        series: [{
          type: 'radar',
          data: (radarData?.data || []).map((d, i) => ({
            name: d.name,
            value: d.value,
            areaStyle: { opacity: 0.15 },
            lineStyle: { width: 2 },
            itemStyle: { borderWidth: 2 },
            color: CHART_COLORS[i % 3],
          })),
        }],
      };
    }

    case 'sankey': {
      const sankeyData = series as { nodes?: { name: string }[]; links?: { source: string; target: string; value: number }[] } | undefined;
      return {
        ...baseOption,
        grid: undefined,
        legend: undefined,
        series: [{
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' },
          nodeAlign: 'left',
          label: { color: colors.textMuted, fontSize: 10 },
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.3 },
          data: sankeyData?.nodes || [],
          links: sankeyData?.links || [],
        }],
      };
    }

    case 'heatmap': {
      const heatData = series as { xAxis?: string[]; yAxis?: string[]; data?: [number, number, number][] } | undefined;
      return {
        ...baseOption,
        grid: { top: 40, bottom: 60, left: 80, right: 20 },
        legend: undefined,
        tooltip: { position: 'top' },
        xAxis: {
          type: 'category',
          data: heatData?.xAxis || [],
          splitArea: { show: true },
          axisLabel: { color: colors.textSubtle, fontSize: 10, rotate: 30 },
          axisLine: { lineStyle: { color: colors.borderStrong } },
        },
        yAxis: {
          type: 'category',
          data: heatData?.yAxis || [],
          splitArea: { show: true },
          axisLabel: { color: colors.textSubtle, fontSize: 10 },
          axisLine: { lineStyle: { color: colors.borderStrong } },
        },
        visualMap: {
          min: 0,
          max: 10,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          textStyle: { color: colors.textSubtle, fontSize: 10 },
          inRange: { color: [colors.surface, colors.accent, colors.income, colors.warning, colors.expense] },
        },
        series: [{
          type: 'heatmap',
          data: heatData?.data || [],
          label: { show: false },
        }],
      };
    }

    default:
      return {};
  }
}

export default function ChartCard({ data }: ChartCardProps) {
  const icon = CHART_ICONS[data.chartType] || '📊';
  const label = CHART_LABELS[data.chartType] || data.chartType;

  const echartsConfig = useMemo(() => buildEChartsConfig(data), [data]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{data.title || label}</Text>
          <Text style={styles.subtitle}>{label}</Text>
        </View>
      </View>

      <View style={styles.chartArea}>
        <EChartsSandbox
          config={echartsConfig}
          height={190}
          onError={(err) => {
            console.warn('[ChartCard] ECharts error:', err);
          }}
        />
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
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: 0,
  },
  icon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  chartArea: {
    margin: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightRow: {
    flexDirection: 'row',
    padding: spacing.lg,
    paddingTop: 0,
    alignItems: 'flex-start',
  },
  insightIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
    marginTop: 1,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
