import { colors } from "@kaspilo/tokens";
import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import type { CSSProperties } from "react";

import { AdminAuthProvider } from "@/auth/AdminAuth";

import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
});

export const metadata: Metadata = {
  title: "Kaspilo Admin",
  description: "Kaspilo admin dashboard",
};

const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Shared tokens -> CSS variables. The admin dashboard is light theme only. */
const tokenVars = Object.fromEntries(
  Object.entries(colors.light).map(([key, value]) => [
    `--kaspilo-${kebab(key)}`,
    value,
  ]),
) as CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${rubik.variable} h-full antialiased`}
      style={tokenVars}
    >
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body>
          before React loads; ignore those, this level only. */}
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </body>
    </html>
  );
}
