import React from 'react';
import { View } from 'react-native';
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
import ChartCard from './ChartCard';
import ConfirmCard from './ConfirmCard';
import ErrorCard from './ErrorCard';
import TipCard from './TipCard';
import BillDetailCard from './BillDetailCard';
import RecordConfirmCard from './RecordConfirmCard';

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
  onRetry?: () => void;
  onAction?: (actionId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function CardRenderer({
  data,
  onConfirm,
  onCancel,
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
      return <ChartCard data={data as ChartCardData} />;

    case 'confirm_card':
    case 'security_confirm_card':
      return (
        <ConfirmCard
          data={data as ConfirmCardData}
          onConfirm={onConfirm}
          onCancel={onCancel}
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
