import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BillCardData,
  SummaryCardData,
  ChartCardData,
  ConfirmCardData,
  ErrorCardData,
  TipCardData,
  BillDetailCardData,
  RecordConfirmCardData,
} from '../../shared/types';
import BillCard from './BillCard';
import SummaryCard from './SummaryCard';
import ConfirmCard from './ConfirmCard';
import ErrorCard from './ErrorCard';
import TipCard from './TipCard';
import BillDetailCard from './BillDetailCard';
import RecordConfirmCard from './RecordConfirmCard';
import { colors, radius, spacing } from '../theme';

interface CardRendererProps {
  data:
    | BillCardData
    | SummaryCardData
    | ChartCardData
    | ConfirmCardData
    | ErrorCardData
    | TipCardData
    | BillDetailCardData
    | RecordConfirmCardData;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
  isActionConsumed?: (actionId: string) => boolean;
  onRetry?: () => void;
  onAction?: (actionId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override render() {
    if (this.state.hasError) {
      return (
        <View style={styles.chartFallback}>
          <View style={styles.chartFallbackInner}>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

function LazyChartCard({ data }: { data: ChartCardData }) {
  const ChartCard = require('./ChartCard').default;
  return (
    <ChartErrorBoundary>
      <ChartCard data={data} />
    </ChartErrorBoundary>
  );
}

export default function CardRenderer({
  data,
  onConfirm,
  onCancel,
  isActionConsumed,
  onRetry,
  onAction,
  onEdit,
  onDelete,
}: CardRendererProps) {
  switch (data.type) {
    case 'bill_card':
      return <BillCard data={data as BillCardData} />;

    case 'summary_card':
      return <SummaryCard data={data as SummaryCardData} />;

    case 'chart_card':
      return <LazyChartCard data={data as ChartCardData} />;

    case 'confirm_card':
    case 'security_confirm_card':
      return (
        <ConfirmCard
          data={data as ConfirmCardData}
          onConfirm={onConfirm}
          onCancel={onCancel}
          isConsumed={isActionConsumed?.(data.actionId) || false}
        />
      );

    case 'error_card':
      return <ErrorCard data={data as ErrorCardData} onRetry={onRetry} />;

    case 'tip_card':
      return <TipCard data={data as TipCardData} onAction={onAction} />;

    case 'bill_detail_card':
      return (
        <BillDetailCard
          data={data as BillDetailCardData}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      );

    case 'record_confirm_card':
      return (
        <RecordConfirmCard
          data={data as RecordConfirmCardData}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

    default:
      return <View />;
  }
}

const styles = StyleSheet.create({
  chartFallback: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartFallbackInner: {
    alignItems: 'center',
    padding: spacing.xl,
  },
});
