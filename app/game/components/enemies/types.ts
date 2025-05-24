export interface EnemyProps {
  enemy: any;
  isSelected: boolean;
  onSelect: () => void;
}

export interface ModelProps {
  isSelected: boolean;
  isHovered: boolean;
}

export interface EnemyInterpolationParams {
  delta: number;
  enemyId: string;
  position: { x: number; y: number; z: number };
  rotation?: { y: number };
  rigidBodyRef: React.MutableRefObject<any>;
  isAlive: boolean;
}
