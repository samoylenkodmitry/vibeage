import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3, Mesh, Material } from 'three';

interface ProjectileVfxProps {
  id: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
}

function ProjectileVfx({id, origin, dir, speed}: ProjectileVfxProps) {
  const ref = useRef<Mesh>(null);
  const pos = useRef(new Vector3(origin.x, origin.y, origin.z));
  
  useFrame((_, delta) => {
    pos.current.x += dir.x * speed * delta;
    pos.current.y += dir.y * speed * delta;
    pos.current.z += dir.z * speed * delta;
    ref.current!.position.copy(pos.current);
  });
  
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.25, 16, 16]} />
      <meshBasicMaterial color={'orange'} />
    </mesh>
  );
}

export default ProjectileVfx;
