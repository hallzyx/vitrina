import { LuKeyRound, LuPartyPopper, LuTriangleAlert } from "react-icons/lu";
import { Link } from "react-router-dom";
import { CopyButton } from "../../components/Chrome";
import { btn } from "../../components/ui";
import { useI18n } from "../../i18n";
import { ScreenTitle } from "./shared";

/**
 * Success screen. The secret edit link is shown here once: the app does not keep it after the user
 * leaves this screen, so the warning is explicit.
 */
export function Published({ slug, token, newStore }: { slug: string; token: string; newStore: boolean }) {
  const { t } = useI18n();
  const origin = window.location.origin;
  const storeUrl = `${origin}/s/${slug}`;
  const editPath = `/edit/${token}`;
  const editUrl = `${origin}${editPath}`;
  return (
    <section>
      <span className="mb-3 grid size-14 place-items-center rounded-full bg-olive/15 text-olive-deep" aria-hidden="true">
        <LuPartyPopper className="size-7" />
      </span>
      <ScreenTitle>{newStore ? t("publish.done") : t("publish.updated")}</ScreenTitle>
      <div className="my-4 grid gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-semibold" id="store-link">
            {t("publish.storeLink")}
          </span>
          <div className="flex gap-2">
            <input readOnly value={storeUrl} aria-labelledby="store-link" className="min-w-0 flex-1 text-sm" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={storeUrl} />
          </div>
        </div>
        {newStore && (
          <div className="rounded-2xl border border-terracotta/30 bg-[color-mix(in_oklab,var(--color-terracotta)_9%,white)] p-4">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold" id="edit-link">
              <LuKeyRound aria-hidden="true" className="size-4 text-terracotta-deep" /> {t("publish.editLinkTitle")}
            </span>
            <div className="flex gap-2">
              <input readOnly value={editUrl} aria-labelledby="edit-link" aria-describedby="edit-warn" className="min-w-0 flex-1 text-sm" onFocus={(e) => e.currentTarget.select()} />
              <CopyButton text={editUrl} />
            </div>
            <p id="edit-warn" className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-[#7a2a16]" role="note">
              <LuTriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("publish.editLinkWarn")}
            </p>
          </div>
        )}
      </div>
      <div className="mt-6 flex flex-wrap justify-between gap-2.5">
        <Link to={editPath} className={btn("outline", "md", "flex-1")}>
          {t("publish.openDashboard")}
        </Link>
        <Link to={`/s/${slug}`} className={btn("primary", "md", "flex-1")}>
          {t("publish.openStore")}
        </Link>
      </div>
    </section>
  );
}
