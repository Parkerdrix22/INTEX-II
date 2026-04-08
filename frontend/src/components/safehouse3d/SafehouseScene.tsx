import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bedroom } from './rooms/Bedroom';
import { Bathroom } from './rooms/Bathroom';
import { Kitchen } from './rooms/Kitchen';
import { Playroom } from './rooms/Playroom';
import { CommonRoom } from './rooms/CommonRoom';
import { OfficeRoom } from './rooms/OfficeRoom';
import { safehousePalette } from './materials';

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      <mesh castShadow receiveShadow position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 2.0, 8]} />
        <meshStandardMaterial color="#7a5a3f" />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 2.4, 0]}>
        <coneGeometry args={[1.2, 2.3, 10]} />
        <meshStandardMaterial color="#4f7f49" />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 3.45, 0]}>
        <coneGeometry args={[0.95, 1.8, 10]} />
        <meshStandardMaterial color="#5d8d54" />
      </mesh>
    </group>
  );
}

function Shrub({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <mesh castShadow receiveShadow position={position} scale={[scale, scale, scale]}>
      <sphereGeometry args={[0.6, 10, 10]} />
      <meshStandardMaterial color="#6f9a62" />
    </mesh>
  );
}

function SafehouseExterior() {
  const treeLayout: Array<{ pos: [number, number, number]; scale?: number }> = [
    { pos: [-30, 0, -27], scale: 1.25 },
    { pos: [-22, 0, -29], scale: 1.0 },
    { pos: [-16, 0, -30.5], scale: 0.95 },
    { pos: [-11, 0, -30], scale: 1.12 },
    { pos: [-2, 0, -31.2], scale: 0.92 },
    { pos: [10, 0, -31], scale: 1.1 },
    { pos: [17, 0, -30.4], scale: 0.98 },
    { pos: [24, 0, -28], scale: 1.2 },
    { pos: [31, 0, -18], scale: 1.0 },
    { pos: [32, 0, -2], scale: 0.92 },
    { pos: [31, 0, 18], scale: 1.15 },
    { pos: [30.5, 0, 5], scale: 0.92 },
    { pos: [24, 0, 28], scale: 1.05 },
    { pos: [10, 0, 31], scale: 1.2 },
    { pos: [-10, 0, 31], scale: 1.05 },
    { pos: [-17, 0, 30.8], scale: 0.94 },
    { pos: [-24, 0, 28], scale: 1.2 },
    { pos: [-32, 0, 14], scale: 1.05 },
    { pos: [-32.5, 0, 1], scale: 0.9 },
    { pos: [-33, 0, -12], scale: 1.1 },
  ];

  const shrubLayout: Array<[number, number, number]> = [
    [-18, 0.3, 18],
    [-15, 0.3, 18.4],
    [-12, 0.3, 18.6],
    [-9, 0.3, 18.7],
    [9, 0.3, 18.7],
    [12, 0.3, 18.5],
    [15, 0.3, 18.2],
    [18, 0.3, 17.8],
  ];

  return (
    <group>
      {/* Grounds */}
      <mesh receiveShadow position={[0, -0.6, 0]}>
        <boxGeometry args={[86, 1.0, 86]} />
        <meshStandardMaterial color="#a8c39c" />
      </mesh>

      {/* Inner lot */}
      <mesh receiveShadow position={[0, -0.08, 0]}>
        <boxGeometry args={[64, 0.16, 64]} />
        <meshStandardMaterial color="#c9dcb4" />
      </mesh>

      {/* Fence ring */}
      {[
        { x: 0, z: -32.2, w: 62.5, d: 0.32 },
        { x: -19.5, z: 32.2, w: 23.5, d: 0.32 },
        { x: 19.5, z: 32.2, w: 23.5, d: 0.32 },
        { x: -31.2, z: 0, w: 0.32, d: 64.4 },
        { x: 31.2, z: 0, w: 0.32, d: 64.4 },
      ].map((f, idx) => (
        <mesh key={`fence-${idx}`} castShadow receiveShadow position={[f.x, 0.85, f.z]}>
          <boxGeometry args={[f.w, 1.7, f.d]} />
          <meshStandardMaterial color="#d8d6cf" />
        </mesh>
      ))}

      {/* Front gate opening and posts */}
      <mesh castShadow receiveShadow position={[-6, 0.95, 32.2]}>
        <boxGeometry args={[0.7, 1.9, 0.55]} />
        <meshStandardMaterial color="#c8c5bc" />
      </mesh>
      <mesh castShadow receiveShadow position={[6, 0.95, 32.2]}>
        <boxGeometry args={[0.7, 1.9, 0.55]} />
        <meshStandardMaterial color="#c8c5bc" />
      </mesh>
      {/* Gate panels removed to keep entry open */}

      {treeLayout.map((tree, idx) => (
        <Tree key={`tree-${idx}`} position={tree.pos} scale={tree.scale} />
      ))}
      {shrubLayout.map((p, idx) => (
        <Shrub key={`shrub-${idx}`} position={p} scale={0.95 + (idx % 3) * 0.1} />
      ))}
    </group>
  );
}

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

      {/* Slightly lowered + polygon offset prevents floor z-fighting flicker. */}
      <mesh receiveShadow position={[0, -0.03, 0]}>
        <boxGeometry args={[38.4, 0.06, 32.0]} />
        <meshStandardMaterial color="#d9c3a7" polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
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
        <meshStandardMaterial color="#cfbd9f" polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>

      {/* Perimeter with wide front entry opening. */}
      {[
        { x: 0, z: -16.25, w: 36.9, d: 0.14 },
        { x: -18.45, z: 0.0, w: 0.14, d: 32.5 },
        { x: 18.45, z: 0.0, w: 0.14, d: 32.5 },
        { x: -12.5, z: 16.25, w: 12.0, d: 0.14 },
        { x: 12.5, z: 16.25, w: 12.0, d: 0.14 },
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
      camera={{ position: [52, 30, 52], fov: 38 }}
      dpr={[1, 1.8]}
      shadows
    >
      <color attach="background" args={['#dce9f4']} />
      <fog attach="fog" args={['#dce9f4', 95, 170]} />
      <hemisphereLight intensity={0.62} groundColor="#c9bea8" />
      <directionalLight
        position={[30, 42, 22]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <ambientLight intensity={0.3} />

      <SafehouseExterior />

      <SafehouseModel />

      <OrbitControls
        enablePan
        enableZoom
        minDistance={16}
        maxDistance={125}
        minPolarAngle={0.35}
        maxPolarAngle={1.48}
        target={[0, 2.4, -0.5]}
      />
    </Canvas>
  );
}
