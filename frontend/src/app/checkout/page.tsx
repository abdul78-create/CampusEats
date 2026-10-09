import { Navbar } from "@/components/ui/Navbar";
import { CheckoutFlow } from "@/features/checkout/CheckoutFlow";
import { FadeUp } from "@/components/motion/MotionPrimitives";
import { Heading, Lead } from "@/components/ui/Typography";

export const metadata = {
  title: "Checkout",
  description: "Confirm advance deposit, schedule pickup time, and place your campus food order.",
};

export default function CheckoutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />

      <main id="main-content" className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16">
        <FadeUp className="mb-8 text-center sm:text-left">
          <Heading level={1} className="text-2xl sm:text-3xl mb-2">
            Checkout &amp; Pickup Scheduling
          </Heading>
          <Lead>
            Guaranteed preparation windows evaluated by backend kitchen queue capacity.
          </Lead>
        </FadeUp>

        <CheckoutFlow />
      </main>
    </div>
  );
}
