import { LivenessVerification } from "@/features/liveness/LivenessVerification";
import { Navbar } from "@/components/ui/Navbar";
import { FadeUp } from "@/components/motion/MotionPrimitives";

export const metadata = {
  title: "Liveness Verification",
  description: "Complete your biometric active liveness challenge on CampusEats.",
};

export default function StudentLivenessPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />
      <main id="main-content" className="flex-1 p-4 sm:p-8 max-w-xl mx-auto w-full flex items-center justify-center">
        <FadeUp className="w-full">
          <LivenessVerification />
        </FadeUp>
      </main>
    </div>
  );
}
