'use client';

export interface ModelProps {
  isSelected: boolean;
  isHovered: boolean;
}

export function GoblinModel({ isSelected, isHovered }: ModelProps) {
  const baseColor = "#4a7c59";
  const hoverColor = "#5d8e6b";
  const selectedColor = "#6aaa7e";
  
  const color = isSelected ? selectedColor : (isHovered ? hoverColor : baseColor);
  
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.6, 1.0, 0.6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export function WolfModel({ isSelected, isHovered }: ModelProps) {
  const baseColor = "#6e6e6e";
  const hoverColor = "#808080";
  const selectedColor = "#9a9a9a";
  
  const color = isSelected ? selectedColor : (isHovered ? hoverColor : baseColor);
  
  return (
    <group>
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.8, 0.5, 0]} castShadow>
        <boxGeometry args={[0.6, 0.3, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export function SkeletonModel({ isSelected, isHovered }: ModelProps) {
  const baseColor = "#d8d8d0";
  const hoverColor = "#e5e5dc";
  const selectedColor = "#f2f2ea";
  
  const color = isSelected ? selectedColor : (isHovered ? hoverColor : baseColor);
  
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.6, 1.6, 0.3]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export function DefaultEnemyModel({ isSelected, isHovered }: ModelProps) {
  const baseColor = "#8B0000";
  const hoverColor = "#A52A2A";
  const selectedColor = "#DC143C";
  
  const color = isSelected ? selectedColor : (isHovered ? hoverColor : baseColor);
  
  return (
    <mesh position={[0, 1, 0]} castShadow>
      <boxGeometry args={[1, 2, 1]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export function getEnemyModel(type: string, isSelected: boolean, isHovered: boolean) {
  switch (type) {
    case 'goblin':
      return <GoblinModel isSelected={isSelected} isHovered={isHovered} />;
    case 'wolf':
      return <WolfModel isSelected={isSelected} isHovered={isHovered} />;
    case 'skeleton':
      return <SkeletonModel isSelected={isSelected} isHovered={isHovered} />;
    default:
      return <DefaultEnemyModel isSelected={isSelected} isHovered={isHovered} />;
  }
}
