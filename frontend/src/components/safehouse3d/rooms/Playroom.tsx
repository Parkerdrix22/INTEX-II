import { safehousePalette } from '../materials';
import { DoorSet } from './DoorSet';
import { RoomShell } from './RoomShell';

type PlayroomProps = {
  position: [number, number, number];
  doorwaySide?: 'front' | 'back' | 'none';
};

export function Playroom({ position, doorwaySide = 'front' }: PlayroomProps) {
  return (
    <group position={position}>
      <RoomShell width={8.8} depth={6} floorColor="#d5c2a8" openFront={false} doorwaySide={doorwaySide} />
      <mesh receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[4.8, 0.1, 2.6]} />
        <meshStandardMaterial color={safehousePalette.playMat} />
      </mesh>
      <mesh castShadow receiveShadow position={[-2.1, 0.5, -1.5]}>
        <boxGeometry args={[1.4, 1, 1]} />
        <meshStandardMaterial color="#8aa6cf" />
      </mesh>
      <mesh castShadow receiveShadow position={[2, 0.4, 1.6]}>
        <boxGeometry args={[1.1, 0.8, 1.1]} />
        <meshStandardMaterial color="#d28767" />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.36, -1.45]}>
        <boxGeometry args={[1.5, 0.72, 0.85]} />
        <meshStandardMaterial color="#d5d9c5" />
      </mesh>

      {doorwaySide !== 'none' && <DoorSet side={doorwaySide} halfDepth={3} />}
    </group>
  );
}
