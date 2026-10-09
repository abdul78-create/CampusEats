import { RegisterForm } from "@/features/auth/RegisterForm";
import { Navbar } from "@/components/ui/Navbar";
import { FadeUp } from "@/components/motion/MotionPrimitives";

export const metadata = {
  title: "Register",
  description: "Create a new student account on CampusEats to pre-order campus meals.",
};

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />
      <main
        id="main-content"
        className="flex-1 flex items-center justify-center p-4 sm:p-6"
      >
        <FadeUp className="w-full max-w-lg">
          <RegisterForm />
        </FadeUp>
      </main>
    </div>
  );
}
