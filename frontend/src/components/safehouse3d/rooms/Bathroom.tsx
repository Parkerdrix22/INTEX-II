import { safehousePalette } from '../materials';
import { DoorSet } from './DoorSet';
import { RoomShell } from './RoomShell';

type BathroomProps = {
  position: [number, number, number];
  doorwaySide?: 'front' | 'back' | 'none';
};

export function Bathroom({ position, doorwaySide = 'none' }: BathroomProps) {
  return (
    <group position={position}>
      <RoomShell width={3.2} depth={3.2} floorColor={safehousePalette.tile} openFront={false} doorwaySide={doorwaySide} />
      {/* shower */}
      <mesh castShadow receiveShadow position={[0.86, 0.9, -0.85]}>
        <boxGeometry args={[1.15, 1.8, 1.0]} />
        <meshStandardMaterial color="#f3f6f8" />
      </mesh>
      <mesh castShadow receiveShadow position={[0.86, 1.78, -0.85]}>
        <boxGeometry args={[1.15, 0.04, 1.0]} />
        <meshStandardMaterial color="#b6c7d5" />
      </mesh>
      {/* toilet */}
      <mesh castShadow receiveShadow position={[-0.76, 0.32, -0.84]}>
        <boxGeometry args={[0.62, 0.64, 0.62]} />
        <meshStandardMaterial color="#f6f9fb" />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.76, 0.88, -0.84]}>
        <boxGeometry args={[0.38, 0.48, 0.24]} />
        <meshStandardMaterial color="#f6f9fb" />
      </mesh>
      {/* sink + mirror */}
      <mesh castShadow receiveShadow position={[0.1, 0.42, 0.86]}>
        <boxGeometry args={[1.2, 0.16, 0.48]} />
        <meshStandardMaterial color="#f6f9fb" />
      </mesh>
      <mesh castShadow receiveShadow position={[0.1, 0.9, 0.62]}>
        <boxGeometry args={[1.0, 0.62, 0.05]} />
        <meshStandardMaterial color="#c8d5df" />
      </mesh>

      {doorwaySide !== 'none' && (
        <DoorSet side={doorwaySide} halfDepth={1.6} />
      )}
    </group>
  );
}
