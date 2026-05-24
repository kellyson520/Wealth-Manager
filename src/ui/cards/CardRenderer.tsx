import React from 'react';
import { View } from 'react-native';
import {
  BillCardData,
  SummaryCardData,
  ChartCardData,
  ConfirmCardData,
} from '../../shared/types';
import BillCard from './BillCard';
import SummaryCard from './SummaryCard';
import ChartCard from './ChartCard';
import ConfirmCard from './ConfirmCard';

interface CardRendererProps {
  data: BillCardData | SummaryCardData | ChartCardData | ConfirmCardData;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
}

export default function CardRenderer({ data, onConfirm, onCancel }: CardRendererProps) {
  switch (data.type) {
    case 'bill_card':
      return <BillCard data={data as BillCardData} />;
    case 'summary_card':
      return <SummaryCard data={data as SummaryCardData} />;
    case 'chart_card':
      return <ChartCard data={data as ChartCardData} />;
    case 'confirm_card':
      return (
        <ConfirmCard
          data={data as ConfirmCardData}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
    default:
      return <View />;
  }
}
