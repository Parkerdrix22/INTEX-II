import { useMemo } from 'react';
import { SafehouseScene } from '../components/safehouse3d/SafehouseScene';

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export function SafehouseTourPage() {
  const supportsWebGL = useMemo(() => canUseWebGL(), []);

  return (
    <section className="safehouse-tour-page">
      <article className="safehouse-tour-card">
        <header className="safehouse-tour-header">
          <h1>See the Safehouse</h1>
          <p className="auth-lead">
            Explore a modeled safehouse layout featuring bedrooms, bathrooms, a kitchen, a playroom,
            and a learning room. Drag to rotate and pinch or scroll to zoom.
          </p>
        </header>

        <div className="safehouse-tour-model-wrap" role="img" aria-label="Interactive 3D dollhouse model">
          {supportsWebGL ? (
            <SafehouseScene />
          ) : (
            <div className="safehouse-tour-fallback">
              <p>
                Your browser does not support WebGL, so the 3D model cannot load here. Try a modern
                browser version on desktop or mobile.
              </p>
            </div>
          )}
        </div>

        <section className="safehouse-tour-description" aria-label="Safehouse summary">
          <h2>Inside this model</h2>
          <p>
            This concept house includes 10 bedrooms with two bunk-bed sets in each room, 5 bathrooms,
            central circulation space, and shared areas for meals, play, and learning. The design is
            intentionally simple to spotlight capacity, flow, and a warm environment for residents.
          </p>
        </section>
      </article>
    </section>
  );
}
