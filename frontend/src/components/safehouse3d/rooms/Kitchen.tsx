import { safehousePalette } from '../materials';
import { DoorSet } from './DoorSet';
import { RoomShell } from './RoomShell';

type KitchenProps = {
  position: [number, number, number];
  doorwaySide?: 'front' | 'back' | 'none';
};

export function Kitchen({ position, doorwaySide = 'back' }: KitchenProps) {
  return (
    <group position={position}>
      <RoomShell width={8.8} depth={6} floorColor="#d9c6ad" openFront={false} doorwaySide={doorwaySide} />
      {/* Split rear counter leaves a center entry path from the doorway. */}
      <mesh castShadow receiveShadow position={[-2.2, 0.55, -2]}>
        <boxGeometry args={[2.6, 1.1, 0.8]} />
        <meshStandardMaterial color={safehousePalette.counter} />
      </mesh>
      <mesh castShadow receiveShadow position={[2.2, 0.55, -2]}>
        <boxGeometry args={[2.6, 1.1, 0.8]} />
        <meshStandardMaterial color={safehousePalette.counter} />
      </mesh>
      <mesh castShadow receiveShadow position={[2.15, 0.55, 0.9]}>
        <boxGeometry args={[1.8, 1.1, 0.8]} />
        <meshStandardMaterial color={safehousePalette.counter} />
      </mesh>
      <mesh castShadow receiveShadow position={[-1.9, 0.45, 0.95]}>
        <boxGeometry args={[1.8, 0.9, 1.2]} />
        <meshStandardMaterial color="#f4f2ee" />
      </mesh>
      <mesh castShadow receiveShadow position={[-1.9, 1.05, 0.95]}>
        <boxGeometry args={[1.3, 0.12, 0.9]} />
        <meshStandardMaterial color="#cbd4dd" />
      </mesh>

      {doorwaySide !== 'none' && <DoorSet side={doorwaySide} halfDepth={3} />}
    </group>
  );
}
