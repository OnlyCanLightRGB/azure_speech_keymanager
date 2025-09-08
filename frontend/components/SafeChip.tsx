import React from 'react';
import { Chip, ChipProps } from '@mui/material';

// 安全的Chip组件，过滤掉可能意外传递的onClick属性
interface SafeChipProps extends Omit<ChipProps, 'onClick'> {
  // 如果需要点击功能，可以通过onChipClick属性传递
  onChipClick?: () => void;
}

const SafeChip: React.FC<SafeChipProps> = ({ onChipClick, ...props }) => {
  // 确保不会传递onClick属性给MUI的Chip组件
  const safeProps = { ...props };
  
  // 如果提供了onChipClick，则将其作为onClick传递
  const chipProps = onChipClick 
    ? { ...safeProps, onClick: onChipClick }
    : safeProps;

  return <Chip {...chipProps} />;
};

export default SafeChip;