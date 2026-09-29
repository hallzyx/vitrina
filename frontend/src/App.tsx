import { useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Topbar } from "./components/Chrome";
import { useI18n } from "./i18n";
import { CreateFlow } from "./pages/CreateFlow";
import { Dashboard } from "./pages/Dashboard";
import { Landing } from "./pages/Landing";
import { ProductPage } from "./pages/ProductPage";
import { Store } from "./pages/Store";

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
      <main className="container empty">
        <h1>{t("notfound.title")}</h1>
        <Link to="/" className="btn btn-primary">
          {t("store.backHome")}
        </Link>
      </main>
    </>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/create" element={<CreateFlow />} />
        <Route path="/s/:slug" element={<Store />} />
        <Route path="/s/:slug/:productId" element={<ProductPage />} />
        <Route path="/edit/:token" element={<Dashboard />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
