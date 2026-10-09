import { LoginForm } from "@/features/auth/LoginForm";
import { Navbar } from "@/components/ui/Navbar";
import { FadeUp } from "@/components/motion/MotionPrimitives";

export const metadata = {
  title: "Sign In",
  description: "Sign in to your CampusEats account to order meals or manage stalls.",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />
      <main
        id="main-content"
        className="flex-1 flex items-center justify-center p-4 sm:p-6"
      >
        <FadeUp className="w-full max-w-md">
          <LoginForm />
        </FadeUp>
      </main>
    </div>
  );
}
