import { StudentProfileView } from "@/features/student/StudentProfileView";
import { Navbar } from "@/components/ui/Navbar";
import { FadeUp } from "@/components/motion/MotionPrimitives";

export const metadata = {
  title: "Student Profile",
  description: "View your CampusEats student profile and verification status.",
};

export default function StudentProfilePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />
      <main id="main-content" className="flex-1 p-4 sm:p-8 max-w-5xl mx-auto w-full">
        <FadeUp>
          <StudentProfileView />
        </FadeUp>
      </main>
    </div>
  );
}
