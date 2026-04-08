import { safehousePalette } from '../materials';

type RoomShellProps = {
  width: number;
  depth: number;
  wallHeight?: number;
  wallThickness?: number;
  floorColor?: string;
  wallColor?: string;
  openFront?: boolean;
  doorwaySide?: 'front' | 'back' | 'none';
  doorwayWidth?: number;
  doorwayCenterX?: number;
};

export function RoomShell({
  width,
  depth,
  wallHeight = 2.8,
  wallThickness = 0.12,
  floorColor = safehousePalette.woodLight,
  wallColor = safehousePalette.innerWall,
  openFront = true,
  doorwaySide = 'none',
  doorwayWidth = 1.2,
  doorwayCenterX = 0,
}: RoomShellProps) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const wallY = wallHeight / 2;
  const maxDoorCenterX = Math.max(halfW - doorwayWidth / 2 - wallThickness, 0);
  const clampedDoorCenterX = Math.max(-maxDoorCenterX, Math.min(maxDoorCenterX, doorwayCenterX));
  const leftSpan = Math.max(clampedDoorCenterX - doorwayWidth / 2 + halfW, 0.01);
  const rightSpan = Math.max(halfW - (clampedDoorCenterX + doorwayWidth / 2), 0.01);
  const leftCenter = -halfW + leftSpan / 2;
  const rightCenter = clampedDoorCenterX + doorwayWidth / 2 + rightSpan / 2;

  return (
    <group>
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[width, 0.08, depth]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>

      {doorwaySide === 'back' ? (
        <>
          <mesh castShadow receiveShadow position={[leftCenter, wallY, -halfD]}>
            <boxGeometry args={[leftSpan, wallHeight, wallThickness]} />
            <meshStandardMaterial color={wallColor} />
          </mesh>
          <mesh castShadow receiveShadow position={[rightCenter, wallY, -halfD]}>
            <boxGeometry args={[rightSpan, wallHeight, wallThickness]} />
            <meshStandardMaterial color={wallColor} />
          </mesh>
        </>
      ) : (
        <mesh castShadow receiveShadow position={[0, wallY, -halfD]}>
          <boxGeometry args={[width, wallHeight, wallThickness]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      )}
      <mesh castShadow receiveShadow position={[-halfW, wallY, 0]}>
        <boxGeometry args={[wallThickness, wallHeight, depth]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh castShadow receiveShadow position={[halfW, wallY, 0]}>
        <boxGeometry args={[wallThickness, wallHeight, depth]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>

      {!openFront &&
        (doorwaySide === 'front' ? (
          <>
            <mesh castShadow receiveShadow position={[leftCenter, wallY, halfD]}>
              <boxGeometry args={[leftSpan, wallHeight, wallThickness]} />
              <meshStandardMaterial color={wallColor} />
            </mesh>
            <mesh castShadow receiveShadow position={[rightCenter, wallY, halfD]}>
              <boxGeometry args={[rightSpan, wallHeight, wallThickness]} />
              <meshStandardMaterial color={wallColor} />
            </mesh>
          </>
        ) : (
          <mesh castShadow receiveShadow position={[0, wallY, halfD]}>
            <boxGeometry args={[width, wallHeight, wallThickness]} />
            <meshStandardMaterial color={wallColor} />
          </mesh>
        ))}
    </group>
  );
}
