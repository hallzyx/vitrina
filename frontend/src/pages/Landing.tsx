import { MotionConfig } from "motion/react";
import { Topbar } from "../components/Chrome";
import { Hero } from "../landing/Hero";
import { CraftMarquee, DemoProof, Features, FinalCta, Fidelity, LandingFooter } from "../landing/Sections";
import { SpinStory } from "../landing/SpinStory";

export function Landing() {
  return (
    // "user": transform animations are skipped when the OS asks for reduced motion.
    <MotionConfig reducedMotion="user">
      <div className="overflow-x-clip">
        <Topbar cta dark />
        <main>
          <Hero />
          <CraftMarquee />
          <SpinStory />
          <Fidelity />
          <Features />
          <DemoProof />
          <FinalCta />
        </main>
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
