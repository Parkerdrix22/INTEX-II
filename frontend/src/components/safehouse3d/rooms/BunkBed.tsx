import { safehousePalette } from '../materials';

type BunkBedProps = {
  position?: [number, number, number];
  rotationY?: number;
};

export function BunkBed({ position = [0, 0, 0], rotationY = 0 }: BunkBedProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.38, 0]}>
        <boxGeometry args={[1.9, 0.08, 0.9]} />
        <meshStandardMaterial color={safehousePalette.bedFrame} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.15, 0]}>
        <boxGeometry args={[1.9, 0.08, 0.9]} />
        <meshStandardMaterial color={safehousePalette.bedFrame} />
      </mesh>

      <mesh castShadow receiveShadow position={[0, 0.47, 0]}>
        <boxGeometry args={[1.75, 0.1, 0.75]} />
        <meshStandardMaterial color={safehousePalette.bedding} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.24, 0]}>
        <boxGeometry args={[1.75, 0.1, 0.75]} />
        <meshStandardMaterial color={safehousePalette.bedding} />
      </mesh>

      {[-0.85, 0.85].map((x) =>
        [-0.35, 0.35].map((z) => (
          <mesh key={`${x}-${z}`} castShadow receiveShadow position={[x, 0.72, z]}>
            <boxGeometry args={[0.08, 1.35, 0.08]} />
            <meshStandardMaterial color={safehousePalette.metal} />
          </mesh>
        )),
      )}
    </group>
  );
}
