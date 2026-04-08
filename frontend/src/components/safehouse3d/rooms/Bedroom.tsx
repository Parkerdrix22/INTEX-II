import { BunkBed } from './BunkBed';
import { DoorSet } from './DoorSet';
import { RoomShell } from './RoomShell';
import { safehousePalette } from '../materials';

type BedroomProps = {
  position: [number, number, number];
  mirrored?: boolean;
  doorwayCenterX?: number;
};

export function Bedroom({ position, mirrored = false, doorwayCenterX = 0 }: BedroomProps) {
  const outerWallZ = -1.55;
  const doorSide = 'front';

  return (
    <group position={position}>
      <RoomShell
        width={6.4}
        depth={4.8}
        openFront={false}
        doorwaySide={doorSide}
        doorwayCenterX={doorwayCenterX}
      />
      <BunkBed position={[-1.45, 0, outerWallZ]} rotationY={mirrored ? Math.PI : 0} />
      <BunkBed position={[1.45, 0, outerWallZ]} rotationY={mirrored ? Math.PI : 0} />

      <mesh castShadow receiveShadow position={[-2.55, 0.58, mirrored ? -0.75 : 0.75]}>
        <boxGeometry args={[0.45, 1.15, 1.2]} />
        <meshStandardMaterial color={safehousePalette.woodDark} />
      </mesh>
      <mesh castShadow receiveShadow position={[-2.32, 0.9, mirrored ? -0.35 : 0.35]}>
        <boxGeometry args={[0.05, 0.22, 0.35]} />
        <meshStandardMaterial color="#cab79d" />
      </mesh>

      <DoorSet side={doorSide} halfDepth={2.4} centerX={doorwayCenterX} />
    </group>
  );
}
