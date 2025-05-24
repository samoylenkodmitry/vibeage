'use client';

export interface EnemyComponentProps {
  enemy: any;
  isSelected: boolean;
  onSelect: () => void;
}

export function getMobName(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
