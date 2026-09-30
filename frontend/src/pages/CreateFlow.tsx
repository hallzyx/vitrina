import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState, Topbar } from "../components/Chrome";
import { InviteGate } from "../components/InviteGate";
import { btn } from "../components/ui";
import { useI18n, type TKey } from "../i18n";
import {
  ApiRequestError,
  clearSavedRun,
  clearStoredCode,
  getSavedRun,
  getSessionToken,
  getStoredCode,
  saveRun,
  verifyAccessCode,
  type PublicProduct,
  type PublicStore,
  type SampleSet,
  type SavedRun,
} from "../lib/api";
import { Capture } from "./create/Capture";
import { Choice } from "./create/Choice";
import { Processing } from "./create/Processing";
import { Published } from "./create/Published";
import { RecordedResult, ReplayProcessing } from "./create/Replay";
import { Result } from "./create/Result";
import { SampleDetail, SampleGallery } from "./create/Samples";

type Screen =
  | { name: "choice" }
  | { name: "samples" }
  | { name: "sample"; sample: SampleSet }
  | { name: "checking" }
  | { name: "gate" }
  | { name: "capture" }
  | { name: "processing"; run: SavedRun }
  | { name: "result"; run: SavedRun }
  | { name: "replay"; store: PublicStore; product: PublicProduct }
  | { name: "recorded"; store: PublicStore; product: PublicProduct }
  | { name: "published"; slug: string; token: string; newStore: boolean };

const STEPS: { key: TKey; screens: Screen["name"][] }[] = [
  { key: "create.step.photos", screens: ["choice", "samples", "sample", "checking", "gate", "capture"] },
  { key: "create.step.processing", screens: ["processing", "replay"] },
  { key: "create.step.review", screens: ["result", "recorded"] },
  { key: "create.step.publish", screens: ["published"] },
];

/**
 * The create flow. Two ways in: sample photo sets (no invite phrase, live run or a replay when the
 * daily cap is reached) and the user's own photos (invite phrase). `?add=1` adds a product to the
 * store whose edit token the dashboard handed over in sessionStorage.
 */
export function CreateFlow() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const addMode = params.get("add") === "1";
  const [addToken] = useState(() => (addMode ? getSessionToken() : null));
  const [saved, setSaved] = useState<SavedRun | null>(() => (addMode ? null : getSavedRun()));
  const [screen, setScreen] = useState<Screen>(() => (addMode ? customEntry() : { name: "choice" }));

  // A new screen starts at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name]);

  // Re-check a phrase remembered from earlier in this tab before showing the capture screen.
  useEffect(() => {
    if (screen.name !== "checking") return;
    let cancelled = false;
    verifyAccessCode(getStoredCode() ?? "")
      .then(() => {
        if (!cancelled) setScreen({ name: "capture" });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 401) clearStoredCode();
        setScreen({ name: "gate" });
      });
    return () => {
      cancelled = true;
    };
  }, [screen.name]);

  const startRun = (run: SavedRun) => {
    saveRun(run);
    setSaved(run);
    setScreen({ name: "processing", run });
  };

  const restart = (run: SavedRun) => {
    clearSavedRun();
    setSaved(null);
    if (addMode) setScreen({ name: "capture" });
    else setScreen(run.origin === "sample" ? { name: "samples" } : customEntry());
  };

  const exitToStart = () => {
    if (addMode && addToken) navigate(`/edit/${addToken}`);
    else setScreen({ name: "choice" });
  };

  if (addMode && !addToken) {
    return (
      <>
        <Topbar />
        <EmptyState
          code={null}
          title={t("create.addMissingTitle")}
          body={t("create.addMissingBody")}
          action={
            <Link to="/" className={btn("primary")}>
              {t("store.backHome")}
            </Link>
          }
        />
      </>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.screens.includes(screen.name));

  return (
    <>
      <Topbar />
      <main className="grain relative flex justify-center px-4 pb-12 pt-4 sm:pt-8">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(194_98_63/0.14),transparent)]"
          aria-hidden="true"
        />
        <div className="w-full max-w-[480px] rounded-sheet border border-line bg-card px-5 pb-6 pt-5 shadow-lift sm:px-6">
          {addMode && <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.16em] text-terracotta-deep">{t("create.addEyebrow")}</p>}
          <nav className="mb-2" aria-label={t("create.progress")}>
            <ol className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <li
                  key={s.key}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                    i === stepIndex ? "bg-terracotta" : i < stepIndex ? "bg-terracotta/45" : "bg-paper-2"
                  }`}
                  aria-current={i === stepIndex ? "step" : undefined}
                >
                  <span className="sr-only">{t(s.key)}</span>
                </li>
              ))}
            </ol>
          </nav>
          <p className="mb-4 text-center text-sm text-ink-soft">
            {t("create.stepOf", { n: stepIndex + 1, total: STEPS.length })} · {t(STEPS[stepIndex].key)}
          </p>

          <div key={screen.name} className="animate-rise">
            {screen.name === "choice" && (
              <Choice
                saved={saved}
                onResume={() => saved && setScreen({ name: "processing", run: saved })}
                onSamples={() => setScreen({ name: "samples" })}
                onCustom={() => setScreen(customEntry())}
              />
            )}
            {screen.name === "samples" && <SampleGallery onPick={(sample) => setScreen({ name: "sample", sample })} onBack={() => setScreen({ name: "choice" })} />}
            {screen.name === "sample" && (
              <SampleDetail
                sample={screen.sample}
                onBack={() => setScreen({ name: "samples" })}
                onStarted={startRun}
                onReplay={(store, product) => setScreen({ name: "replay", store, product })}
              />
            )}
            {screen.name === "checking" && (
              <p className="py-10 text-center text-ink-soft" role="status">
                {t("gate.checking")}
              </p>
            )}
            {screen.name === "gate" && (
              <>
                <InviteGate onUnlocked={() => setScreen({ name: "capture" })} />
                <p className="mt-3 text-center">
                  <button type="button" className={btn("ghost", "sm")} onClick={exitToStart}>
                    {t("common.back")}
                  </button>
                </p>
              </>
            )}
            {screen.name === "capture" && (
              <Capture existingToken={addToken} onBack={exitToStart} onNeedCode={() => setScreen({ name: "gate" })} onStarted={startRun} />
            )}
            {screen.name === "processing" && (
              <Processing
                run={screen.run}
                onReady={() => setScreen({ name: "result", run: screen.run })}
                onRestart={() => restart(screen.run)}
              />
            )}
            {screen.name === "result" && (
              <Result
                run={screen.run}
                onPublished={(slug, wasPublished) => {
                  clearSavedRun();
                  setSaved(null);
                  setScreen({ name: "published", slug, token: screen.run.token, newStore: !addMode && !wasPublished });
                }}
              />
            )}
            {screen.name === "replay" && (
              <ReplayProcessing product={screen.product} onDone={() => setScreen({ name: "recorded", store: screen.store, product: screen.product })} />
            )}
            {screen.name === "recorded" && (
              <RecordedResult
                store={screen.store}
                product={screen.product}
                onSamples={() => setScreen({ name: "samples" })}
                onCustom={() => setScreen(customEntry())}
              />
            )}
            {screen.name === "published" && <Published slug={screen.slug} token={screen.token} newStore={screen.newStore} />}
          </div>
        </div>
      </main>
    </>
  );
}

/** Custom photos need the invite phrase: re-check a remembered one, otherwise ask for it. */
function customEntry(): Screen {
  return getStoredCode() ? { name: "checking" } : { name: "gate" };
}
