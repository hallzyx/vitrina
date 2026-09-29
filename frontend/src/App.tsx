import { lazy, Suspense, useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { EmptyState, Topbar } from "./components/Chrome";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { btn } from "./components/ui";
import { useI18n } from "./i18n";

// Route-level code splitting: each screen (and three.js, inside the landing) loads on demand.
const Landing = lazy(() => import("./pages/Landing").then((m) => ({ default: m.Landing })));
const CreateFlow = lazy(() => import("./pages/CreateFlow").then((m) => ({ default: m.CreateFlow })));
const Store = lazy(() => import("./pages/Store").then((m) => ({ default: m.Store })));
const ProductPage = lazy(() => import("./pages/ProductPage").then((m) => ({ default: m.ProductPage })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  const { t } = useI18n();
  return (
    <>
      <Topbar />
      <EmptyState
        title={t("notfound.title")}
        action={
          <Link to="/" className={btn("primary")}>
            {t("store.backHome")}
          </Link>
        }
      />
    </>
  );
}

/** Shown for a split second while a route chunk loads. Keeps the page height stable. */
function RouteFallback() {
  return (
    <div className="grid min-h-svh place-items-center" aria-busy="true">
      <span className="size-9 animate-spin rounded-full border-[3px] border-sand border-t-terracotta" />
    </div>
  );
}

/** Last line of defense: a failed chunk load (e.g. after a redeploy) offers a reload instead of a blank page. */
function CrashScreen() {
  const { t } = useI18n();
  return (
    <>
      <Topbar />
      <main className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
        <div>
          <h1 className="mb-6 text-3xl sm:text-4xl">{t("error.title")}</h1>
          <button type="button" className={btn("primary")} onClick={() => window.location.reload()}>
            {t("error.reload")}
          </button>
        </div>
      </main>
    </>
  );
}

export default function App() {
  const { pathname } = useLocation();
  return (
    <>
      <ScrollToTop />
      <ErrorBoundary key={pathname} fallback={<CrashScreen />}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/create" element={<CreateFlow />} />
            <Route path="/s/:slug" element={<Store />} />
            <Route path="/s/:slug/:productId" element={<ProductPage />} />
            <Route path="/edit/:token" element={<Dashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
