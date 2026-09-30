import { LuCamera } from "react-icons/lu";
import { useI18n } from "../../i18n";
import { TARGET_PHOTOS } from "./shared";

/**
 * The capture ring: one marker per angle around the piece. Markers fill with the actual photos,
 * so the artisan sees which angles are covered. The center shows the latest photo.
 */
export function CaptureRing({ photos, center }: { photos: string[]; center?: string }) {
  const { t } = useI18n();
  const count = photos.length;
  const featured = center ?? photos[count - 1];
  const countText = count > TARGET_PHOTOS ? t("capture.countMany", { n: count }) : t("capture.count", { n: count, total: TARGET_PHOTOS });
  return (
    <div className="relative mx-auto my-5 aspect-square w-full max-w-[320px] [container-type:inline-size]" role="img" aria-label={countText}>
      <div className="absolute inset-[11%] rounded-full border border-dashed border-sand" aria-hidden="true" />
      {Array.from({ length: TARGET_PHOTOS }, (_, i) => {
        const a = (i / TARGET_PHOTOS) * 360;
        const src = photos[i];
        return (
          <span
            key={i}
            className={`absolute left-1/2 top-1/2 -ml-[8cqw] -mt-[8cqw] grid size-[16cqw] place-items-center overflow-hidden rounded-full border-2 transition-all duration-300 ${
              src ? "border-terracotta bg-white shadow-card" : "border-dashed border-[#cbbfae] bg-white/70"
            }`}
            style={{ transform: `rotate(${a}deg) translateY(-40cqw) rotate(${-a}deg)` }}
            aria-hidden="true"
          >
            {src ? <img src={src} alt="" className="block size-full animate-rise object-cover" decoding="async" /> : null}
          </span>
        );
      })}
      <div className="absolute inset-[25%] flex flex-col items-center justify-center gap-1.5 text-center text-[0.8rem]">
        <span className="grid aspect-square w-[78%] place-items-center overflow-hidden rounded-full bg-paper-2">
          {featured ? (
            <img src={featured} alt="" className="block size-full object-cover" decoding="async" />
          ) : (
            <LuCamera aria-hidden="true" className="size-8 text-ink-soft" />
          )}
        </span>
        <strong className="tabular-nums">{countText}</strong>
      </div>
    </div>
  );
}
