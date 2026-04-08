import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bedroom } from './rooms/Bedroom';
import { Bathroom } from './rooms/Bathroom';
import { Kitchen } from './rooms/Kitchen';
import { Playroom } from './rooms/Playroom';
import { CommonRoom } from './rooms/CommonRoom';
import { OfficeRoom } from './rooms/OfficeRoom';
import { safehousePalette } from './materials';

function SafehouseModel() {
  const sideZ = [-12.8, -6.4, 0.0, 6.4, 12.8];
  const sideBedrooms: Array<{
    id: string;
    x: number;
    z: number;
    rotY: number;
    mirrored?: boolean;
    doorwayCenterX?: number;
  }> = [
    ...sideZ.map((z, idx) => ({
      id: `w${idx + 1}`,
      x: -14.97,
      z,
      rotY: Math.PI / 2,
      doorwayCenterX: z === -12.8 ? -1.45 : z === 12.8 ? 1.65 : 0,
    })),
    ...sideZ.map((z, idx) => ({
      id: `e${idx + 1}`,
      x: 14.97,
      z,
      rotY: -Math.PI / 2,
      mirrored: true,
      doorwayCenterX: z === -12.8 ? 1.45 : z === 12.8 ? -1.65 : 0,
    })),
  ];

  const bathLayout: Array<{ x: number; z: number; side: 'front' | 'back' }> = [
    { x: -10.056, z: -14.35, side: 'front' },
    { x: -5.028, z: -14.35, side: 'front' },
    { x: 0.0, z: -14.35, side: 'front' },
    { x: 5.028, z: -14.35, side: 'front' },
    { x: 10.056, z: -14.35, side: 'front' },
  ];

  return (
    <group position={[0, 0.05, 0]} scale={[1.2, 1.2, 1.2]}>
      <mesh receiveShadow position={[0, -0.15, 0]}>
        <boxGeometry args={[40.5, 0.3, 34.2]} />
        <meshStandardMaterial color={safehousePalette.foundation} />
      </mesh>

      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[38.4, 0.08, 32.0]} />
        <meshStandardMaterial color="#d9c3a7" />
      </mesh>

      {sideBedrooms.map((room) => (
        <group key={room.id} position={[room.x, 0, room.z]} rotation={[0, room.rotY, 0]}>
          <Bedroom position={[0, 0, 0]} mirrored={room.mirrored} doorwayCenterX={room.doorwayCenterX} />
        </group>
      ))}

      {bathLayout.map((bath) => (
        <group key={`bath-${bath.x}-${bath.z}`} position={[bath.x, 0, bath.z]} scale={[1.571, 1, 1.16]}>
          <Bathroom position={[0, 0, 0]} doorwaySide={bath.side} />
        </group>
      ))}

      {/* Center 2x2 block: larger rooms, shared borders, all with doors. */}
      <Kitchen position={[-4.4, 0, -3.0]} doorwaySide="back" />
      <CommonRoom position={[4.4, 0, -3.0]} doorwaySide="back" />
      <CommonRoom position={[-4.4, 0, 3.0]} doorwaySide="front" />
      <Playroom position={[4.4, 0, 3.0]} doorwaySide="front" />

      {/* Front zone: two offices + desk, with short entry opening. */}
      <OfficeRoom position={[-9.2, 0, 13.75]} />
      <OfficeRoom position={[9.2, 0, 13.75]} />
      <mesh castShadow receiveShadow position={[0, 0.7, 11.4]}>
        <boxGeometry args={[2.2, 1.4, 1.0]} />
        <meshStandardMaterial color="#ad9777" />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.48, 11.1]}>
        <boxGeometry args={[1.8, 0.08, 0.8]} />
        <meshStandardMaterial color="#d7dce2" />
      </mesh>

      <mesh receiveShadow position={[0, 0.03, 14.6]}>
        <boxGeometry args={[2.8, 0.06, 3.0]} />
        <meshStandardMaterial color="#cfbd9f" />
      </mesh>

      {/* Perimeter with double-door scale front opening. */}
      {[
        { x: 0, z: -16.25, w: 36.9, d: 0.14 },
        { x: -18.45, z: 0.0, w: 0.14, d: 32.5 },
        { x: 18.45, z: 0.0, w: 0.14, d: 32.5 },
        { x: -10.8, z: 16.25, w: 14.6, d: 0.14 },
        { x: 10.8, z: 16.25, w: 14.6, d: 0.14 },
      ].map((wall, idx) => (
        <mesh key={`outer-wall-${idx}`} castShadow receiveShadow position={[wall.x, 1.38, wall.z]}>
          <boxGeometry args={[wall.w, 2.76, wall.d]} />
          <meshStandardMaterial color={safehousePalette.innerWall} />
        </mesh>
      ))}
    </group>
  );
}

export function SafehouseScene() {
  return (
    <Canvas
      className="safehouse-canvas"
      camera={{ position: [42, 26, 42], fov: 35 }}
      dpr={[1, 1.8]}
      shadows
    >
      <color attach="background" args={['#e9edf0']} />
      <hemisphereLight intensity={0.58} groundColor="#d3c8b6" />
      <directionalLight
        position={[20, 30, 14]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <ambientLight intensity={0.35} />

      <SafehouseModel />

      <OrbitControls
        enablePan
        enableZoom
        minDistance={7.5}
        maxDistance={90}
        minPolarAngle={0.45}
        maxPolarAngle={1.42}
        target={[0, 1.9, -0.8]}
      />
    </Canvas>
  );
}
