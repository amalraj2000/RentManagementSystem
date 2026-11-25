import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Loveshore", template: "%s · Loveshore" }, description: "Loveshore — ladies' PG: rent, bills and notices", robots: { index: false, follow: false }, applicationName: "Loveshore", appleWebApp: { capable: true, title: "Loveshore", statusBarStyle: "default" }, icons: { apple: "/apple-icon.png" }, formatDetection: { telephone: false } };
export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        {children}
        <SwRegister />
        {/* Same look as the rest of the app: white card, thin border, a coloured edge for success / error. */}
        <Toaster
          position="top-center"
          offset={16}
          mobileOffset={12}
          duration={4000}
          toastOptions={{
            classNames: {
              toast: "!rounded-xl !border !border-line !bg-white !px-4 !py-3 !text-sm !font-medium !text-ink !shadow-lg !gap-3 !border-l-4",
              success: "!border-l-emerald-500 [&_[data-icon]]:!text-emerald-600",
              error: "!border-l-red-500 [&_[data-icon]]:!text-red-600",
              info: "!border-l-sky-500",
              warning: "!border-l-amber-500",
              title: "!text-sm !font-medium !leading-snug",
            },
          }}
        />
      </body>
    </html>
  );
}
