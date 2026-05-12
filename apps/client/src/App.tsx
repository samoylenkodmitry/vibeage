import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { io, type Socket } from 'socket.io-client';
import * as THREE from 'three';

type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline' | 'rejected';

type WorldSnapshot = {
  players?: Record<string, unknown>;
  enemies?: Record<string, unknown>;
};

function getServerUrl(): string {
  return import.meta.env.VITE_GAME_SERVER_URL || window.location.origin;
}

function WorldPreview({ enemyCount }: { enemyCount: number }) {
  const grid = useMemo(() => new THREE.GridHelper(140, 28, '#6ee7d8', '#25414a'), []);
  const markers = useMemo(() => {
    const total = Math.max(6, Math.min(enemyCount || 8, 18));
    return Array.from({ length: total }, (_, index) => {
      const angle = (index / total) * Math.PI * 2;
      const radius = 18 + (index % 4) * 7;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      };
    });
  }, [enemyCount]);

  return (
    <Canvas camera={{ position: [32, 30, 32], fov: 45 }}>
      <color attach="background" args={['#071015']} />
      <fog attach="fog" args={['#071015', 48, 130]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[18, 26, 14]} intensity={1.4} />
      <primitive object={grid} />
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.55, 1.3, 8, 16]} />
        <meshStandardMaterial color="#78f3c9" roughness={0.52} metalness={0.08} />
      </mesh>
      {markers.map((marker, index) => (
        <mesh key={`${marker.x}:${marker.z}`} position={[marker.x, 0.45, marker.z]}>
          <boxGeometry args={[1.2, 0.9 + (index % 3) * 0.25, 1.2]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#f59e0b' : '#ef6461'} roughness={0.8} />
        </mesh>
      ))}
      <OrbitControls enablePan={false} maxPolarAngle={Math.PI * 0.46} minDistance={22} maxDistance={80} />
    </Canvas>
  );
}

export default function App() {
  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [worldSnapshot, setWorldSnapshot] = useState<WorldSnapshot | null>(null);
  const [message, setMessage] = useState('Ready');

  const playerCount = Object.keys(worldSnapshot?.players ?? {}).length;
  const enemyCount = Object.keys(worldSnapshot?.enemies ?? {}).length;

  const disconnect = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnectionState('offline');
  };

  const connect = () => {
    if (socketRef.current?.connected || connectionState === 'connecting') {
      return;
    }

    setConnectionState('connecting');
    setMessage('Connecting');
    const socket = io(getServerUrl(), {
      path: '/socket.io/',
      transports: ['websocket'],
      withCredentials: true,
    });

    socketRef.current = socket;
    socket.on('connect', () => {
      setConnectionState('online');
      setMessage('Connected');
      socket.emit('joinGame', {
        playerName: `ViteScout${Date.now().toString(36)}`,
        clientProtocolVersion: 2,
      });
    });
    socket.on('joinGame', (payload: { playerId?: string }) => {
      setPlayerId(payload.playerId ?? null);
    });
    socket.on('gameState', (state: WorldSnapshot) => {
      setWorldSnapshot(state);
    });
    socket.on('connectionRejected', (payload: { message?: string }) => {
      setConnectionState('rejected');
      setMessage(payload.message ?? 'Rejected');
    });
    socket.on('disconnect', () => {
      setConnectionState('offline');
      setMessage('Disconnected');
    });
    socket.on('connect_error', (error) => {
      setConnectionState('offline');
      setMessage(error.message);
    });
  };

  return (
    <main className="app-shell">
      <WorldPreview enemyCount={enemyCount} />
      <div className="hud hud-top">
        <strong>VibeAge</strong>
        <span className={`status-dot status-${connectionState}`} />
        <span>{message}</span>
      </div>
      <div className="hud hud-side">
        <span>Players {playerCount}</span>
        <span>Enemies {enemyCount}</span>
        <span>ID {playerId ?? '-'}</span>
        <button type="button" onClick={connectionState === 'online' ? disconnect : connect}>
          {connectionState === 'online' ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    </main>
  );
}
