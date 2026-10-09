import { DocumentUpload } from "@/features/verification/DocumentUpload";
import { Navbar } from "@/components/ui/Navbar";
import { FadeUp } from "@/components/motion/MotionPrimitives";

export const metadata = {
  title: "Document Verification",
  description: "Upload your university identity document for CampusEats verification.",
};

export default function StudentVerificationPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />
      <main id="main-content" className="flex-1 p-4 sm:p-8 max-w-xl mx-auto w-full flex items-center justify-center">
        <FadeUp className="w-full">
          <DocumentUpload />
        </FadeUp>
      </main>
    </div>
  );
}
