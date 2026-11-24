import type { Metadata } from "next";

// The client portal is shown under the Designscape name: no AXIS in the browser tab.
export const metadata: Metadata = {
  title: "Designscape",
  icons: { icon: "/branding/designscape-icon.png" },
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return children;
}
