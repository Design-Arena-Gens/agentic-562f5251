import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://agentic-562f5251.vercel.app"),
  title: "InstantTempMail · निजी और तेज़ टेम्प मेल",
  description:
    "एक क्लिक में प्राइवेट टेम्प मेल. रियल-टाइम इनबॉक्स, AI हेल्पर, वॉइस सपोर्ट और सुंदर ग्लास UI.",
  applicationName: "InstantTempMail",
  manifest: "/manifest.json",
  themeColor: "#0ea5a4",
  icons: [
    { rel: "icon", url: "/icon.svg" },
    { rel: "apple-touch-icon", url: "/icon.svg" },
  ],
  other: {
    "color-scheme": "dark light",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${poppins.variable} antialiased bg-surface text-slate-50`}
      >
        {children}
      </body>
    </html>
  );
}
