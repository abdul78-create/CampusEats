import { Navbar } from "@/components/ui/Navbar";
import { CheckoutFlow } from "@/features/checkout/CheckoutFlow";
import { FadeUp } from "@/components/motion/MotionPrimitives";
import { Heading, Lead } from "@/components/ui/Typography";

export const metadata = {
  title: "Your Tray",
  description: "Review multi-stall items, advance payment breakdown, and schedule pickup.",
};

export default function CartPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />

      <main id="main-content" className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16">
        <FadeUp className="mb-8">
          <Heading level={1} className="text-2xl sm:text-3xl mb-2">
            Your Food Tray &amp; Checkout
          </Heading>
          <Lead>
            Review your sub-orders across campus kitchens and confirm advance deposit.
          </Lead>
        </FadeUp>

        <CheckoutFlow />
      </main>
    </div>
  );
}
