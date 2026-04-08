import { RoomShell } from './RoomShell';
import { DoorSet } from './DoorSet';

type OfficeRoomProps = {
  position: [number, number, number];
};

export function OfficeRoom({ position }: OfficeRoomProps) {
  return (
    <group position={position}>
      <RoomShell width={6.2} depth={4.8} openFront={false} doorwaySide="front" floorColor="#d6c3aa" />
      <mesh castShadow receiveShadow position={[-0.95, 0.42, -1.35]}>
        <boxGeometry args={[2.2, 0.84, 0.95]} />
        <meshStandardMaterial color="#9f8467" />
      </mesh>
      <mesh castShadow receiveShadow position={[1.25, 0.32, 1.1]}>
        <boxGeometry args={[1.2, 0.64, 1.05]} />
        <meshStandardMaterial color="#bdc4cf" />
      </mesh>
      <DoorSet side="front" halfDepth={2.4} />
    </group>
  );
}
