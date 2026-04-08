import { safehousePalette } from '../materials';
import { RoomShell } from './RoomShell';

type LearningRoomProps = {
  position: [number, number, number];
};

export function LearningRoom({ position }: LearningRoomProps) {
  return (
    <group position={position}>
      <RoomShell width={7} depth={5} floorColor="#e2d2bc" openFront={false} doorwaySide="front" />
      <mesh castShadow receiveShadow position={[0, 1.4, -2]}>
        <boxGeometry args={[3.5, 1.6, 0.05]} />
        <meshStandardMaterial color={safehousePalette.chalkboard} />
      </mesh>

      {[-1.9, 0, 1.9].map((x) => (
        <group key={x} position={[x, 0, 0.8]}>
          <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
            <boxGeometry args={[1.35, 0.08, 0.8]} />
            <meshStandardMaterial color={safehousePalette.woodDark} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.2, -0.5]}>
            <boxGeometry args={[0.95, 0.4, 0.45]} />
            <meshStandardMaterial color={safehousePalette.woodDark} />
          </mesh>
        </group>
      ))}

      <mesh castShadow receiveShadow position={[-0.62, 1.05, 2.5]}>
        <boxGeometry args={[0.08, 2.1, 0.09]} />
        <meshStandardMaterial color="#9b7b5a" />
      </mesh>
      <mesh castShadow receiveShadow position={[0.62, 1.05, 2.5]}>
        <boxGeometry args={[0.08, 2.1, 0.09]} />
        <meshStandardMaterial color="#9b7b5a" />
      </mesh>
    </group>
  );
}
