import { StallList } from "@/features/stalls/StallList";
import { Navbar } from "@/components/ui/Navbar";
import { FloatingCartButton } from "@/features/menu/FloatingCartButton";
import { CartDrawer } from "@/features/cart/CartDrawer";
import { FadeUp } from "@/components/motion/MotionPrimitives";
import { Heading, Lead } from "@/components/ui/Typography";

export const metadata = {
  title: "Campus Stalls",
  description: "Browse approved food stalls across campus, check live kitchen status, and order ahead.",
};

export default function StallsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />

      <main id="main-content" className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16">
        <FadeUp className="mb-10">
          <Heading level={1} className="text-3xl sm:text-4xl mb-2">
            Campus Dining Stalls
          </Heading>
          <Lead>
            Explore live food stalls, browse menus, and schedule guaranteed pickup windows.
          </Lead>
        </FadeUp>

        <StallList />
      </main>

      <FloatingCartButton />
      <CartDrawer />
    </div>
  );
}
