import { RoomShell } from './RoomShell';
import { DoorSet } from './DoorSet';

type CommonRoomProps = {
  position: [number, number, number];
  doorwaySide?: 'front' | 'back' | 'none';
};

export function CommonRoom({ position, doorwaySide = 'back' }: CommonRoomProps) {
  return (
    <group position={position}>
      <RoomShell width={8.8} depth={6} floorColor="#d8c6ad" openFront={false} doorwaySide={doorwaySide} />
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[2.4, 0.6, 1.1]} />
        <meshStandardMaterial color="#b6b9c2" />
      </mesh>
      <mesh castShadow receiveShadow position={[-2.1, 0.28, -1.3]}>
        <boxGeometry args={[1.35, 0.56, 0.85]} />
        <meshStandardMaterial color="#b4a087" />
      </mesh>
      <mesh castShadow receiveShadow position={[2.05, 0.28, 1.2]}>
        <boxGeometry args={[1.35, 0.56, 0.85]} />
        <meshStandardMaterial color="#b4a087" />
      </mesh>
      {doorwaySide !== 'none' && <DoorSet side={doorwaySide} halfDepth={3} />}
    </group>
  );
}
