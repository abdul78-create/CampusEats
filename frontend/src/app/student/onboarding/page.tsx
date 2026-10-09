import { StudentOnboarding } from "@/features/student/StudentOnboarding";
import { Navbar } from "@/components/ui/Navbar";
import { FadeUp } from "@/components/motion/MotionPrimitives";

export const metadata = {
  title: "Student Onboarding",
  description: "Complete your identity document upload and liveness verification on CampusEats.",
};

export default function StudentOnboardingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />
      <main id="main-content" className="flex-1 p-4 sm:p-8 max-w-5xl mx-auto w-full">
        <FadeUp>
          <StudentOnboarding />
        </FadeUp>
      </main>
    </div>
  );
}
