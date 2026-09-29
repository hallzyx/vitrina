import { Link } from "react-router-dom";
import { Footer, RealBadge, Topbar } from "../components/Chrome";
import { PieceThumb } from "../components/PieceThumb";
import { Viewer360 } from "../components/Viewer360";
import { BASKET, BOWL, VASE } from "../data/mock";
import { useI18n, type TKey } from "../i18n";

const STEPS: { icon: string; title: TKey; body: TKey }[] = [
  { icon: "📸", title: "landing.step1.title", body: "landing.step1.body" },
  { icon: "✨", title: "landing.step2.title", body: "landing.step2.body" },
  { icon: "💬", title: "landing.step3.title", body: "landing.step3.body" },
];

const FEATURES: { icon: string; title: TKey; body: TKey }[] = [
  { icon: "🔍", title: "landing.f1.title", body: "landing.f1.body" },
  { icon: "🔑", title: "landing.f2.title", body: "landing.f2.body" },
  { icon: "🌍", title: "landing.f3.title", body: "landing.f3.body" },
  { icon: "🟢", title: "landing.f4.title", body: "landing.f4.body" },
];

export function Landing() {
  const { t } = useI18n();
  return (
    <>
      <Topbar cta />
      <main>
        <section className="hero container">
          <div className="hero-copy">
            <p className="eyebrow">{t("landing.eyebrow")}</p>
            <h1>{t("landing.title")}</h1>
            <p className="lead">{t("landing.subtitle")}</p>
            <div className="hero-actions">
              <Link to="/create" className="btn btn-primary btn-lg">
                {t("nav.create")}
              </Link>
              <Link to="/s/example" className="btn btn-outline btn-lg">
                {t("nav.example")}
              </Link>
            </div>
            <RealBadge />
          </div>
          <div className="hero-demo">
            <div className="demo-card">
              <Viewer360 piece={VASE} showTabs={false} />
              <p className="demo-note">{t("landing.demoNote")}</p>
            </div>
            <div className="hero-thumbs" aria-hidden="true">
              <PieceThumb piece={BASKET} size={160} />
              <PieceThumb piece={BOWL} size={160} />
            </div>
          </div>
        </section>

        <section className="container section">
          <h2 className="section-title">{t("landing.howTitle")}</h2>
          <ol className="steps">
            {STEPS.map((step, i) => (
              <li key={step.title} className="step card">
                <span className="step-num">{i + 1}</span>
                <span className="step-icon" aria-hidden="true">
                  {step.icon}
                </span>
                <h3>{t(step.title)}</h3>
                <p>{t(step.body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="container section">
          <h2 className="section-title">{t("landing.featuresTitle")}</h2>
          <div className="features">
            {FEATURES.map((f) => (
              <article key={f.title} className="feature">
                <span className="feature-icon" aria-hidden="true">
                  {f.icon}
                </span>
                <div>
                  <h3>{t(f.title)}</h3>
                  <p>{t(f.body)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="container section">
          <div className="fidelity card">
            <h2>{t("landing.fidelityTitle")}</h2>
            <p>{t("landing.fidelityBody")}</p>
            <div className="fidelity-meter" aria-hidden="true">
              <span style={{ width: "93%" }} />
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="container">
            <h2>{t("landing.ctaBandTitle")}</h2>
            <Link to="/create" className="btn btn-light btn-lg">
              {t("nav.create")}
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
