import { classifyBody, silhouetteSrc, WHEEL_POSITIONS } from '../lib/bodyType';

type Props = {
  make?: string;
  model?: string;
  vehicleLabel?: string;
  wheelImage?: string;
  wheelDiameter?: number | null; // inches; used to subtly scale the overlay
};

// Side-view silhouette + live wheel overlay at front + rear positions.
// Replaces the IMAGIN.studio real-vehicle render so the wheel the customer
// is actually picking shows up on the car.
export default function VehicleSilhouette({ make, model, vehicleLabel, wheelImage, wheelDiameter }: Props) {
  const body = classifyBody(make, model);
  const positions = WHEEL_POSITIONS[body];
  const src = silhouetteSrc(body);

  // Diameter-based size adjustment — 17" is our baseline. Bigger wheels look
  // a hair bigger on the car. Keep the multiplier mild so the overlay still
  // sits inside the wheel-arch region of the silhouette.
  const diameterFactor = wheelDiameter ? Math.max(0.85, Math.min(1.15, wheelDiameter / 17)) : 1;
  const sizePct = positions.front.size * diameterFactor;

  return (
    <div className="relative w-full aspect-[16/9] bg-dark-950 overflow-hidden">
      <img
        src={src}
        alt={`Generic ${body} silhouette`}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
      {wheelImage && (
        <>
          <img
            src={wheelImage}
            alt=""
            className="absolute z-10 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] pointer-events-none"
            style={{
              left: `${positions.front.x}%`,
              top: `${positions.front.y}%`,
              width: `${sizePct}%`,
              aspectRatio: '1 / 1',
            }}
            aria-hidden="true"
          />
          <img
            src={wheelImage}
            alt=""
            className="absolute z-10 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] pointer-events-none"
            style={{
              left: `${positions.rear.x}%`,
              top: `${positions.rear.y}%`,
              width: `${sizePct}%`,
              aspectRatio: '1 / 1',
            }}
            aria-hidden="true"
          />
        </>
      )}
      {vehicleLabel && (
        <div className="absolute bottom-2 left-2 right-2 z-20 text-center">
          <p className="text-dark-400 text-[10px] italic">
            Generic {body.replace('-', ' ')} silhouette — your selected wheel shown at scale on {vehicleLabel}
          </p>
        </div>
      )}
    </div>
  );
}
