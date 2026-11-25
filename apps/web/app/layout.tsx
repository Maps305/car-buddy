import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Car Buddy claims desk',
  description: 'Review and decide motor claims submitted through the Car Buddy WhatsApp assistant.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-ZW">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
