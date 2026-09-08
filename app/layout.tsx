import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hand Slash Quiz',
  description: 'A futuristic Beat Saber style hand-gesture quiz game',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen w-screen bg-[#05060a] text-white overflow-hidden">
        {children}
      </body>
    </html>
  );
}
