type DoorSetProps = {
  side: 'front' | 'back';
  halfDepth: number;
  frameWidth?: number;
  centerX?: number;
};

export function DoorSet({ side, halfDepth, frameWidth = 1.24, centerX = 0 }: DoorSetProps) {
  const z = side === 'front' ? halfDepth : -halfDepth;
  const slabOffset = side === 'front' ? -0.02 : 0.02;

  return (
    <>
      <mesh castShadow receiveShadow position={[centerX - 0.62, 1.05, z]}>
        <boxGeometry args={[0.08, 2.1, 0.08]} />
        <meshStandardMaterial color="#8e7052" />
      </mesh>
      <mesh castShadow receiveShadow position={[centerX + 0.62, 1.05, z]}>
        <boxGeometry args={[0.08, 2.1, 0.08]} />
        <meshStandardMaterial color="#8e7052" />
      </mesh>
      <mesh castShadow receiveShadow position={[centerX, 2.06, z]}>
        <boxGeometry args={[frameWidth, 0.1, 0.08]} />
        <meshStandardMaterial color="#8e7052" />
      </mesh>
      <mesh castShadow receiveShadow position={[centerX + 0.26, 1.0, z + slabOffset]}>
        <boxGeometry args={[0.48, 2, 0.04]} />
        <meshStandardMaterial color="#b58d66" />
      </mesh>
    </>
  );
}
